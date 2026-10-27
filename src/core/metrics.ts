import type { LineId, ReasonCode } from '../shared/codes.js';
import { addMinutes, overlapMinutes, slotKey } from '../shared/time.js';
import type { ReadDb } from './db.js';
import type { Resolved } from './period.js';
import { readSlots, type Query, type Slot } from './query.js';
import { slotStatus, type DataState } from './status.js';

export function summarize(slots: Slot[]) {
  const missing = slots.filter(s => slotStatus(s.target_qty, s.produced_qty) === 'missing_data');
  const observed = slots.filter(s => s.produced_qty !== null);
  const produced = observed.length ? observed.reduce((sum, s) => sum + s.produced_qty!, 0) : null;
  const good = observed.length ? observed.reduce((sum, s) => sum + s.good_qty!, 0) : null;
  const target = observed.length ? observed.reduce((sum, s) => sum + s.target_qty, 0) : null;
  const status: DataState = missing.length || !slots.length ? 'missing_data'
    : slots.every(s => s.target_qty === 0) ? 'planned_stop' : produced === 0 ? 'zero_production' : 'ok';
  return {
    status, produced, good, defects: produced !== null && good !== null ? produced - good : null, target,
    plannedTarget: slots.reduce((sum, s) => sum + s.target_qty, 0),
    achievement: target && good !== null ? good / target : null,
    defectRate: produced && good !== null ? (produced - good) / produced : null,
    coverage: { plannedSlots: slots.length, observedSlots: observed.length, missingSlots: missing.map(s => ({ lineId: s.line_id, slot: s.slot_start })),
      complete: slots.length > 0 && !missing.length,
      note: missing.length || !slots.length ? '미입력 구간은 0으로 채우지 않았습니다. 수치와 목표는 관측된 구간 기준입니다.' : '선택한 구간의 실적 기록이 있습니다.' },
  };
}
export type Summary = ReturnType<typeof summarize>;
export function getProduction(db: ReadDb, q: Query & { compareTo?: Resolved; grain?: 'hour' | 'shift' | 'day' }) {
  const build = (period: Resolved) => {
    const slots = readSlots(db, { ...q, period }), total = summarize(slots);
    const lines = q.lineIds.map(lineId => ({ lineId, ...summarize(slots.filter(s => s.line_id === lineId)) }));
    const grouped = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = q.grain === 'hour' ? slot.slot_start : q.grain === 'shift' ? slot.production_date + '|' + slot.shift : slot.production_date;
      const id = slot.line_id + '|' + key;
      const group = grouped.get(id) ?? []; group.push(slot); grouped.set(id, group);
    }
    const items = [...grouped.values()].map(group => {
      const first = group[0]!;
      return { lineId: first.line_id, productionDate: first.production_date,
        ...(q.grain === 'hour' ? { slot: first.slot_start } : {}),
        ...(q.grain === 'shift' ? { shift: first.shift } : {}), ...summarize(group) };
    });
    return { period, total, lines, items };
  };
  const current = build(q.period);
  if (!q.compareTo) return { ok: true as const, status: current.total.status, ...current, comparison: null };
  const previous = build(q.compareTo);
  const changes = [change('ALL', current.total, previous.total), ...q.lineIds.map(lineId =>
    change(lineId, current.lines.find(l => l.lineId === lineId)!, previous.lines.find(l => l.lineId === lineId)!))];
  return { ok: true as const, status: current.total.status, ...current, comparison: { ...previous, changes } };
}
function change(lineId: LineId | 'ALL', current: Summary, previous: Summary) {
  const delta = current.produced !== null && previous.produced !== null ? current.produced - previous.produced : null;
  const percent = delta !== null && previous.produced ? delta / previous.produced * 100 : null;
  return { lineId, producedDelta: delta, producedChangePct: percent,
    percentUnavailableReason: percent !== null ? null : previous.produced === 0 ? '비교 기준 생산량이 0입니다.' : '비교할 실적이 없습니다.',
    complete: current.coverage.complete && previous.coverage.complete,
    note: current.coverage.complete && previous.coverage.complete ? '각 기간의 합계를 비교했습니다.' : '관측된 구간끼리의 비교입니다. 누락 구간 때문에 전체 실적 증감을 단정할 수 없습니다.' };
}
export function getAchievement(db: ReadDb, q: Query) { return getProduction(db, q); }

export interface Stop {
  downtime_id: string; line_id: LineId; production_date: string; shift: 'day' | 'night'; crew: 'A' | 'B';
  start_at: string; end_at: string; duration_min: number; reason_code: ReasonCode; reason_category: string; is_planned: number; memo: string;
}
export function readStops(db: ReadDb, q: Query): Stop[] {
  return db.all<Stop>(`SELECT downtime_id,line_id,production_date,shift,crew,start_at,end_at,duration_min,reason_code,reason_category,is_planned,memo
    FROM downtime_events WHERE line_id IN (SELECT value FROM json_each(?))
      AND production_date IN (SELECT value FROM json_each(?)) ORDER BY start_at,downtime_id`,
  [JSON.stringify(q.lineIds), JSON.stringify(q.period.productionDays)]);
}
export function stopsByDay(stops: Stop[]): Map<string, Stop[]> {
  const map = new Map<string, Stop[]>();
  for (const stop of stops) {
    const key = slotKey(stop.line_id, stop.production_date), values = map.get(key) ?? [];
    values.push(stop); map.set(key, values);
  }
  return map;
}
export function stopMinutes(slot: Slot, stops: Stop[]): number {
  // Planned shift-change minutes occupy the start of 08/20 slots. Maintenance leaves no operating interval.
  if (!slot.planned_minutes) return 0;
  return stops.filter(s => !s.is_planned).reduce((sum, stop) => sum + overlapMinutes(stop.start_at, stop.end_at,
    addMinutes(slot.slot_start, slot.planned_stop_minutes), addMinutes(slot.slot_start, 60)), 0);
}
export function breakdownLoss(db: ReadDb, q: Query) {
  const slots = readSlots(db, q), stops = stopsByDay(readStops(db, q));
  const items = slots.filter(slot => slot.produced_qty !== null).map(slot => {
    const downtimeMinutes = stopMinutes(slot, stops.get(slotKey(slot.line_id, slot.production_date)) ?? []);
    const target60 = slot.planned_minutes * slot.std_rate_per_hour;
    const downtimeLoss60 = downtimeMinutes * slot.std_rate_per_hour;
    const defectLoss60 = (slot.produced_qty! - slot.good_qty!) * 60;
    const speedLoss60 = target60 - downtimeLoss60 - slot.produced_qty! * 60;
    if (speedLoss60 < 0) throw new Error('Output or overlapping downtime exceeds planned capacity');
    return { lineId: slot.line_id, slot: slot.slot_start, target60, good60: slot.good_qty! * 60,
      downtimeMinutes, downtimeLoss60, defectLoss60, speedLoss60 };
  });
  const total = items.reduce((a, s) => ({ target60: a.target60 + s.target60, good60: a.good60 + s.good60,
    downtimeLoss60: a.downtimeLoss60 + s.downtimeLoss60, speedLoss60: a.speedLoss60 + s.speedLoss60, defectLoss60: a.defectLoss60 + s.defectLoss60 }),
  { target60: 0, good60: 0, downtimeLoss60: 0, speedLoss60: 0, defectLoss60: 0 });
  const summary = summarize(slots);
  return { ok: true as const, status: summary.status, period: q.period, lineIds: q.lineIds, coverage: summary.coverage, items,
    total: items.length ? { ...total, downtimeLoss: total.downtimeLoss60 / 60, speedLoss: total.speedLoss60 / 60,
      defectLoss: total.defectLoss60 / 60, shortfall: (total.target60 - total.good60) / 60 } : null };
}
