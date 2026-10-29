import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCore } from '../../src/core/service.js';
import { fixture, generatedHash, success } from './fixture.js';

let f: ReturnType<typeof fixture>, core: ReturnType<typeof createCore>, initial: string;
beforeAll(() => {
  f = fixture(); initial = generatedHash(f.path);
  core = createCore({ dbPath: f.path, sessionId: 'viewer-session', userName: 'tester', role: 'viewer', clocks: f.clocks });
});
afterAll(() => { core.close(); expect(generatedHash(f.path)).toBe(initial); f.close(); });
const period = { kind: 'yesterday' };
const count = () => f.db.get<{ n: number }>('SELECT COUNT(*) n FROM audit_log')!.n;
describe('validated and audited public core operations', () => {
  it('defaults to all lines, returns the actual range, and logs one row per query', () => {
    const before = count(), result = success(core.tools.getProduction({ period, compareTo: { kind: 'last_week' } }));
    expect(result.lines).toHaveLength(6);
    expect(result.evidenceId).toMatch(/^Q-\d{4,}$/);
    expect(result.dataAsOf).toBe('2026-10-01T08:00');
    expect(result.datasetVersion).toBe(f.key.datasetVersion);
    expect(result.resolvedRange).toMatchObject({ from: '2026-09-30', to: '2026-09-30' });
    expect(count()).toBe(before + 1);
    const audit = f.db.get<{ params: string; result_summary: string; outcome: string }>('SELECT * FROM audit_log WHERE ref_id=?', [result.evidenceId!])!;
    expect(JSON.parse(audit.params)).toMatchObject({ period });
    expect(JSON.parse(audit.result_summary)).toMatchObject({ lineIds: ['L1','L2','L3','L4','L5','L6'], total: { produced: result.total.produced } });
    expect(audit.result_summary).not.toContain('slot');
    expect(audit.outcome).toBe('ok');
  });
  it.each([
    { period, lineIds: ["L1'); DROP TABLE lines;--"] },
    { period, lineIds: [] }, { period, lineIds: ['L1','L1'] },
    { period, workerId: 'W-L1-A1' }, { period, sql: 'SELECT * FROM workers' },
    { period, hours: [24] }, { period: { kind: 'recent', unit: 'weeks', count: 0 } },
  ])('rejects unsupported or malformed input and still audits it: %j', input => {
    const before = count();
    expect(core.tools.getProduction(input)).toMatchObject({ ok: false, reason: 'invalid_input', evidenceId: expect.stringMatching(/^Q-/) });
    expect(count()).toBe(before + 1);
  });
  it('returns the specific reason when a period resolves outside the supported calendar', () => {
    expect(core.tools.getProduction({ period: { kind: 'month', year: 9999, month: 12 } }))
      .toMatchObject({ ok: false, reason: 'invalid_input', message: '지원하는 날짜 범위를 벗어났습니다.' });
  });
  it('audits six distinguishable exceptional data states and gives no false success on query errors', () => {
    const cases = [
      [{ period: { kind: 'this_month' } }, 'out_of_range'],
      [{ period: { kind: 'date', date: '2026-09-26' } }, 'non_working_day'],
      [{ period: { kind: 'date', date: '2026-07-29' }, lineIds: ['L5'] }, 'planned_stop'],
      [{ period: { kind: 'date', date: '2026-09-08' }, lineIds: ['L1'] }, 'missing_data'],
      [{ period: { kind: 'date', date: '2026-07-15' }, lineIds: ['L2'], hours: [10] }, 'zero_production'],
    ] as const;
    for (const [input, state] of cases) {
      const before = count();
      expect(core.tools.getProduction(input)).toMatchObject({ status: state, evidenceId: expect.stringMatching(/^Q-/) });
      expect(count()).toBe(before + 1);
    }
    const corrupt = new Database(f.path);
    corrupt.exec('ALTER TABLE hourly_output RENAME TO unavailable_output');
    try {
      const result = core.tools.getProduction({ period });
      expect(result).toMatchObject({ ok: false, status: 'query_failed', evidenceId: expect.stringMatching(/^Q-/) });
      expect(JSON.stringify(result)).not.toContain('SQLITE');
    } finally { corrupt.exec('ALTER TABLE unavailable_output RENAME TO hourly_output'); corrupt.close(); }
  });
  it('flags comparison periods outside the dataset instead of returning an unrelated comparison', () => {
    expect(core.tools.getProduction({ period, compareTo: { kind: 'weeks_ago', weeks: 100 } })).toMatchObject({
      ok: false, status: 'out_of_range', failedPeriod: 'comparison',
    });
  });
  it('computes defect comparisons through the public API with an excluded baseline date', () => {
    const result = success(core.tools.getDefects({ lineIds: ['L1'], hours: [22,23,0,1],
      period: { kind: 'date', date: '2026-07-23' }, compareTo: { kind: 'range', from: '2026-07-01', to: '2026-09-30' },
      comparisonExcludeDates: ['2026-07-23'] }));
    if (!result.comparison) throw new Error('Expected comparison');
    expect(result.comparison.ratioToBaseline).toBeCloseTo(f.key.E3.ratioToNormal, 12);
    const sharedExclusions = success(core.tools.getDefects({ lineIds: ['L1'], hours: [22,23,0,1],
      period: { kind: 'date', date: '2026-07-24' }, compareTo: { kind: 'range', from: '2026-07-01', to: '2026-09-30' },
      excludeDates: ['2026-07-23'] }));
    expect(sharedExclusions.comparison?.total.defectRate).toBeCloseTo(f.key.E3.baselineDefectRate, 12);
  });
  it('keeps worker identifiers out of every public operation, including untrusted free text', () => {
    const control = new Database(f.path), id = f.key.E8.downtimeId;
    const original = control.prepare('SELECT memo FROM downtime_events WHERE downtime_id=?').get(id) as { memo: string };
    control.prepare('UPDATE downtime_events SET memo=? WHERE downtime_id=?').run(original.memo + ' W-L5-A1', id);
    try {
      const q = { period, lineIds: ['L5'] };
      const replies = [core.tools.getLineInfo(), core.tools.getProduction(q), core.tools.getAchievement(q),
        core.tools.getDefects(q), core.tools.getDowntime({ period: { kind: 'date', date: f.key.E8.productionDate }, lineIds: ['L5'] }),
        core.tools.breakdownLoss(q), core.tools.hourlyPattern(q), core.tools.detectAnomalies(q), core.tools.compareLines(q),
        core.tools.createDraft({ role: 'operator', title: 'W-L5-A1' })];
      for (const reply of replies) expect(JSON.stringify(reply)).not.toMatch(/W-L\d+-[AB]\d+|worker_id|entered_by/);
      const memoResult = success(core.tools.getDowntime({ period: { kind: 'date', date: f.key.E8.productionDate }, lineIds: ['L5'] }));
      expect(memoResult.items.find(item => item.downtimeId === id)!.memo).toMatchObject({ kind: 'reference_data', text: expect.stringContaining('[작업자 정보 제외]') });
    } finally { control.prepare('UPDATE downtime_events SET memo=? WHERE downtime_id=?').run(original.memo, id); control.close(); }
    expect('confirmDraft' in core.tools).toBe(false);
  });
  it('does not upgrade a viewer from supplied role text and does not write issue rows', () => {
    const before = f.db.get<{ n: number }>('SELECT COUNT(*) n FROM issues')!.n;
    expect(core.tools.createDraft({ role: 'operator' })).toMatchObject({ ok: false, reason: 'denied' });
    expect(f.db.get<{ n: number }>('SELECT COUNT(*) n FROM issue_drafts')!.n).toBe(0);
    expect(f.db.get<{ n: number }>('SELECT COUNT(*) n FROM issues')!.n).toBe(before);
  });
});
