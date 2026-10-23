import { addMinutes, overlapMinutes, slotKey } from '../shared/time.js';
import type { ReadDb } from './db.js';
import { anomalyCriteria, CRITERIA_VERSION } from './criteria.js';
import { getProduction, readStops, stopMinutes, stopsByDay, summarize } from './metrics.js';
import { readSlots, type Query, type Slot } from './query.js';

export function hourlyPattern(db: ReadDb, q: Query & { splitBy?: 'shift' | 'crew' | undefined }) {
  const slots = readSlots(db, q), stops = stopsByDay(readStops(db, q));
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = [slot.line_id, slot.hour_of_day, q.splitBy === 'crew' ? slot.crew : slot.shift].join('|');
    const group = groups.get(key) ?? []; group.push(slot); groups.set(key, group);
  }
  const items = [...groups.values()].map(group => {
    const first = group[0]!, observed = group.filter(s => s.produced_qty !== null), summary = summarize(group);
    const plannedMinutes = observed.reduce((sum, s) => sum + s.planned_minutes, 0);
    const stopIds = new Set<string>();
    let downtimeMinutes = 0;
    for (const slot of observed) {
      const candidates = stops.get(slotKey(slot.line_id, slot.production_date)) ?? [];
      downtimeMinutes += stopMinutes(slot, candidates);
      for (const stop of candidates) if (!stop.is_planned && overlapMinutes(stop.start_at, stop.end_at,
        addMinutes(slot.slot_start, slot.planned_stop_minutes), addMinutes(slot.slot_start, 60))) stopIds.add(stop.downtime_id);
    }
    const baseline = slots.filter(s => s.line_id === first.line_id && s.produced_qty !== null);
    const baseMinutes = baseline.reduce((sum, s) => sum + s.planned_minutes, 0);
    const baseRate = baseMinutes ? baseline.reduce((sum, s) => sum + s.produced_qty!, 0) / baseMinutes : null;
    const rate = plannedMinutes && summary.produced !== null ? summary.produced / plannedMinutes : null;
    return { lineId: first.line_id, hour: first.hour_of_day,
      ...(q.splitBy === 'crew' ? { crew: first.crew } : { shift: first.shift }), ...summary,
      observedSlots: observed.length, plannedMinutes, averageProduced: observed.length && summary.produced !== null ? summary.produced / observed.length : null,
      outputPerPlannedMinute: rate, downtimeCount: stopIds.size, downtimeMinutes,
      stopsPerObservedSlot: observed.length ? stopIds.size / observed.length : null,
      deviationFromLineAveragePct: rate !== null && baseRate ? (rate - baseRate) / baseRate * 100 : null };
  }).sort((a, b) => a.lineId.localeCompare(b.lineId) || a.hour - b.hour);
  return { ok: true as const, status: summarize(slots).status, period: q.period, lineIds: q.lineIds, items,
    note: '동일 라인의 관측 구간 평균과 비교합니다. 계획 가동 1분당 수량이며 실제 원인을 확정하지 않습니다.' };
}
export function detectAnomalies(db: ReadDb, q: Query) {
  const slots = readSlots(db, q), stops = stopsByDay(readStops(db, q));
  const items = slots.flatMap(slot => {
    if (slot.produced_qty === null || slot.target_qty === 0) return [];
    const criteria = anomalyCriteria(slot.line_id), achievement = slot.good_qty! / slot.target_qty;
    const defectRate = slot.produced_qty ? (slot.produced_qty - slot.good_qty!) / slot.produced_qty : null;
    const downtimeMinutes = stopMinutes(slot, stops.get(slotKey(slot.line_id, slot.production_date)) ?? []);
    const reasons: string[] = [];
    if (achievement < criteria.lowAchievement) reasons.push('low_achievement');
    if (defectRate !== null && defectRate > criteria.highDefectRate) reasons.push('high_defect_rate');
    if (downtimeMinutes > criteria.longDowntimeMinutes) reasons.push('long_downtime');
    if (!reasons.length) return [];
    const severe = achievement < criteria.severeLowAchievement || (defectRate !== null && defectRate > criteria.severeDefectRate)
      || downtimeMinutes > criteria.severeDowntimeMinutes;
    return [{ lineId: slot.line_id, productionDate: slot.production_date, slot: slot.slot_start,
      severity: severe ? 'high' as const : 'medium' as const, reasons, achievement, defectRate, downtimeMinutes }];
  });
  const total = summarize(slots);
  return { ok: true as const, status: total.status, period: q.period, lineIds: q.lineIds, coverage: total.coverage,
    criteriaVersion: CRITERIA_VERSION, items, note: '규칙을 벗어난 관측값입니다. 생산량 감소만으로 설비 고장이나 작업자 책임을 확정하지 않습니다.' };
}
export function compareLines(db: ReadDb, q: Query) {
  const result = getProduction(db, q);
  return { ...result, note: '제품과 표준 생산량이 다른 라인은 총수량만으로 생산성 순위를 매기지 않습니다. 각 라인의 목표 달성률과 불량률을 함께 비교합니다.' };
}
