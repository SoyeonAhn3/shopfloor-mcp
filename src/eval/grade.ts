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
export function matchesValue(text: string, value: unknown, ref: string): boolean | null {
  if (typeof value === 'number') {
    const ratio = /(?:achievement|defectRate|weekAverage|dailyAchievement)/i.test(ref);
    const percent = ratio || /(?:change_pct|ChangePct|percentagePoints)/i.test(ref);
    const expected = ratio ? value * 100 : value;
    const candidates = [...text.replace(/−/g, '-').matchAll(/[-+]?\d+(?:,\d{3})*(?:\.\d+)?\s*%?/g)];
    return candidates.some(match => {
      const token = match[0].trim(), isPercent = token.endsWith('%');
      if (percent !== isPercent) return false;
      let actual = Number(token.replace(/[,%\s]/g, ''));
      // "150개 감소" is a valid presentation of a signed delta; signs on percentages still matter.
      if (expected < 0 && actual > 0 && /(?:delta|change_pct|ChangePct)/i.test(ref)) {
        const nearby = text.slice(Math.max(0, match.index! - 16), match.index! + token.length + 16);
        if (/감소|하락|줄|decreas/i.test(nearby)) actual *= -1;
      }
      const decimals = token.replace(/\s*%$/, '').split('.')[1]?.length ?? 0;
      const tolerance = !percent && Number.isInteger(expected) ? 0 : Math.min(0.5, 0.5 * 10 ** -decimals) + 1e-8;
      return Math.abs(actual - expected) <= tolerance;
    });
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
