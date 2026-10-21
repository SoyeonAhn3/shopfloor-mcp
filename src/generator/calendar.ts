import type { GeneratorConfig } from './config.js';
import type { CalendarDay, Worker } from '../shared/types.js';
import { datesBetween, isWorkingDay, mondayOf, toMinute, weekday } from '../shared/time.js';

export function buildCalendar(config: GeneratorConfig): CalendarDay[] {
  const epoch = mondayOf(config.periodStart);
  return datesBetween(config.periodStart, config.periodEnd).map(date => {
    const working = isWorkingDay(date);
    const evenWeek = Math.floor((toMinute(mondayOf(date)) - toMinute(epoch)) / (7 * 1440)) % 2 === 0;
    return { calendar_date: date, day_of_week: ['sun','mon','tue','wed','thu','fri','sat'][weekday(date)]!,
      is_working_day: Number(working), week_start: mondayOf(date),
      day_crew: working ? (evenWeek ? 'A' : 'B') : null,
      night_crew: working ? (evenWeek ? 'B' : 'A') : null };
  });
}
export function buildWorkers(config: GeneratorConfig): Worker[] {
  return config.lines.flatMap(line => (['A','B'] as const).flatMap(crew => [1,2].map(number => ({
    worker_id: 'W-' + line.id + '-' + crew + number, line_id: line.id, crew,
  }))));
}
