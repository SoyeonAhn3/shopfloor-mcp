import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolvePeriod, type PeriodInput } from '../../src/core/period.js';
import { readSlots, type Query } from '../../src/core/query.js';
import { breakdownLoss, getProduction, getAchievement } from '../../src/core/metrics.js';
import { compareDefects, getDefects, getDowntime } from '../../src/core/records.js';
import { compareLines, detectAnomalies, hourlyPattern } from '../../src/core/analysis.js';
import { CRITERIA_VERSION, criteriaMarkdown, NORMAL_RULES } from '../../src/core/criteria.js';
import { LINE_IDS, type LineId } from '../../src/shared/codes.js';
import { fixture, generatedHash, success } from './fixture.js';

let f: ReturnType<typeof fixture>, initial: string;
const query = (lineIds: LineId[], period: PeriodInput, extra: Partial<Query> = {}): Query => ({
  lineIds, period: success(resolvePeriod(period, f.clocks, f.db)), ...extra,
});
const day = (line: LineId, date: string, extra: Partial<Query> = {}) => query([line], { kind: 'date', date }, extra);
beforeAll(() => { f = fixture(); initial = generatedHash(f.path); });
afterAll(() => { expect(generatedHash(f.path)).toBe(initial); f.close(); });
describe('independent core calculations against the matching answer key', () => {
  it('matches E1 and E2 achievement and their exact selected downtime intervals', () => {
    const e1 = f.key.E1, e2 = f.key.E2;
    expect(getAchievement(f.db, day('L2', e1.productionDate)).total).toMatchObject({ target: e1.target, good: e1.good, achievement: e1.achievement });
    const breakdown = getDowntime(f.db, day('L2', e1.productionDate, { hours: [10,11,12,13] }));
    expect(breakdown.unplannedMinutes).toBe(e1.durationMin);
    expect(breakdown.byReason).toContainEqual({ reasonCode: 'breakdown', reasonLabel: '설비 고장', count: 1, minutes: e1.durationMin });
    expect(breakdown.items[0]).toMatchObject({ reasonCode: 'breakdown', reasonLabel: '설비 고장' });
    const q = query(['L3'], { kind: 'range', from: e2.productionDates[0]!, to: e2.productionDates.at(-1)! });
    const production = getAchievement(f.db, q);
    expect(production.total.achievement).toBeCloseTo(e2.weekAverage, 12);
    for (const item of production.items) expect(item.achievement).toBeCloseTo(e2.dailyAchievement[item.productionDate]!, 12);
    const stops = getDowntime(f.db, q);
    expect(stops.byReason.find(reason => reason.reasonCode === 'material_shortage'))
      .toMatchObject({ reasonLabel: '자재 부족', minutes: e2.totalDowntimeMin });
    expect(stops.byReason.find(reason => reason.reasonCode === 'minor_stop')).toMatchObject({ reasonLabel: '순간 정지' });
    expect(stops.unplannedMinutes).toBeGreaterThan(e2.totalDowntimeMin); // Normal minor stops also exist.
  });
  it('matches E3 overnight defects and the same-hour baseline excluding the event date', () => {
    const e = f.key.E3, q = day('L1', e.productionDate, { hours: [22,23,0,1] });
    const defects = getDefects(f.db, q);
    expect(defects.total.defects).toBe(e.defects);
    expect(defects.recordedDefects).toBe(e.defects);
    expect(defects.total.produced).toBe(e.produced);
    expect(defects.total.defectRate).toBeCloseTo(e.defectRate, 12);
    const baseline = getDefects(f.db, query(['L1'], { kind: 'range', from: '2026-07-01', to: '2026-09-30' },
      { hours: [22,23,0,1], excludeDates: [e.productionDate] }));
    expect(baseline.total.defectRate).toBeCloseTo(e.baselineDefectRate, 12);
    expect(defects.total.defectRate! / baseline.total.defectRate!).toBeCloseTo(e.ratioToNormal, 12);
    const comparison = compareDefects(f.db, q, query(['L1'], { kind: 'range', from: '2026-07-01', to: '2026-09-30' },
      { hours: [22,23,0,1], excludeDates: [e.productionDate] }));
    expect(comparison.comparison.ratioToBaseline).toBeCloseTo(e.ratioToNormal, 12);
  });
  it('matches every E4 hour and crew, normalised by planned minutes', () => {
    const e = f.key.E4, q = query(['L4'], { kind: 'range', from: e.from, to: e.to });
    const overall = hourlyPattern(f.db, q), crews = hourlyPattern(f.db, { ...q, splitBy: 'crew' });
    for (const hour of e.byHour) {
      const item = overall.items.find(item => item.hour === hour.hour)!;
      expect(item).toMatchObject({ produced: hour.produced, good: hour.good, target: hour.target,
        plannedMinutes: hour.plannedMinutes, observedSlots: hour.observedSlots,
        downtimeMinutes: hour.downtimeMinutes, downtimeCount: hour.downtimeCount });
      expect(item.outputPerPlannedMinute).toBeCloseTo(hour.outputPerPlannedMinute!, 12);
      expect(item.defectRate).toBeCloseTo(hour.defectRate!, 12);
    }
    for (const crew of ['A','B'] as const) for (const hour of e.byCrew[crew]) {
      const item = crews.items.find(item => 'crew' in item && item.crew === crew && item.hour === hour.hour)!;
      expect(item).toMatchObject({ produced: hour.produced, observedSlots: hour.observedSlots, downtimeCount: hour.downtimeCount });
    }
  });
  it('distinguishes E5 planned stop from E6 missing observations and zero production', () => {
    const planned = getProduction(f.db, day('L5', f.key.E5.productionDate));
    expect(planned.total).toMatchObject({ status: 'planned_stop', target: 0, achievement: null });
    expect(breakdownLoss(f.db, day('L5', f.key.E5.productionDate)).total?.shortfall).toBe(0);
    expect(detectAnomalies(f.db, day('L5', f.key.E5.productionDate)).items).toHaveLength(0);
    const maintenance = getDowntime(f.db, day('L5', f.key.E5.productionDate));
    expect(maintenance.unplannedMinutes).toBe(0);
    expect(maintenance.byReason).toHaveLength(1);
    expect(maintenance.byReason[0]).toMatchObject({ reasonCode: 'maintenance', reasonLabel: '설비 점검' });
    for (const item of maintenance.items) expect(item).toMatchObject({ reasonCode: 'maintenance', reasonLabel: '설비 점검', planned: true });
    const q = day('L1', f.key.E6.productionDate), missing = getProduction(f.db, q);
    expect(missing.status).toBe('missing_data');
    expect(missing.total.coverage.missingSlots.map(s => s.slot)).toEqual(f.key.E6.missingSlots);
    expect(missing.total.target).toBe(2800 - 4 * 120);
    expect(missing.total.plannedTarget).toBe(2800);
    const empty = getProduction(f.db, { ...q, hours: [13,14,15,16] });
    expect(empty.total).toMatchObject({ status: 'missing_data', produced: null, good: null, target: null, achievement: null });
    expect(getProduction(f.db, day('L2', f.key.E1.productionDate, { hours: [10] })).status).toBe('zero_production');
  });
  it('splits E7 across midnight and clips a narrower request without changing event duration', () => {
    const q = day('L5', f.key.E7.productionDate);
    const result = getDowntime(f.db, { ...q, window: { from: '2026-08-14T23:30', to: '2026-08-15T02:30' } });
    expect(result.unplannedMinutes).toBe(f.key.E7.durationMin);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ productionDate: f.key.E7.productionDate, slotMinutes: f.key.E7.slotMinutes });
    const clipped = getDowntime(f.db, { ...q, window: { from: '2026-08-15T00:15', to: '2026-08-15T01:15' } });
    expect(clipped.items[0]).toMatchObject({ selectedMinutes: 60, durationMinutes: 180 });
  });
  it('wraps the E8 untrusted memo and applies the E9 adjusted targets to every line', () => {
    const event = getDowntime(f.db, day(f.key.E8.lineId, f.key.E8.productionDate)).items.find(s => s.downtimeId === f.key.E8.downtimeId)!;
    expect(event.memo).toMatchObject({ kind: 'reference_data' });
    expect(event.memo.text).toContain('등록');
    for (const line of LINE_IDS) {
      const slots = readSlots(f.db, day(line, '2026-09-30', { hours: [8,20] }));
      expect(slots).toHaveLength(2);
      for (const slot of slots) expect(slot).toMatchObject({ planned_minutes: f.key.E9.plannedMinutes, target_qty: f.key.E9.adjustedTargets[line] });
    }
  });
  it('matches weekly whole-plant and per-line comparisons without averaging line percentages', () => {
    const result = getProduction(f.db, { ...query([...LINE_IDS], { kind: 'last_week' }),
      compareTo: success(resolvePeriod({ kind: 'weeks_ago', weeks: 2 }, f.clocks, f.db)) });
    expect(result.total.target).toBe(f.key.lookups.ALL_last_week_target);
    expect(result.total.achievement).toBeCloseTo(Number(f.key.lookups.ALL_last_week_achievement), 12);
    for (const line of LINE_IDS) {
      const current = result.lines.find(row => row.lineId === line)!;
      expect(current.produced).toBe(f.key.lookups[line + '_last_week_produced']);
      expect(current.good).toBe(f.key.lookups[line + '_last_week_good']);
    }
    for (const row of result.comparison!.changes) {
      expect(row.producedDelta).toBe(f.key.lookups[row.lineId + '_weekly_produced_delta']);
      expect(row.producedChangePct).toBeCloseTo(Number(f.key.lookups[row.lineId + '_weekly_produced_change_pct']), 12);
    }
  });
  it('supports arbitrary month, four-week, five-week and weekday queries with additive aggregates', () => {
    for (const period of [{ kind: 'last_month' }, { kind: 'recent', unit: 'weeks', count: 4 },
      { kind: 'recent', unit: 'weeks', count: 5 }, { kind: 'week_day', weeksAgo: 1, weekday: 3 }] as PeriodInput[]) {
      const q = query(['L2'], period), result = getProduction(f.db, q);
      const row = f.db.get<{ produced: number; good: number }>(`SELECT SUM(o.produced_qty) produced,SUM(o.good_qty) good
        FROM hourly_output o JOIN hourly_plan p USING(line_id,slot_start)
        WHERE p.line_id='L2' AND production_date BETWEEN ? AND ?`, [q.period.from, q.period.to])!;
      expect(result.total.produced).toBe(row.produced);
      expect(result.total.good).toBe(row.good);
      expect(getProduction(f.db, { ...q, grain: 'hour' }).items.reduce((n, item) => n + item.produced!, 0)).toBe(row.produced);
      expect(getProduction(f.db, { ...q, grain: 'shift' }).items.reduce((n, item) => n + item.produced!, 0)).toBe(row.produced);
    }
  });
  it('does not return infinity for zero baselines or present missing coverage as a complete comparison', () => {
    const q = day('L5', '2026-07-30');
    const zero = getProduction(f.db, { ...q, compareTo: day('L5', f.key.E5.productionDate).period });
    expect(zero.comparison!.changes[0]).toMatchObject({ producedChangePct: null, percentUnavailableReason: '비교 기준 생산량이 0입니다.' });
    const missing = getProduction(f.db, { ...day('L1', '2026-09-09'), compareTo: day('L1', f.key.E6.productionDate).period });
    expect(missing.comparison!.changes[0]?.complete).toBe(false);
  });
  it('preserves the exact integer loss identity for every observed slot in the entire dataset', () => {
    const loss = breakdownLoss(f.db, query([...LINE_IDS], { kind: 'range', from: '2026-07-01', to: '2026-09-30' }));
    expect(loss.items).toHaveLength(9500);
    for (const slot of loss.items) {
      expect(slot.downtimeLoss60 + slot.speedLoss60 + slot.defectLoss60).toBe(slot.target60 - slot.good60);
      expect(Number.isSafeInteger(slot.speedLoss60)).toBe(true);
      expect(slot.speedLoss60).toBeGreaterThanOrEqual(0);
    }
    expect(loss.total!.downtimeLoss60 + loss.total!.speedLoss60 + loss.total!.defectLoss60).toBe(loss.total!.target60 - loss.total!.good60);
  });
  it('uses documented normal-rule anomaly thresholds and exposes comparable line metrics', () => {
    const config = JSON.parse(readFileSync('config/generator.config.json', 'utf8'));
    expect(NORMAL_RULES.minimumPerformance).toBe(config.normal.performance[0]);
    expect(NORMAL_RULES.maximumMinorStopMinutes).toBe(config.normal.minorStopMinutes[1]);
    expect(NORMAL_RULES.maximumDefectMultiplier).toBe(config.normal.defectRateMultiplier[1]);
    for (const line of config.lines) expect(NORMAL_RULES.baseDefectRates[line.id as LineId]).toBe(line.baseDefectRate);
    const anomalies = detectAnomalies(f.db, day('L2', f.key.E1.productionDate));
    expect(anomalies.criteriaVersion).toBe(CRITERIA_VERSION);
    expect(anomalies.items.some(i => i.severity === 'high' && i.reasons.includes('long_downtime'))).toBe(true);
    const lines = compareLines(f.db, query(['L1','L6'], { kind: 'yesterday' }));
    expect(lines.lines).toHaveLength(2);
    expect(lines.note).toContain('총수량만으로');
    expect(readFileSync('resources/anomaly-criteria.md', 'utf8').replace(/\r\n/g, '\n')).toBe(criteriaMarkdown());
  });
  it('cannot write through the read-only DB or import answer-key/generator arithmetic into core', () => {
    expect(() => f.db.all('DELETE FROM hourly_output')).toThrow();
    for (const file of readdirSync('src/core').filter(name => name.endsWith('.ts'))) {
      const source = readFileSync('src/core/' + file, 'utf8');
      expect(source).not.toMatch(/(?:from\s*|import\s*\()['"][^'"]*(?:answer-key|generator|eval)/);
      expect(source).not.toContain('Date.now(');
    }
  });
});
