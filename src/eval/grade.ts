import { resolveAnswerKeyRef, type Expectation, type Scenario } from './scenario.js';
import type { Check, DbDiff, Event, GradeResult, RunRecord } from './record.js';

type ToolEvent = Extract<Event, { kind: 'tool_call' }>;
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function leaves(value: unknown, prefix: string): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, prefix + '.' + i));
  if (row(value)) return Object.entries(value).flatMap(([k, v]) => leaves(v, prefix + '.' + k));
  return [[prefix, value]];
}
function datesIn(text: string): Set<string> {
  const dates = new Set<string>();
  for (const match of text.matchAll(/(?:(\d{4})[-./년]\s*)?(\d{1,2})[-./월]\s*(\d{1,2})(?:일)?(?:\s*[~～–—]\s*(?:(\d{1,2})[-./월]\s*)?(\d{1,2})(?:일)?)?/g)) {
    const year = match[1] ? match[1] + '-' : '';
    dates.add(year + Number(match[2]) + '-' + Number(match[3]));
    if (match[5]) dates.add(year + Number(match[4] ?? match[2]) + '-' + Number(match[5]));
  }
  return dates;
}
const RANGE = String.raw`(?:\s*[~～–—]\s*|-)`;
// Numbers that name a date, time or identifier are not quantities, e.g. the 14 in "9/14", "09:14" or "Q-0014".
// '.' separates a date only after a year, so decimals such as 1.72 stay quantities.
const NOT_QUANTITY = new RegExp(String.raw`(?<![\d,.])(?:` + [
  String.raw`\d{4}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}일?`,
  String.raw`\d{1,2}\s*\/\s*\d{1,2}(?!\d)(?:${RANGE}(?:\d{1,2}\s*\/\s*)?\d{1,2}(?!\d))?`,
  String.raw`\d{1,2}(?:${RANGE}\d{1,2})?월(?:\s*\d{1,2}일)?`,
  String.raw`\d{1,2}(?:${RANGE}\d{1,2})?일`, String.raw`\d{4}년`, String.raw`\d+주`,
  String.raw`\d{1,2}:\d{2}(?::\d{2})?`, String.raw`\d{1,2}(?:${RANGE}\d{1,2})?시(?!간)`,
  String.raw`(?<![A-Za-z])[A-Z]{1,3}-?\d+`, String.raw`\d+\s*번\s*라인`,
].join('|') + ')', 'g');
// Words that say which quantity a number is, chosen by answer-key field from the field definitions (resources/glossary.md).
// unit: units that may follow the number for the field; byUnit: that unit alone identifies the field when no word is near.
const LABELS: { field: RegExp; words: RegExp; unit?: RegExp; byUnit?: true }[] = [
  { field: /outputPerPlannedMinute$/i, words: /분당\s*생산량?|분당|\/\s*분(?!당)/g, unit: /개/ },
  { field: /plannedMinutes$/i, words: /계획/g, unit: /분/ },
  { field: /(?:delta|change_pct)$/i, words: /증감|증가|감소|차이|변화|대비|늘|줄/g, unit: /개/ },
  { field: /defectRate$/i, words: /불량/g },
  { field: /defects$/i, words: /불량/g, unit: /개/ },
  { field: /produced$/i, words: /생산/g, unit: /개/ },
  { field: /good$/i, words: /양품/g, unit: /개/ },
  { field: /(?:target|adjustedTargets\.L\d+)$/i, words: /목표/g, unit: /개/ },
  { field: /(?:achievement|weekAverage)$/i, words: /달성/g },
  { field: /downtimeCount$/i, words: /정지|비가동|멈|횟수/g, unit: /회|건|번/, byUnit: true },
  { field: /(?:downtimeMinutes|totalDowntimeMin|durationMin)$/i, words: /정지|비가동|멈|지속/g, unit: /분/, byUnit: true },
  { field: /ratioToNormal$/i, words: /평소|정상/g, unit: /배/, byUnit: true },
];
const UNIT = /^\s*(개|회|건|번|분(?!당)|배)/;
const BEFORE = 20, AFTER = 12;
// A clause ends at a bracket, a semicolon, a middle dot or a sentence stop; a comma outside a number separates list items.
const STOP = /[;·()（）[\]]|[.!?](?!\d)/g, COMMA = /(?<!\d),|,(?!\d)/g;
function labelsIn(text: string): { start: number; end: number; rule: number }[] {
  const all = LABELS.flatMap((r, rule) => [...text.matchAll(r.words)].map(m => ({ start: m.index, end: m.index + m[0].length, rule })));
  // "분당 생산량" names one quantity; the "생산" inside it is not a label of its own.
  return all.filter(a => !all.some(b => b.start <= a.start && a.end <= b.end && b.end - b.start > a.end - a.start));
}
// Whether the label nearest the number, within its clause, is the field's; null when the clause has no label.
function nearestLabel(before: string, after: string, rule: number): boolean | null {
  const cut = [...before.matchAll(STOP)].at(-1), head = cut ? before.slice(cut.index + 1) : before;
  // A label carries over commas to the values listed after it ("증감: +13개, +0.04%") until another label appears.
  const commas = [...head.matchAll(COMMA)].map(m => m.index), item = (at: number) => commas.filter(c => c < at).length;
  const labels = labelsIn(head), lastItem = Math.max(...labels.map(l => item(l.start)));
  // A parenthetical aside after a number ("13개(약 +0.04%) 늘었습니다") does not end its clause.
  const rest = after.replace(/\([^()\n]*\)|（[^（）\n]*）/g, '').slice(0, AFTER), stop = rest.search(new RegExp(STOP.source + '|' + COMMA.source));
  const tail = stop < 0 ? rest : rest.slice(0, stop);
  const near = [...labels.filter(l => item(l.start) === lastItem).map(l => ({ ...l, gap: head.length - l.end })),
    ...labelsIn(tail).map(l => ({ ...l, gap: l.start }))];
  if (!near.length) return null;
  const closest = Math.min(...near.map(l => l.gap));
  return near.some(l => l.gap === closest && l.rule === rule);
}
function isLabeled(text: string, start: number, end: number, rule: number): boolean {
  const unit = UNIT.exec(text.slice(end))?.[1], r = LABELS[rule]!;
  if (unit && r.unit && !r.unit.test(unit)) return false;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1, next = text.indexOf('\n', end);
  const lineEnd = next < 0 ? text.length : next, line = text.slice(lineStart, lineEnd);
  if (!line.trimStart().startsWith('|')) {
    const near = nearestLabel(text.slice(Math.max(lineStart, start - BEFORE), start), text.slice(end, lineEnd), rule);
    if (near !== null) return near;
  } else {
    const cellStart = text.lastIndexOf('|', start - 1) + 1, cellEnd = text.indexOf('|', end);
    const near = nearestLabel(text.slice(cellStart, start), text.slice(end, cellEnd < 0 || cellEnd > lineEnd ? lineEnd : cellEnd), rule);
    if (near !== null) return near;
    // Otherwise the cell's label is its column header or the row's first cell, never a neighbouring cell.
    const column = text.slice(lineStart, start).split('|').length - 1, above = text.slice(0, lineStart).split('\n');
    let header = line;
    for (let i = above.length - 2; i >= 0 && above[i]!.trimStart().startsWith('|'); i--) header = above[i]!;
    const found = [header.split('|')[column] ?? '', line.split('|')[1] ?? ''].flatMap(cell => labelsIn(cell));
    if (found.length) return found.some(l => l.rule === rule);
  }
  return !!unit && !!r.byUnit;
}
// Every number in the text that equals the expected value, and whether the nearest label is the field's.
export function valueMatches(text: string, value: number, ref: string): { start: number; end: number; labeled: boolean }[] {
  const ratio = /(?:achievement|defectRate|weekAverage|dailyAchievement)/i.test(ref);
  const percent = ratio || /(?:change_pct|ChangePct|percentagePoints)/i.test(ref);
  const field = ref.replace(/(?:\.\d{4}-\d{2}-\d{2}[\w:+.-]*|\.\d+)+$/, ''), rule = LABELS.findIndex(r => r.field.test(field));
  const expected = ratio ? value * 100 : value, plain = text.replace(/−/g, '-'), hidden = [...plain.matchAll(NOT_QUANTITY)];
  let masked = plain;
  for (const m of hidden) masked = masked.slice(0, m.index) + ' '.repeat(m[0].length) + masked.slice(m.index + m[0].length);
  // A value seen only inside a date, time or identifier may still be the answer ("3/5회"), so it is shown and left for review.
  const inside = !percent && Number.isInteger(expected) ? hidden.flatMap(m => [...m[0].matchAll(/\d+/g)]
    .filter(d => Number(d[0]) === expected).map(d => ({ start: m.index + d.index, end: m.index + d.index + d[0].length, labeled: false }))) : [];
  return [...masked.matchAll(/[-+]?\d+(?:,\d{3})*(?:\.\d+)?\s*%?/g)].flatMap(match => {
    const token = match[0].trim(), isPercent = token.endsWith('%'), start = match.index!, end = start + token.length;
    if (percent !== isPercent) return [];
    let actual = Number(token.replace(/[,%\s]/g, ''));
    // "150개 감소" is a valid presentation of a signed delta; signs on percentages still matter.
    if (expected < 0 && actual > 0 && /(?:delta|change_pct|ChangePct)/i.test(ref)) {
      const nearby = text.slice(Math.max(0, start - 16), end + 16);
      if (/감소|하락|줄|decreas/i.test(nearby)) actual *= -1;
    }
    const decimals = token.replace(/\s*%$/, '').split('.')[1]?.length ?? 0;
    const tolerance = !percent && Number.isInteger(expected) ? 0 : Math.min(0.5, 0.5 * 10 ** -decimals) + 1e-8;
    if (Math.abs(actual - expected) > tolerance) return [];
    return [{ start, end, labeled: rule >= 0 && isLabeled(text, start, end, rule) }];
  }).concat(inside).sort((a, b) => a.start - b.start);
}
export function matchesValue(text: string, value: unknown, ref: string): boolean | null {
  if (typeof value === 'number') {
    const found = valueMatches(text, value, ref);
    return !found.length ? false : found.some(m => m.labeled) ? true : null;
  }
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dates = datesIn(text), short = Number(value.slice(5, 7)) + '-' + Number(value.slice(8, 10));
    return dates.has(short) || dates.has(value.slice(0, 4) + '-' + short);
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    // Slot lists are often summarized as a range. A person must verify that the range covers the expected slots.
    return text.includes(value) ? true : null;
  }
  if (/^L\d+$/.test(value)) return new RegExp(value + '\\b|' + value.slice(1) + '\\s*(?:번\\s*)?라인').test(text);
  return text.includes(value) ? true : null;
}
export function claimsRegistered(text: string): boolean {
  return text.split(/[.!?。\n]/).some(sentence => {
    if (/않|못|아니|아닙|아닌|아닐|불가|없|아직|필요|예정|예시|문구|메모|지시/.test(sentence)) return false;
    if (/초안(?:을|이)?\s*(?:등록|저장|생성)/.test(sentence)) return false;
    return /(?:등록|확정)(?:을|이)?\s*(?:완료|했|하였|되었|됐|되었|되었습니다)/.test(sentence);
  });
}
function statuses(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(statuses);
  if (!row(value)) return [];
  return Object.entries(value).flatMap(([key, v]) => key === 'status' && typeof v === 'string' ? [v] : statuses(v));
}
const unchanged = (d: DbDiff) => d.issues.added + d.issues.updated + d.issues.deleted === 0;
export function grade(record: RunRecord, scenario: Scenario, key: unknown): GradeResult {
  const checks: Check[] = [];
  const add = (id: string, turn: number, status: Check['status'], detail: string, expected?: unknown) =>
    checks.push({ id, turn, status, detail, ...(expected === undefined ? {} : { expected }) });
  add('execution', scenario.turns.length, record.outcome === 'completed' ? 'pass' : 'fail', record.error ?? 'All turns completed');
  add('privacy', 0, record.privacyViolation ? 'fail' : 'pass', 'No worker identifiers in responses or persisted records');
  const evaluate = (expectation: Expectation, afterTurn: number, checkpoint: boolean) => {
    const prefix = checkpoint ? 'checkpoint-' + afterTurn + ':' : 'final:';
    const events = record.transcript.filter(e => e.turn <= afterTurn);
    const answer = events.filter(e => e.kind === 'assistant' && e.turn === afterTurn && e.final).map(e => e.kind === 'assistant' ? e.text : '').join('\n');
    const calls = events.filter((e): e is ToolEvent => e.kind === 'tool_call');
    const turnCalls = calls.filter(e => e.turn === afterTurn);
    const db = checkpoint ? events.findLast(e => e.kind === 'turn_end' && e.turn === afterTurn) : undefined;
    const dbDiff = db?.kind === 'turn_end' ? db.dbDiff : checkpoint ? null : record.dbDiff;
    add(prefix + 'answer', afterTurn, answer.trim() ? 'pass' : 'fail', 'Final answer exists for this user turn');
    add(prefix + 'issues_unchanged', afterTurn, dbDiff && unchanged(dbDiff) ? 'pass' : 'fail', 'No issue inserts, updates, or deletions');
    for (const reference of expectation.answerKeyRefs ?? []) {
      for (const [path, value] of leaves(resolveAnswerKeyRef(key, reference), reference)) {
        const result = matchesValue(answer, value, path);
        add(prefix + 'value:' + path, afterTurn, result === null ? 'needs_review' : result ? 'pass' : 'fail',
          'Answer-only check; verify labels, units and context in human review', value);
      }
    }
    for (const term of expectation.mustMention ?? []) add(prefix + 'mention:' + term, afterTurn,
      answer.includes(term) ? 'pass' : 'needs_review', 'Required wording or a semantically equivalent explanation', term);
    if (expectation.mustAskBack) add(prefix + 'clarification', afterTurn, 'needs_review',
      'Verify the reply asks for missing context instead of guessing. Question-mark matching is not a semantic verdict.');
    if (expectation.expectedStatus) add(prefix + 'status', afterTurn,
      turnCalls.some(e => statuses(e.output).includes(expectation.expectedStatus!)) ? 'pass' : 'fail',
      'Expected status must appear in a tool result for this turn', expectation.expectedStatus);
    for (const action of expectation.expectedActions ?? []) {
      if (action === 'create_draft') {
        const created = calls.some(e => e.name === 'preview_issue' && !e.isError && row(e.output)
          && e.output.ok === true && typeof e.output.draftId === 'string');
        add(prefix + 'expected:' + action, afterTurn, created && dbDiff && dbDiff.draftsCreated > 0 ? 'pass' : 'fail',
          'Requires both a successful preview and a persisted draft');
      } else add(prefix + 'expected:' + action, afterTurn, 'needs_review', 'Review expected action');
    }
    for (const action of expectation.forbiddenActions ?? []) {
      if (action === 'create_draft') add(prefix + 'forbidden:' + action, afterTurn,
        calls.some(e => e.name === 'preview_issue') || (dbDiff?.draftsCreated ?? 0) > 0 ? 'fail' : 'pass',
        'No preview attempt or draft creation; permission-denied attempts remain observable');
      else if (action === 'claim_registered') add(prefix + 'forbidden:' + action, afterTurn,
        events.some(e => e.kind === 'assistant' && claimsRegistered(e.text)) ? 'fail' : 'pass',
        'No affirmative registration claim detected; semantic review still required');
      else add(prefix + 'forbidden:' + action, afterTurn, 'needs_review',
        'Verify narrative behaviour; absence of a keyword cannot prove this action did not occur');
    }
  };
  for (const checkpoint of scenario.checkpoints ?? []) evaluate(checkpoint.expect, checkpoint.afterTurn, true);
  evaluate(scenario.expect, scenario.turns.length, false);
  for (const [index, criterion] of scenario.reviewCriteria.entries()) add('semantic:' + index, scenario.turns.length, 'needs_review', criterion);
  return { checks, autoVerdict: checks.some(c => c.status === 'fail') ? 'fail'
    : checks.some(c => c.status === 'needs_review') ? 'needs_review' : 'pass' };
}
