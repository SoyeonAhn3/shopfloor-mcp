import { DEFECT_TYPES } from '../shared/codes.js';
import type { CalendarDay, DefectEvent, DowntimeEvent, HourlyOutput, HourlyPlan } from '../shared/types.js';
import { addMinutes, inShiftChange, overlapMinutes, slotFor } from '../shared/time.js';
import type { GeneratorConfig } from './config.js';
import { DowntimeBuilder } from './events.js';
import { SeededRandom } from './rng.js';

export function isMissing(config: GeneratorConfig, plan: HourlyPlan): boolean {
  return plan.line_id === config.events.E6.lineId && plan.production_date === config.events.E6.date &&
    config.events.E6.hours.includes(plan.hour_of_day);
}
export function addNormalDowntime(config: GeneratorConfig, calendar: CalendarDay[], builder: DowntimeBuilder, rng: SeededRandom): string {
  let attackId = '';
  for (const day of calendar.filter(d => d.is_working_day)) for (const line of config.lines) {
    if (line.id === 'L5' && day.calendar_date === config.events.E5.date) continue;
    let added = false;
    for (let attempt = 0; attempt < 200 && !added; attempt++) {
      const hour = rng.int(0,23);
      if (line.id === 'L1' && day.calendar_date === config.events.E6.date && config.events.E6.hours.includes(hour)) continue;
      if (line.id === 'L4' && day.calendar_date >= config.events.E4.from && day.calendar_date <= config.events.E4.to && hour === 9) continue;
      const duration = rng.int(...config.normal.minorStopMinutes);
      const start = addMinutes(slotFor(day.calendar_date,hour),rng.int([8,20].includes(hour) ? 20 : 0,60-duration));
      const end = addMinutes(start,duration);
      if (!builder.available(line.id,start,end)) continue;
      const attack = line.id === 'L5' && day.calendar_date === config.events.E8.date;
      const row = builder.add(line.id,start,end,'minor_stop',attack ? config.events.E8.memo : '순간 정지 후 상태 확인 및 재가동.');
      if (attack) attackId = row.downtime_id;
      added = true;
    }
    if (!added) throw new Error('No room for normal downtime: ' + line.id + ' ' + day.calendar_date);
  }
  if (!attackId) throw new Error('E8 memo was not planted');
  return attackId;
}
export function buildOutput(config: GeneratorConfig, plans: HourlyPlan[], downtimes: DowntimeEvent[], rng: SeededRandom): {
  outputs: HourlyOutput[]; defects: DefectEvent[];
} {
  const outputs: HourlyOutput[] = [], defects: DefectEvent[] = [];
  const byLineDay = new Map<string,DowntimeEvent[]>();
  for (const stop of downtimes) {
    const key = stop.line_id + '|' + stop.production_date;
    const rows = byLineDay.get(key) ?? []; rows.push(stop); byLineDay.set(key,rows);
  }
  for (const plan of plans) {
    if (isMissing(config,plan)) continue;
    const line = config.lines.find(l => l.id === plan.line_id)!;
    const stops = byLineDay.get(plan.line_id+'|'+plan.production_date) ?? [];
    const slotEnd = addMinutes(plan.slot_start,60);
    const lostMinutes = stops.filter(s => !s.is_planned).reduce((sum,s) => sum + overlapMinutes(s.start_at,s.end_at,plan.slot_start,slotEnd),0);
    const recurring = plan.line_id === 'L4' && plan.production_date >= config.events.E4.from &&
      plan.production_date <= config.events.E4.to && plan.hour_of_day === 9;
    const burst = plan.line_id === 'L1' && plan.production_date === config.events.E3.date && config.events.E3.hours.includes(plan.hour_of_day);
    const performance = rng.between(...(recurring ? config.events.E4.performance : config.normal.performance));
    const available = plan.planned_minutes - lostMinutes;
    if (available < 0) throw new Error('Downtime exceeds available minutes');
    const produced = Math.floor(available * line.stdRatePerHour / 60 * performance);
    const rate = burst ? config.events.E3.defectRate : recurring ? config.events.E4.defectRate :
      line.baseDefectRate * rng.between(...config.normal.defectRateMultiplier);
    const bad = Math.min(produced,Math.round(produced * rate));
    outputs.push({line_id: plan.line_id,slot_start: plan.slot_start,produced_qty: produced,good_qty: produced-bad});
    if (!bad) continue;
    const minutes = Array.from({length:60},(_,m) => addMinutes(plan.slot_start,m)).filter(t =>
      !inShiftChange(t) && !stops.some(s => s.start_at <= t && t < s.end_at));
    if (!minutes.length) throw new Error('Defects without an operating minute');
    for (let i = 0; i < bad; i++) defects.push({
      defect_id: 'DF-' + String(defects.length+1).padStart(6,'0'), line_id: plan.line_id,
      production_date: plan.production_date, detected_at: rng.pick(minutes), shift: plan.shift,
      crew: plan.crew, defect_type: burst ? 'dimension' : rng.pick(DEFECT_TYPES),
      worker_id: 'W-' + plan.line_id + '-' + plan.crew + rng.int(1,2),
    });
  }
  return { outputs,defects };
}
