import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { grade } from '../../src/eval/grade.js';
import { serializeRecord, type RunRecord } from '../../src/eval/record.js';
import { prepareReview, reviewTemplate } from '../../src/eval/review.js';
import { applyDecisions, buildSheet, DecisionError, sheetHtml } from '../../src/eval/sheet.js';
import { buildSummary } from '../../src/eval/summary.js';
import { removeOwnedTemp } from '../../src/shared/files.js';
import { record, scenario } from './helpers.js';

let roots: string[] = [];
const temporary = () => { const p = mkdtempSync(join(tmpdir(), 'shopfloor-eval-test-')); roots.push(p); return p; };
afterEach(() => { roots.forEach(removeOwnedTemp); roots = []; });
function stored(root: string, r: RunRecord) {
  const run = join(root, 'eval/runs', r.runId); mkdirSync(run, { recursive: true });
  writeFileSync(join(run, 'D01-r1.json'), serializeRecord(r));
  writeFileSync(join(run, 'manifest.json'), JSON.stringify({ schemaVersion: 1, runId: r.runId, set: r.set, toolset: r.toolset,
    model: r.model, descriptionsHash: r.descriptionsHash, policyHash: r.policyHash, scenarioSetHash: r.scenarioSetHash,
    frozenEvalHash: r.frozenEvalHash, datasetVersion: r.datasetVersion, selectedIds: ['D01'], repeat: 1, recordFiles: ['D01-r1.json'],
    status: 'completed', stopReason: null, startedAt: r.startedAt, finishedAt: r.finishedAt, estimatedCostUsd: 0 }));
  prepareReview(join(root, 'eval/reviews', r.runId), r);
  return r;
}
function fixture() {
  const root = temporary();
  const coarse = record({ runId: 'run-coarse', transcript: [{ kind: 'user', turn: 1, text: '정지 횟수 알려줘' },
    { kind: 'assistant', turn: 1, text: '9/14~9/18 기간 정지는 16회입니다. </script><b>x</b>', final: true }] });
  coarse.grade = grade(coarse, scenario(), { count: 14 });
  const fine = record({ runId: 'run-fine', toolset: 'fine' });
  fine.grade = grade(fine, scenario(), { count: 123 });
  return { root, coarse: stored(root, coarse), fine: stored(root, fine) };
}
const completed = (r: RunRecord, verdict: 'pass' | 'fail') => {
  const review = reviewTemplate(r);
  return { ...review, reviewer: 'reviewer', reviewedAt: '2026-10-26T01:00:00.000Z', verdict, note: 'Checked against the key',
    checks: review.checks.map(c => ({ ...c, verdict, note: c.id.includes('value') && verdict === 'pass' ? 'override reason' : '' })) };
};
const decisions = (reviews: unknown[]) => ({ schemaVersion: 1, kind: 'review-decisions', sheetId: 'test', reviews });

describe('review sheet', () => {
  it('pairs tool sets per scenario and shows where a value check matched', () => {
    const { root } = fixture();
    const sheet = buildSheet(root, ['run-coarse', 'run-fine']);
    expect(sheet.scenarios).toHaveLength(1);
    const [scenarioView] = sheet.scenarios;
    expect(scenarioView!.records.map(r => r.toolset)).toEqual(['coarse', 'fine']);
    const coarse = scenarioView!.records[0]!, value = coarse.checks.find(c => c.id === 'final:value:count')!;
    // The "14" inside the date range satisfies the automatic check; the sheet exposes that span to the reviewer.
    expect(value.status).toBe('pass');
    expect(value.hits.map(([s, e]) => coarse.turns[0]!.answer.slice(s, e))).toEqual(['14']);
    expect(coarse.memoTurn).toBeNull();
  });
  it('embeds transcript text without letting it close the data script', () => {
    const { root } = fixture();
    const html = sheetHtml(buildSheet(root, ['run-coarse', 'run-fine']));
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('\\u003c/script>\\u003cb>');
  });
});
describe('applying review decisions', () => {
  it('writes validated human reviews that the summary counts', () => {
    const { root, coarse, fine } = fixture();
    const result = applyDecisions(root, decisions([completed(coarse, 'pass'), completed(fine, 'fail')]));
    expect(result).toEqual({ written: 2, unchanged: 0, kept: [] });
    expect(JSON.parse(readFileSync(join(root, 'eval/reviews/run-fine/D01-r1.json'), 'utf8')).verdict).toBe('fail');
    expect(buildSummary(root).runs.map(r => r.reviewed)).toEqual([1, 1]);
  });
  it('rejects the whole file when any review is invalid', () => {
    const { root, coarse, fine } = fixture();
    const before = readFileSync(join(root, 'eval/reviews/run-coarse/D01-r1.json'), 'utf8');
    const invalid = { ...completed(fine, 'pass'), reviewer: '' };
    expect(() => applyDecisions(root, decisions([completed(coarse, 'pass'), invalid]))).toThrow(DecisionError);
    expect(readFileSync(join(root, 'eval/reviews/run-coarse/D01-r1.json'), 'utf8')).toBe(before);
    expect(() => applyDecisions(root, { reviews: [] })).toThrow('형식');
  });
  it('requires a reason to override an automatic failure', () => {
    const root = temporary(), r = record({ runId: 'run-failed' });
    r.grade = grade(r, scenario(), { count: 999 }); stored(root, r);
    expect(r.grade.checks.find(c => c.id === 'final:value:count')?.status).toBe('fail');
    const silent = { ...completed(r, 'pass'), checks: completed(r, 'pass').checks.map(c => ({ ...c, note: '' })) };
    expect(() => applyDecisions(root, decisions([silent]))).toThrow('explanation');
    expect(applyDecisions(root, decisions([completed(r, 'pass')])).written).toBe(1);
  });
  it('accepts a pass without a note but requires one for a fail', () => {
    const { root, coarse, fine } = fixture();
    expect(() => applyDecisions(root, decisions([{ ...completed(fine, 'fail'), note: '' }]))).toThrow('failed review requires a note');
    expect(applyDecisions(root, decisions([{ ...completed(coarse, 'pass'), note: '' }])).written).toBe(1);
  });
  it('keeps a completed review when the sheet sends it back as pending', () => {
    const { root, fine } = fixture();
    applyDecisions(root, decisions([completed(fine, 'fail')]));
    expect(applyDecisions(root, decisions([reviewTemplate(fine)])).kept).toEqual(['D01 run-fine']);
    expect(JSON.parse(readFileSync(join(root, 'eval/reviews/run-fine/D01-r1.json'), 'utf8')).verdict).toBe('fail');
  });
});
