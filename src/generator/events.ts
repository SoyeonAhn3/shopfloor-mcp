import type { LineId, ReasonCode } from '../shared/codes.js';
import { REASONS } from '../shared/codes.js';
import type { CalendarDay, DowntimeEvent } from '../shared/types.js';
import { addDays, datesBetween, inShiftChange, isWorkingDay, productionDateOf, shiftOf, toMinute, fromMinute } from '../shared/time.js';
import type { GeneratorConfig } from './config.js';

export class DowntimeBuilder {
  readonly rows: DowntimeEvent[] = [];
  readonly eventIds: Record<string,string[]> = {};
  private readonly calendar: Map<string,CalendarDay>;
  constructor(calendar: CalendarDay[]) { this.calendar = new Map(calendar.map(d => [d.calendar_date,d])); }
  available(lineId: LineId, start: string, end: string): boolean {
    return !this.rows.some(row => row.line_id === lineId && start < row.end_at && row.start_at < end);
  }
  add(lineId: LineId, start: string, end: string, reason: ReasonCode, memo: string, event?: string): DowntimeEvent {
    const date = productionDateOf(start), day = this.calendar.get(date);
    const duration = toMinute(end) - toMinute(start);
    if (!day?.is_working_day || duration <= 0 || productionDateOf(fromMinute(toMinute(end)-1)) !== date) {
      throw new Error('Downtime outside one working production day: ' + start);
    }
    for (let minute = toMinute(start); minute < toMinute(end); minute++) {
      if (inShiftChange(fromMinute(minute))) throw new Error('Downtime overlaps shift change: ' + start);
    }
    if (!this.available(lineId,start,end)) throw new Error('Overlapping downtime: ' + lineId + ' ' + start);
    const shift = shiftOf(start), crew = (shift === 'day' ? day.day_crew : day.night_crew)!;
    if (shiftOf(fromMinute(toMinute(end)-1)) !== shift) throw new Error('Split downtime at shift boundary');
    const row: DowntimeEvent = {
      downtime_id: 'DT-' + String(this.rows.length+1).padStart(5,'0'), line_id: lineId,
      production_date: date, shift, crew, start_at: start, end_at: end, duration_min: duration,
      reason_category: REASONS[reason], reason_code: reason, is_planned: Number(reason === 'maintenance'),
      memo, entered_by: 'W-' + lineId + '-' + crew + '1',
    };
    this.rows.push(row);
    if (event) (this.eventIds[event] ??= []).push(row.downtime_id);
    return row;
  }
}
export function plantDowntime(config: GeneratorConfig, builder: DowntimeBuilder): void {
  const e = config.events;
  builder.add('L2',e.E1.date+'T'+e.E1.start,e.E1.date+'T'+e.E1.end,'breakdown','구동 벨트 파손 확인, 교체 후 재가동.','E1');
  for (const date of datesBetween(e.E2.from,e.E2.to).filter(isWorkingDay)) {
    for (const stop of e.E2.stops) builder.add('L3',date+'T'+stop.start,date+'T'+stop.end,'material_shortage','자재 도착 대기 후 재가동.','E2');
  }
  for (const date of datesBetween(e.E4.from,e.E4.to).filter(isWorkingDay)) {
    for (const stop of e.E4.stops) builder.add('L4',date+'T'+stop.start,date+'T'+stop.end,'minor_stop','투입부 상태 확인 후 재가동.','E4');
  }
  builder.add('L5',e.E5.date+'T08:20',e.E5.date+'T20:00','maintenance','정기 설비 점검: 주간.','E5');
  builder.add('L5',e.E5.date+'T20:20',addDays(e.E5.date,1)+'T08:00','maintenance','정기 설비 점검: 야간.','E5');
  builder.add('L5',e.E7.start,e.E7.end,'breakdown','벨트 교체 후 재가동.','E7');
}
