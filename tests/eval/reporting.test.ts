import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diff, snapshot } from '../../src/eval/dbdiff.js';
import { grade } from '../../src/eval/grade.js';
import { recordSchema, serializeRecord } from '../../src/eval/record.js';
import { prepareReview, reviewTemplate, validateReview } from '../../src/eval/review.js';
import { buildSummary } from '../../src/eval/summary.js';
import { verifyDescriptionFreeze } from '../../src/eval/runner.js';
import { removeOwnedTemp } from '../../src/shared/files.js';
import { record, scenario } from './helpers.js';

let roots: string[] = [];
const temporary = () => { const p = mkdtempSync(join(tmpdir(), 'shopfloor-eval-test-')); roots.push(p); return p; };
afterEach(() => { roots.forEach(removeOwnedTemp); roots = []; });
describe('persistent evaluation evidence', () => {
  it('detects inserts, updates, and deletions separately', () => {
    const path = join(temporary(), 'test.db'), db = new Database(path);
    db.exec("CREATE TABLE issues(issue_id TEXT PRIMARY KEY,title TEXT); CREATE TABLE issue_drafts(draft_id TEXT PRIMARY KEY); CREATE TABLE audit_log(log_id INTEGER PRIMARY KEY); INSERT INTO issues VALUES('old','old'),('delete','old')");
    const before = snapshot(path);
    db.exec("UPDATE issues SET title='new' WHERE issue_id='old'; DELETE FROM issues WHERE issue_id='delete'; INSERT INTO issues VALUES('new','new'); INSERT INTO issue_drafts VALUES('P-1'); INSERT INTO audit_log VALUES(1)");
    const changes = diff(before, snapshot(path)); db.close();
    expect(changes).toMatchObject({ issues: { added: 1, updated: 1, deleted: 1 }, draftsCreated: 1, auditRows: 1 });
  });
  it('requires explicit completed human checks, a reviewer, and record binding', () => {
    const r = record(); r.grade = grade(r, scenario(), { count: 123 });
    const review = reviewTemplate(r);
    expect(validateReview(r, review).verdict).toBe('pending');
    expect(() => validateReview(r, { ...review, verdict: 'pass' })).toThrow('reviewer');
    const filled = { ...review, verdict: 'pass', reviewer: 'human', reviewedAt: '2026-10-23T00:01:00.000Z', note: 'Checked against the independent key',
      checks: review.checks.map(c => ({ ...c, verdict: 'pass' })) };
    expect(validateReview(r, filled).verdict).toBe('pass');
    expect(() => validateReview(record({ ...r, error: 'changed' }), filled)).toThrow('exact record');
    expect(() => validateReview(r, { ...filled, checks: [] })).toThrow('every check');
  });
  it('never overwrites an existing review and supplies readable answer-key evidence', () => {
    const root = temporary(), r = record(); r.grade = grade(r, scenario(), { count: 123 });
    prepareReview(root, r);
    const file = join(root, 'D01-r1.json');
    const review = JSON.parse(readFileSync(file, 'utf8')); review.note = 'human work in progress';
    writeFileSync(file, JSON.stringify(review)); prepareReview(root, r);
    expect(JSON.parse(readFileSync(file, 'utf8')).note).toBe('human work in progress');
    expect(readFileSync(join(root, 'D01-r1.md'), 'utf8')).toContain('Expected: 123');
  });
  it('reports unreviewed automatic success without inventing final accuracy', () => {
    const root = temporary(), r = record(); r.grade = grade(r, scenario(), { count: 123 });
    const run = join(root, 'eval/runs/test-run'); mkdirSync(run, { recursive: true });
    writeFileSync(join(run, 'D01-r1.json'), serializeRecord(r));
    writeFileSync(join(run, 'manifest.json'), JSON.stringify({ schemaVersion: 1, runId: r.runId, set: r.set, toolset: r.toolset,
      model: r.model, descriptionsHash: r.descriptionsHash, policyHash: r.policyHash, scenarioSetHash: r.scenarioSetHash,
      frozenEvalHash: r.frozenEvalHash, datasetVersion: r.datasetVersion, selectedIds: ['D01'], repeat: 1, recordFiles: ['D01-r1.json'],
      status: 'completed', stopReason: null, startedAt: r.startedAt, finishedAt: r.finishedAt, estimatedCostUsd: 0 }));
    const summary = buildSummary(root);
    expect(summary.runs[0]).toMatchObject({ count: 1, reviewed: 0, reviewPending: 1, finalPassRate: null, noAutomaticFailureRate: 1, fullEvaluationSet: false });
    expect(summary.comparisons).toEqual([]);
    // Even if all available records are reviewed, an interrupted requested set has no final score.
    const manifestPath = join(run, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.selectedIds = ['D01', 'D02']; manifest.status = 'stopped';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const reviewDirectory = join(root, 'eval/reviews', r.runId); mkdirSync(reviewDirectory, { recursive: true });
    const human = reviewTemplate(r);
    human.verdict = 'pass'; human.reviewer = 'test-reviewer'; human.reviewedAt = '2026-10-23T01:00:00.000Z'; human.note = 'Test fixture';
    human.checks.forEach(c => { c.verdict = 'pass'; });
    writeFileSync(join(reviewDirectory, 'D01-r1.json'), JSON.stringify(human));
    expect(buildSummary(root).runs[0]).toMatchObject({ reviewed: 1, coverageComplete: false, finalPassRate: null });
  });
  it('rejects a description or model change after freezing', () => {
    const root = temporary(); mkdirSync(join(root, 'eval'));
    writeFileSync(join(root, 'eval/description-freeze.json'), JSON.stringify({ model: 'fixed', descriptionsHash: 'a', policyHash: 'b' }));
    expect(() => verifyDescriptionFreeze(root, 'fixed', 'a', 'b')).not.toThrow();
    expect(() => verifyDescriptionFreeze(root, 'different', 'a', 'b')).toThrow('differ');
    expect(() => verifyDescriptionFreeze(root, 'fixed', 'new', 'b')).toThrow('differ');
  });
  it('validates record structure rather than accepting missing outcome/identity fields', () => {
    expect(recordSchema.safeParse({ ...record(), outcome: undefined }).success).toBe(false);
    expect(recordSchema.safeParse({ ...record(), scenarioSetHash: 'wrong' }).success).toBe(false);
  });
});
