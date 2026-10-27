import { z } from 'zod';
import { LABELS } from '../shared/codes.js';
import { addMinutes, overlapMinutes, slotKey, toMinute } from '../shared/time.js';
import type { ReadDb } from './db.js';
import { wrapMemo } from './guards.js';
import { readStops, summarize } from './metrics.js';
import { readSlots, type Query } from './query.js';

const stamp = z.string().length(16).refine(value => { try { toMinute(value); return true; } catch { return false; } });
export const windowSchema = z.strictObject({ from: stamp, to: stamp }).refine(v => v.from < v.to, '시작 시각은 종료 시각보다 빨라야 합니다.');
export type TimeWindow = z.infer<typeof windowSchema>;
export function getDowntime(db: ReadDb, q: Query & { window?: TimeWindow | undefined }) {
  const slots = readSlots(db, q), summary = summarize(slots);
  const items = readStops(db, q).flatMap(stop => {
    const selected = slots.filter(slot => slot.line_id === stop.line_id && slot.production_date === stop.production_date);
    const slotMinutes = Object.fromEntries(selected.map(slot => {
      const from = q.window && q.window.from > slot.slot_start ? q.window.from : slot.slot_start;
      const end = addMinutes(slot.slot_start, 60), to = q.window && q.window.to < end ? q.window.to : end;
      return [slot.slot_start, overlapMinutes(stop.start_at, stop.end_at, from, to)] as const;
    }).filter(([, minutes]) => Number(minutes) > 0));
    const minutes = Object.values(slotMinutes).reduce((sum, n) => sum + n, 0);
    if (!minutes) return [];
    return [{ downtimeId: stop.downtime_id, lineId: stop.line_id, productionDate: stop.production_date,
      start: stop.start_at, end: stop.end_at, durationMinutes: stop.duration_min, selectedMinutes: minutes,
      planned: !!stop.is_planned, reasonCode: stop.reason_code, reasonLabel: LABELS[stop.reason_code], reasonCategory: stop.reason_category,
      slotMinutes, memo: wrapMemo(stop.memo) }];
  });
  const byReason = [...new Set(items.map(item => item.reasonCode))].map(reasonCode => {
    const events = items.filter(item => item.reasonCode === reasonCode);
    return { reasonCode, reasonLabel: LABELS[reasonCode], count: events.length, minutes: events.reduce((sum, event) => sum + event.selectedMinutes, 0) };
  });
  return { ok: true as const, status: summary.status, period: q.period, lineIds: q.lineIds, coverage: summary.coverage,
    totalMinutes: items.reduce((sum, item) => sum + item.selectedMinutes, 0),
    unplannedMinutes: items.filter(item => !item.planned).reduce((sum, item) => sum + item.selectedMinutes, 0), byReason, items };
}
interface Defect { line_id: string; production_date: string; detected_at: string; defect_type: string; shift: string; crew: string }
export function getDefects(db: ReadDb, q: Query) {
  const slots = readSlots(db, q), selected = new Set(slots.map(s => slotKey(s.line_id, s.slot_start))), total = summarize(slots);
  const events = db.all<Defect>(`SELECT line_id,production_date,detected_at,defect_type,shift,crew FROM defect_events
    WHERE line_id IN (SELECT value FROM json_each(?)) AND production_date IN (SELECT value FROM json_each(?))`,
  [JSON.stringify(q.lineIds), JSON.stringify(q.period.productionDays)])
    .filter(event => selected.has(slotKey(event.line_id, event.detected_at.slice(0, 13) + ':00')));
  const groups = new Map<string, { lineId: string; productionDate: string; hour: number; shift: string; crew: string; defectType: string; count: number }>();
  for (const event of events) {
    const hour = Number(event.detected_at.slice(11, 13));
    const key = [event.line_id, event.production_date, hour, event.defect_type].join('|');
    const item = groups.get(key) ?? { lineId: event.line_id, productionDate: event.production_date, hour,
      shift: event.shift, crew: event.crew, defectType: event.defect_type, count: 0 };
    item.count++; groups.set(key, item);
  }
  return { ok: true as const, status: total.status, period: q.period, lineIds: q.lineIds, total,
    recordedDefects: events.length, items: [...groups.values()] };
}
export function compareDefects(db: ReadDb, currentQuery: Query, baselineQuery: Query) {
  const current = getDefects(db, currentQuery), baseline = getDefects(db, baselineQuery);
  const rate = current.total.defectRate, baseRate = baseline.total.defectRate;
  return { ...current, comparison: { ...baseline,
    ratioToBaseline: rate !== null && baseRate ? rate / baseRate : null,
    changePercentagePoints: rate !== null && baseRate !== null ? (rate - baseRate) * 100 : null,
    ratioUnavailableReason: rate === null || baseRate === null ? '불량률을 계산할 관측 생산량이 없습니다.' : baseRate === 0 ? '비교 기준 불량률이 0입니다.' : null,
    complete: current.total.coverage.complete && baseline.total.coverage.complete } };
}
