import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { textHash } from '../src/eval/freeze.js';
import { assertPublishable, recordHash, type RunRecord } from '../src/eval/record.js';
import { validateReview, type Review } from '../src/eval/review.js';
import { memoShown, sheetRecord } from '../src/eval/sheet.js';
import { buildSummary, readRun } from '../src/eval/summary.js';
import { SCENARIO_TYPES, TOOLSETS, type CheckView, type RecordView, type ResultCell, type ScenarioDetail,
  type ScenarioType, type SiteIndex, type Step, type Toolset, type ToolsetSummary, type TurnView } from '../site/src/types.js';

export const REPO_URL = 'https://github.com/SoyeonAhn3/shopfloor-mcp';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_ITEMS = 12, MAX_TEXT = 4000;
const toolsSchema = z.array(z.object({ name: z.string(), description: z.string() }));

export class SiteDataError extends Error {}
type Loaded = { record: RunRecord; review: Review };

// Long arrays and strings are cut so the page stays light; the full record is linked from every scenario.
export function trimOutput(value: unknown): { value: unknown; omitted: number } {
  let omitted = 0;
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (v.length <= MAX_TEXT) return v;
      omitted++; return v.slice(0, MAX_TEXT) + '…';
    }
    if (Array.isArray(v)) {
      const kept = v.slice(0, MAX_ITEMS).map(visit);
      if (v.length > MAX_ITEMS) { omitted += v.length - MAX_ITEMS; kept.push(`… +${v.length - MAX_ITEMS}`); }
      return kept;
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x)]));
    return v;
  };
  return { value: visit(value), omitted };
}
const field = (value: unknown, key: string) => {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  return typeof v === 'string' ? v : null;
};
const toolLabel = (name: string, input: unknown) => { const mode = field(input, 'mode'); return mode ? `${name}(${mode})` : name; };
const forbiddenViolations = ({ record, review }: Loaded) => record.grade.checks.filter(c => c.id.includes('forbidden:')
  && (review.checks.find(h => h.id === c.id)?.verdict ?? c.status) === 'fail').length;

function recordView({ record, review }: Loaded): RecordView {
  const sheet = sheetRecord(record, review);
  const turns: TurnView[] = sheet.turns.map(t => ({ turn: t.turn, question: t.user, answer: t.answer,
    marks: sheet.checks.filter(c => c.turn === t.turn).flatMap(c => c.hits),
    steps: record.transcript.filter(e => e.turn === t.turn).flatMap((e): Step[] => {
      if (e.kind === 'assistant' && !e.final) return [{ kind: 'message', text: e.text }];
      if (e.kind !== 'tool_call') return [];
      const { value, omitted } = trimOutput(e.output);
      return [{ kind: 'tool', name: e.name, mode: field(e.input, 'mode'), input: e.input, summary: field(e.output, 'summary'),
        status: field(e.output, 'status'), evidenceId: e.evidenceId, isError: e.isError, ms: e.ms, memo: memoShown(e.output),
        output: value, omitted }];
    }) }));
  const checks: CheckView[] = sheet.checks.map(c => {
    const human = review.checks.find(h => h.id === c.id)!;
    return { id: c.id, turn: c.turn, auto: c.status, human: human.verdict, detail: c.detail,
      expected: c.expectedText ?? null, note: human.note };
  });
  const file = `${record.runId}/${record.scenarioId}-r${record.repetition}.json`;
  const { usage, dbDiff } = record;
  return { toolset: record.toolset, runId: record.runId, recordUrl: `${REPO_URL}/blob/main/eval/runs/${file}`,
    reviewUrl: `${REPO_URL}/blob/main/eval/reviews/${file}`, outcome: record.outcome, error: record.error,
    autoVerdict: record.grade.autoVerdict,
    review: { verdict: review.verdict, reviewer: review.reviewer, reviewedAt: review.reviewedAt, note: review.note },
    turns, checks, dbDiff: { issues: dbDiff.issues, draftsCreated: dbDiff.draftsCreated, auditRows: dbDiff.auditRows },
    usage: { modelCalls: usage.modelCalls, toolCalls: usage.toolCalls, inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens, ms: usage.ms, estimatedCostUsd: usage.estimatedCostUsd } };
}
function resultCell(loaded: Loaded): ResultCell {
  const { record, review } = loaded;
  return { verdict: review.verdict, autoVerdict: record.grade.autoVerdict, toolCalls: record.usage.toolCalls,
    tools: record.transcript.flatMap(e => e.kind === 'tool_call' ? [toolLabel(e.name, e.input)] : []),
    forbiddenViolations: forbiddenViolations(loaded), inputTokens: record.usage.inputTokens,
    outputTokens: record.usage.outputTokens, ms: record.usage.ms };
}

// Only a human-reviewed pair of full eval runs under matching conditions (as decided by eval:summary) is published.
export function buildSiteData(root = ROOT, runIds?: string[]) {
  const summary = buildSummary(root);
  const pairs = summary.comparisons.filter(c => c.humanReviewComplete
    && (!runIds || (runIds.includes(c.coarseRun) && runIds.includes(c.fineRun))));
  if (!pairs.length) throw new SiteDataError('사람 검수가 끝난 같은 조건의 평가 실행 쌍(coarse·fine, 30개씩)이 없습니다. eval:summary 결과를 확인하세요.');
  if (pairs.length > 1) throw new SiteDataError('게시할 실행 쌍이 여러 개입니다. --runs <coarseRun>,<fineRun>으로 지정하세요.\n'
    + pairs.map(p => `${p.coarseRun},${p.fineRun}`).join('\n'));
  const pair = pairs[0]!;
  const runs = { coarse: pair.coarseRun, fine: pair.fineRun } satisfies Record<Toolset, string>;
  const loaded = Object.fromEntries(TOOLSETS.map(toolset => {
    const { manifest, records } = readRun(join(root, 'eval/runs', runs[toolset]));
    if (manifest.repeat !== 1) throw new SiteDataError('반복 실행(--repeat > 1) 기록은 아직 페이지에 표시할 수 없습니다.');
    return [toolset, records.map(record => ({ record, review: validateReview(record, JSON.parse(readFileSync(
      join(root, 'eval/reviews', record.runId, `${record.scenarioId}-r${record.repetition}.json`), 'utf8'))) }))];
  })) as Record<Toolset, Loaded[]>;
  const all = TOOLSETS.flatMap(t => loaded[t]);
  const first = loaded.coarse[0]!.record;
  const toolsets: ToolsetSummary[] = TOOLSETS.map(toolset => {
    const run = summary.runs.find(r => r.runId === runs[toolset])!, items = loaded[toolset];
    const byType = Object.fromEntries(SCENARIO_TYPES.map(type => {
      const stats = run.byType[type];
      if (!stats) throw new SiteDataError(`시나리오 유형 ${type}의 집계가 없습니다.`);
      return [type, { count: stats.count, passed: stats.reviewedPasses }];
    })) as Record<ScenarioType, { count: number; passed: number }>;
    return { toolset, runId: run.runId, startedAt: run.startedAt, finishedAt: run.finishedAt ?? run.startedAt,
      count: run.count, passed: run.reviewedPasses, finalPassRate: run.finalPassRate,
      forbiddenViolations: items.reduce((n, l) => n + forbiddenViolations(l), 0),
      issueChanges: items.reduce((n, { record: { dbDiff: { issues } } }) => n + issues.added + issues.updated + issues.deleted, 0),
      draftsCreated: items.reduce((n, l) => n + l.record.dbDiff.draftsCreated, 0),
      meanToolCalls: run.meanToolCalls, meanMs: run.meanMs, inputTokens: run.inputTokens, outputTokens: run.outputTokens,
      estimatedCostUsd: run.estimatedCostUsd,
      byType, tools: toolsSchema.parse(items[0]!.record.tools).map(({ name, description }) => ({ name, description })) };
  });
  const ids = [...new Set(all.map(l => l.record.scenarioId))].sort();
  const pick = (toolset: Toolset, id: string) => {
    const found = loaded[toolset].find(l => l.record.scenarioId === id);
    if (!found) throw new SiteDataError(`${toolset} 실행에 ${id} 기록이 없습니다.`);
    return found;
  };
  const scenarios = ids.map(id => {
    const records = { coarse: pick('coarse', id), fine: pick('fine', id) };
    const { record } = records.coarse;
    const turns = record.transcript.filter(e => e.kind === 'user');
    return {
      row: { scenarioId: id, type: record.type, question: turns[0]?.text ?? '', turns: turns.length,
        results: { coarse: resultCell(records.coarse), fine: resultCell(records.fine) } },
      detail: { schemaVersion: 1, scenarioId: id, type: record.type, role: record.role,
        records: { coarse: recordView(records.coarse), fine: recordView(records.fine) } } satisfies ScenarioDetail,
    };
  });
  const index: SiteIndex = { schemaVersion: 1, repoUrl: REPO_URL,
    sourceHash: textHash(JSON.stringify(all.map(l => [recordHash(l.record), l.review]))),
    conditions: { model: first.model, datasetVersion: first.datasetVersion, scenarioSetHash: first.scenarioSetHash,
      descriptionsHash: first.descriptionsHash, policyHash: first.policyHash, graderHash: first.graderHash, repeat: 1,
      limits: first.limits, pricing: first.pricing,
      systemPrompts: [...new Map(all.map(l => [l.record.systemPrompt, l.record.role])).entries()]
        .map(([text, role]) => ({ role, text })).sort((a, b) => a.role.localeCompare(b.role)),
      reviewers: [...new Set(all.flatMap(l => l.review.reviewer ? [l.review.reviewer] : []))].sort() },
    toolsets, scenarios: scenarios.map(s => s.row) };
  return { index, details: scenarios.map(s => s.detail) };
}

export function siteFiles(root = ROOT, runIds?: string[]): Map<string, string> {
  const { index, details } = buildSiteData(root, runIds);
  const files = new Map([['index.json', index] as [string, unknown], ...details.map(d => [`scenarios/${d.scenarioId}.json`, d] as [string, unknown])]);
  return new Map([...files].map(([path, value]) => {
    assertPublishable(value);
    return [path, JSON.stringify(value, null, 2) + '\n'];
  }));
}
const existing = (outDir: string) => existsSync(join(outDir, 'scenarios'))
  ? readdirSync(join(outDir, 'scenarios')).filter(f => f.endsWith('.json')).map(f => `scenarios/${f}`) : [];
// Git may check the files out with CRLF on Windows; content, not line endings, decides staleness.
export function staleSiteFiles(files: Map<string, string>, outDir: string): string[] {
  const read = (path: string) => readFileSync(join(outDir, path), 'utf8').replace(/\r\n/g, '\n');
  return [...[...files].filter(([path, text]) => !existsSync(join(outDir, path)) || read(path) !== text).map(([path]) => path),
    ...existing(outDir).filter(path => !files.has(path))].sort();
}
export function writeSiteFiles(files: Map<string, string>, outDir: string): void {
  mkdirSync(join(outDir, 'scenarios'), { recursive: true });
  for (const path of existing(outDir)) if (!files.has(path)) rmSync(join(outDir, path));
  for (const [path, text] of files) writeFileSync(join(outDir, path), text);
}

function main() {
  try {
    const { values } = parseArgs({ strict: true, options: { check: { type: 'boolean' }, runs: { type: 'string' } } });
    const files = siteFiles(ROOT, values.runs?.split(','));
    const outDir = resolve(ROOT, 'site/data');
    if (values.check) {
      const stale = staleSiteFiles(files, outDir);
      if (stale.length) throw new SiteDataError('site/data가 평가 기록과 다릅니다. npm run site:data로 다시 만드세요.\n' + stale.join('\n'));
      console.log(`site/data matches the evaluation records (${files.size} files)`);
    } else {
      writeSiteFiles(files, outDir);
      console.log(`Wrote ${files.size} files to site/data`);
    }
  } catch (error) {
    console.error(error instanceof SiteDataError ? error.message : `페이지 데이터를 만들지 못했습니다: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
