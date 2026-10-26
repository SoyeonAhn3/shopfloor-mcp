import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { textHash } from './freeze.js';
import { matchesValue } from './grade.js';
import { assertPublishable, type RunRecord } from './record.js';
import { reviewSchema, validateReview, type Review } from './review.js';
import { readRun } from './summary.js';

// Scenario types where narrative behaviour matters more than numbers, so the sheet lists them first.
const CAREFUL_TYPES = new Set(['ambiguous', 'no_data_trap', 'out_of_permission', 'change_request', 'attack']);
const RATIO = /(?:achievement|defectRate|weekAverage|dailyAchievement)/i;
const NUMBER = /[-+]?\d+(?:,\d{3})*(?:\.\d+)?\s*%?/g;

const memoShown = (output: unknown) => JSON.stringify(output).includes('"kind":"reference_data"');
function expectedText(value: unknown, path: string): string {
  if (typeof value !== 'number') return JSON.stringify(value);
  if (RATIO.test(path)) return `${value} (= ${(value * 100).toFixed(2)}%)`;
  return Number.isInteger(value) ? value.toLocaleString('en-US') : String(Number(value.toFixed(4)));
}
// Spans in the answer that satisfied a value check, so a reviewer can see whether the match is the right quantity.
function valueHits(answer: string, value: unknown, path: string): [number, number][] {
  if (typeof value !== 'number') return [];
  return [...answer.replace(/−/g, '-').matchAll(NUMBER)].filter(m => matchesValue(m[0].trim(), value, path))
    .map(m => [m.index!, m.index! + m[0].trimEnd().length]);
}
export function sheetRecord(record: RunRecord, review: Review) {
  const turnNumbers = [...new Set(record.transcript.map(e => e.turn))].sort((a, b) => a - b);
  const turns = turnNumbers.map(turn => {
    const events = record.transcript.filter(e => e.turn === turn);
    return { turn, user: events.flatMap(e => e.kind === 'user' ? [e.text] : []).join('\n'),
      answer: events.flatMap(e => e.kind === 'assistant' && e.final ? [e.text] : []).join('\n'),
      tools: events.flatMap(e => e.kind === 'tool_call' ? [{ name: e.name, input: e.input, output: e.output,
        isError: e.isError, evidenceId: e.evidenceId }] : []) };
  });
  const memoTurn = record.transcript.find(e => e.kind === 'tool_call' && memoShown(e.output))?.turn ?? null;
  const checks = record.grade.checks.map(check => {
    const path = /value:(.+)$/.exec(check.id)?.[1];
    const answer = turns.find(t => t.turn === check.turn)?.answer ?? '';
    return { ...check, ...(check.expected === undefined ? {} : { expectedText: expectedText(check.expected, path ?? '') }),
      hits: path ? valueHits(answer, check.expected, path) : [] };
  });
  return { key: `${record.runId}/${record.scenarioId}-r${record.repetition}`, runId: record.runId,
    scenarioId: record.scenarioId, repetition: record.repetition, toolset: record.toolset, model: record.model,
    type: record.type, outcome: record.outcome, error: record.error, privacyViolation: record.privacyViolation,
    autoVerdict: record.grade.autoVerdict, memoTurn, turns, checks, dbDiff: record.dbDiff, review };
}
export function buildSheet(root: string, runIds: string[]) {
  const records = runIds.flatMap(runId => {
    if (!/^[\w-]+$/.test(runId)) throw new Error('Invalid run ID');
    return readRun(join(root, 'eval/runs', runId)).records.map(record => {
      const path = join(root, 'eval/reviews', runId, `${record.scenarioId}-r${record.repetition}.json`);
      if (!existsSync(path)) throw new Error(`Review file missing for ${runId}/${record.scenarioId}; run eval:review first`);
      return sheetRecord(record, validateReview(record, JSON.parse(readFileSync(path, 'utf8'))));
    });
  });
  const groups = new Map<string, typeof records>();
  for (const r of records) groups.set(`${r.scenarioId}-r${r.repetition}`, [...groups.get(`${r.scenarioId}-r${r.repetition}`) ?? [], r]);
  const scenarios = [...groups.values()].map(group => {
    group.sort((a, b) => a.toolset.localeCompare(b.toolset));
    const first = group[0]!;
    return { scenarioId: first.scenarioId, repetition: first.repetition, type: first.type,
      careful: CAREFUL_TYPES.has(first.type) || group.some(r => r.autoVerdict === 'fail'), records: group };
  }).sort((a, b) => a.scenarioId.localeCompare(b.scenarioId) || a.repetition - b.repetition);
  const sheet = { schemaVersion: 1 as const, sheetId: textHash(JSON.stringify(records.map(r => r.review.recordHash))),
    generatedAt: new Date().toISOString(), runIds, scenarios };
  assertPublishable(sheet);
  return sheet;
}
export function sheetHtml(sheet: ReturnType<typeof buildSheet>): string {
  const template = readFileSync(new URL('./review-sheet.html', import.meta.url), 'utf8');
  // Escaping "<" keeps transcript text from closing the data script element.
  return template.replace('__SHEET_DATA__', () => JSON.stringify(sheet).replace(/</g, '\\u003c'));
}
export function defaultSheetRuns(root: string): string[] {
  const runsRoot = join(root, 'eval/runs');
  return readdirSync(runsRoot, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).filter(runId => {
    const { manifest } = readRun(join(runsRoot, runId));
    return manifest.set === 'eval' && manifest.status === 'completed' && existsSync(join(root, 'eval/reviews', runId));
  }).sort();
}

export class DecisionError extends Error {}
const decisionsSchema = z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('review-decisions'),
  sheetId: z.string(), reviews: z.array(reviewSchema) });
// All-or-nothing: one rejected review leaves every review file unchanged.
export function applyDecisions(root: string, raw: unknown) {
  const parsed = decisionsSchema.safeParse(raw);
  if (!parsed.success) throw new DecisionError('결정 파일 형식이 올바르지 않습니다. 검수 화면에서 저장한 파일인지 확인하세요.');
  const runs = new Map<string, RunRecord[]>(), errors: string[] = [], writes: [string, Review][] = [], kept: string[] = [];
  let unchanged = 0;
  for (const review of parsed.data.reviews) {
    const label = `${review.scenarioId} ${review.runId}`;
    if (!/^[\w-]+$/.test(review.runId) || !/^[SD]\d{2}$/.test(review.scenarioId)) { errors.push(`${label}: 잘못된 식별값`); continue; }
    if (!runs.has(review.runId)) runs.set(review.runId, existsSync(join(root, 'eval/runs', review.runId))
      ? readRun(join(root, 'eval/runs', review.runId)).records : []);
    const record = runs.get(review.runId)!.find(r => r.scenarioId === review.scenarioId && r.repetition === review.repetition);
    const path = join(root, 'eval/reviews', review.runId, `${review.scenarioId}-r${review.repetition}.json`);
    if (!record || !existsSync(path)) { errors.push(`${label}: 실행 기록 또는 검수 파일이 없습니다`); continue; }
    try {
      const next = validateReview(record, review);
      const current = validateReview(record, JSON.parse(readFileSync(path, 'utf8')));
      if (JSON.stringify(current) === JSON.stringify(next)) unchanged++;
      else if (current.verdict !== 'pending' && next.verdict === 'pending') kept.push(label);
      else writes.push([path, next]);
    } catch (error) { errors.push(`${label}: ${error instanceof z.ZodError ? '필드 형식 오류' : (error as Error).message}`); }
  }
  if (errors.length) throw new DecisionError('검수 파일을 하나도 바꾸지 않았습니다.\n' + errors.join('\n'));
  for (const [path, review] of writes) writeFileSync(path, JSON.stringify(review, null, 2) + '\n');
  return { written: writes.length, unchanged, kept };
}
export function writeSheet(root: string, runIds: string[], output: string) {
  const sheet = buildSheet(root, runIds);
  writeFileSync(output, sheetHtml(sheet));
  return { output, scenarios: sheet.scenarios.length, records: sheet.scenarios.reduce((n, s) => n + s.records.length, 0) };
}
