import Database from 'better-sqlite3';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildAnswerKey } from '../../src/answer-key/build.js';
import type { AnswerKey } from '../../src/answer-key/types.js';
import { buildDataset } from '../../src/generator/build.js';
import { loadConfig } from '../../src/generator/config.js';
import { writeDataset } from '../../src/generator/writer.js';
import { removeOwnedTemp } from '../../src/shared/files.js';
import { checkFrozenFiles, checkScenarios, freezeScenarios, readLock } from '../../src/eval/freeze.js';
import { loadScenarios, resolveAnswerKeyRef, scenarioSchema, validateScenarioSets } from '../../src/eval/scenario.js';

const source = resolve('eval/scenarios');
let root: string, directory: string, dataset: string, key: AnswerKey, counter = 0;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'shopfloor-phase2-'));
  const baseline = join(root, 'baseline');
  mkdirSync(baseline);
  const config = loadConfig('config/generator.config.json');
  const data = buildDataset(config);
  key = buildAnswerKey(config, data);
  const db = new Database(join(baseline, 'production.db'));
  try { writeDataset(db, data.tables); } finally { db.close(); }
  writeFileSync(join(baseline, 'answer_key.json'), JSON.stringify(key, null, 2) + '\n');
  // Test fixture metadata. Full generator validation is covered by the Phase 1 suite.
  writeFileSync(join(baseline, 'validation.json'), JSON.stringify({ datasetVersion: key.datasetVersion, passed: true }));
});
beforeEach(() => {
  const workspace = join(root, String(++counter));
  directory = join(workspace, 'eval', 'scenarios');
  mkdirSync(directory, { recursive: true });
  for (const set of ['eval', 'dev']) cpSync(join(source, set), join(directory, set), { recursive: true });
  dataset = join(workspace, 'data', 'phase2');
  cpSync(join(root, 'baseline'), dataset, { recursive: true });
});
afterAll(() => { if (root) removeOwnedTemp(root); });

const edit = (path: string, change: (value: any) => void) => {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  change(value);
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
};

describe('scenario authoring contract', () => {
  it('validates all 40 real questions, coverage and references against a fresh independent answer key', () => {
    const sets = validateScenarioSets(directory, key);
    expect(sets.eval).toHaveLength(30);
    expect(sets.dev).toHaveLength(10);
    const weekly = sets.eval.find(scenario => scenario.id === 'S09')!;
    expect(weekly.turns).toHaveLength(2);
    expect(weekly.checkpoints?.[0]?.afterTurn).toBe(1);
    expect(weekly.expect.answerKeyRefs).toContain('lookups.ALL_weekly_produced_change_pct');
  });
  it('rejects role conflicts, contradictory actions, missing clarification and unfilled dates', () => {
    const simple = loadScenarios(directory, 'eval')[0]!;
    expect(scenarioSchema.safeParse({ ...simple, expect: { ...simple.expect, expectedActions: ['create_draft'] } }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...simple, role: 'operator', expect: { ...simple.expect, expectedActions: ['create_draft'] } }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...simple, type: 'ambiguous' }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...simple, turns: ['2라인 [E1의 실제 생산일] 실적 알려줘'] }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...simple, unexpectedField: true }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...simple, expect: { ...simple.expect, issuesUnchanged: false } }).success).toBe(false);
  });
  it('rejects checkpoints that refer to a final/nonexistent turn', () => {
    const weekly = loadScenarios(directory, 'eval').find(s => s.id === 'S09')!;
    expect(scenarioSchema.safeParse({ ...weekly, checkpoints: [{ afterTurn: 2, expect: weekly.expect }] }).success).toBe(false);
  });
  it('rejects inherited and nonexistent answer-key paths including checkpoint references', () => {
    expect(resolveAnswerKeyRef(key, 'E4.byHour.9.hour')).toBe(9);
    for (const ref of ['E4.byHour.99.hour', 'E1.toString', '__proto__.polluted', 'E1..durationMin', 'E1.constructor']) {
      expect(() => resolveAnswerKeyRef(key, ref)).toThrow();
    }
    edit(join(directory, 'eval', 'S09.json'), value => { value.checkpoints[0].expect.answerKeyRefs = ['lookups.missing']; });
    expect(() => validateScenarioSets(directory, key)).toThrow('Unresolved answer-key reference');
  });
  it('rejects duplicate questions, mismatched filenames and extra files', () => {
    const first = loadScenarios(directory, 'eval')[0]!;
    edit(join(directory, 'dev', 'D01.json'), value => { value.turns = first.turns; });
    expect(() => validateScenarioSets(directory, key)).toThrow('Repeated question');
    edit(join(directory, 'eval', 'S01.json'), value => { value.id = 'S02'; });
    expect(() => loadScenarios(directory, 'eval')).toThrow('filename/ID/set mismatch');
    writeFileSync(join(directory, 'eval', 'S31.json'), '{}');
    expect(() => loadScenarios(directory, 'eval')).toThrow('exactly');
  });
});

describe('freeze and dataset binding', () => {
  it('keeps the checked-in frozen questions verifiable without local data files', () => {
    expect(Object.keys(checkFrozenFiles(source).files)).toHaveLength(30);
  });
  it('freezes and verifies a matching copy without changing dataset files', () => {
    const before = readFileSync(join(dataset, 'production.db'));
    const lock = freezeScenarios(directory, dataset);
    expect(checkScenarios(directory)).toMatchObject({ evalCount: 30, devCount: 10, lock: { setHash: lock.setHash } });
    expect(readFileSync(join(dataset, 'production.db')).equals(before)).toBe(true);
    const copy = join(root, 'matching-copy');
    cpSync(dataset, copy, { recursive: true });
    expect(checkScenarios(directory, copy).lock.datasetVersion).toBe(key.datasetVersion);
  });
  it('detects an eval edit and requires a reason before replacing its lock', () => {
    const original = freezeScenarios(directory, dataset);
    edit(join(directory, 'eval', 'S01.json'), value => { value.turns[0] += ' 표로 보여줘.'; });
    expect(() => checkScenarios(directory)).toThrow('Frozen evaluation files differ');
    expect(() => freezeScenarios(directory, dataset)).toThrow('requires --reason');
    expect(readLock(directory).setHash).toBe(original.setHash);
    const next = freezeScenarios(directory, dataset, 'Test: clarify output format');
    expect(next.setHash).not.toBe(original.setHash);
    expect(next.history.at(-1)).toMatchObject({ eventType: 'CHANGE', before: { setHash: original.setHash }, after: { setHash: next.setHash } });
    const logs = join(dirname(dirname(directory)), 'logs');
    const entries = readdirSync(logs).flatMap(name => readFileSync(join(logs, name), 'utf8').trim().split('\n').map(line => JSON.parse(line)));
    expect(entries.at(-1)).toMatchObject({ event_type: 'CHANGE', data: { before: { setHash: original.setHash }, after: { setHash: next.setHash }, reason: 'Test: clarify output format' } });
    expect(checkScenarios(directory).evalCount).toBe(30);
  });
  it('allows valid dev wording changes but continues to validate dev expectations', () => {
    const original = freezeScenarios(directory, dataset);
    edit(join(directory, 'dev', 'D01.json'), value => { value.turns[0] += ' 수량을 구분해서 보여줘.'; });
    expect(checkScenarios(directory).lock.setHash).toBe(original.setHash);
    edit(join(directory, 'dev', 'D01.json'), value => { value.expect.answerKeyRefs = ['missing']; });
    expect(() => checkScenarios(directory)).toThrow('Unresolved answer-key reference');
  });
  it('ignores CRLF conversion but detects altered answer values and forged set hashes', () => {
    freezeScenarios(directory, dataset);
    const path = join(directory, 'eval', 'S01.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\r?\n/g, '\r\n'));
    expect(checkScenarios(directory).evalCount).toBe(30);
    edit(join(dataset, 'answer_key.json'), value => { value.E1.durationMin++; });
    expect(() => checkScenarios(directory)).toThrow('answer key changed');
    edit(join(directory, 'eval.lock.json'), value => { value.setHash = '0'.repeat(64); });
    expect(() => checkFrozenFiles(directory)).toThrow('set hash mismatch');
  });
  it('rejects mismatched DB/answer-key identity and failed validation', () => {
    const db = new Database(join(dataset, 'production.db'));
    try { db.prepare("UPDATE dataset_meta SET dataset_version = 'different'").run(); } finally { db.close(); }
    expect(() => freezeScenarios(directory, dataset)).toThrow('identity mismatch');
    cpSync(join(root, 'baseline', 'production.db'), join(dataset, 'production.db'));
    edit(join(dataset, 'validation.json'), value => { value.passed = false; });
    expect(() => freezeScenarios(directory, dataset)).toThrow('successful validation');
  });
  it('refuses a different generation even if its answer values are unchanged', () => {
    freezeScenarios(directory, dataset);
    const db = new Database(join(dataset, 'production.db'));
    try { db.prepare("UPDATE dataset_meta SET dataset_version = 'new-generation'").run(); } finally { db.close(); }
    edit(join(dataset, 'answer_key.json'), value => { value.datasetVersion = 'new-generation'; });
    edit(join(dataset, 'validation.json'), value => { value.datasetVersion = 'new-generation'; });
    expect(() => checkScenarios(directory)).toThrow('dataset version or answer key changed');
  });
});
