import type { GeneratorConfig } from './config.js';
import type { CalendarDay, HourlyPlan } from '../shared/types.js';
import { slotFor } from '../shared/time.js';

export function buildPlan(config: GeneratorConfig, calendar: CalendarDay[]): HourlyPlan[] {
  return calendar.filter(day => day.is_working_day).flatMap(day => config.lines.flatMap(line =>
    Array.from({ length: 24 }, (_, offset): HourlyPlan => {
      const hour = (8 + offset) % 24;
      const shift = hour >= 8 && hour < 20 ? 'day' : 'night';
      const maintenance = line.id === config.events.E5.lineId && day.calendar_date === config.events.E5.date;
      const change = config.events.E9.hours.includes(hour as 8 | 20);
      const plannedStop = maintenance ? 60 : change ? 20 : 0;
      return { line_id: line.id, slot_start: slotFor(day.calendar_date,hour), production_date: day.calendar_date,
        shift, crew: (shift === 'day' ? day.day_crew : day.night_crew)!,
        hour_of_day: hour, planned_stop_minutes: plannedStop,
        planned_stop_reason: maintenance ? 'maintenance' : change ? 'shift_change' : null,
        planned_minutes: 60 - plannedStop, target_qty: (60 - plannedStop) * line.stdRatePerHour / 60 };
    })));
}
