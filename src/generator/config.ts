import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { LINE_IDS } from '../shared/codes.js';
import { datesBetween, isWorkingDay, toMinute, weekday } from '../shared/time.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { toMinute(value); return true; } catch { return false; }
}, 'Invalid date');
const stamp = z.string().refine(value => {
  try { return value.length === 16 && Number.isFinite(toMinute(value)); } catch { return false; }
}, 'Invalid plant timestamp');
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const fraction = z.number().min(0).max(1);
const interval = z.tuple([fraction, fraction]).refine(([min, max]) => min <= max, 'Reversed range');
const hour = z.number().int().min(0).max(23);
const hours = z.array(hour).min(1).refine(v => new Set(v).size === v.length, 'Duplicate hours');
const stop = z.strictObject({ start: clock, end: clock }).refine(v => v.start < v.end, 'Stop must end after start');
const line = z.strictObject({
  id: z.enum(LINE_IDS), name: z.string().min(1), product: z.string().min(1),
  stdRatePerHour: z.number().int().positive().max(10000).refine(n => n % 3 === 0, '40-minute target must be integral'),
  baseDefectRate: fraction,
});
const schema = z.strictObject({
  seed: z.number().int().min(0).max(4294967295),
  periodStart: date, periodEnd: date, referenceNow: stamp,
  lines: z.array(line).length(6).refine(v => new Set(v.map(l => l.id)).size === 6, 'All six line IDs must be unique'),
  normal: z.strictObject({
    performance: interval,
    minorStopMinutes: z.tuple([z.number().int().min(1).max(10), z.number().int().min(1).max(10)]).refine(([a,b]) => a <= b),
    defectRateMultiplier: z.tuple([z.number().positive(), z.number().positive()]).refine(([a,b]) => a <= b),
  }),
  events: z.strictObject({
    E1: z.strictObject({ lineId: z.literal('L2'), date, start: clock, end: clock }),
    E2: z.strictObject({ lineId: z.literal('L3'), from: date, to: date, stops: z.array(stop).length(2) }),
    E3: z.strictObject({ lineId: z.literal('L1'), date, hours, defectRate: fraction }),
    E4: z.strictObject({ lineId: z.literal('L4'), from: z.literal('2026-09-10'), to: z.literal('2026-09-30'),
      hour: z.literal(9), stops: z.array(stop).length(2), performance: interval, defectRate: fraction }),
    E5: z.strictObject({ lineId: z.literal('L5'), date }),
    E6: z.strictObject({ lineId: z.literal('L1'), date, hours: hours.refine(v => v.length === 4, 'E6 has four missing slots') }),
    E7: z.strictObject({ lineId: z.literal('L5'), date, start: stamp, end: stamp }),
    E8: z.strictObject({ lineId: z.literal('L5'), date, memo: z.string().min(1) }),
    E9: z.strictObject({ hours: z.tuple([z.literal(8), z.literal(20)]), minutes: z.literal(20) }),
  }),
  seedIssues: z.array(z.strictObject({
    lineId: z.enum(LINE_IDS), date, title: z.string().min(1), description: z.string().min(1),
    severity: z.enum(['low','medium','high']), status: z.enum(['open','in_progress','closed']),
  })).length(25),
}).superRefine((config, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (config.periodStart > config.periodEnd) { fail('Reversed dataset period'); return; }
  if (toMinute(config.periodEnd) - toMinute(config.periodStart) > 366 * 1440) {
    fail('Dataset period must be at most one year'); return;
  }
  if (toMinute(config.referenceNow) < toMinute(config.periodEnd) + 1440 + 480) fail('Reference time must cover the final night shift');
  const e = config.events;
  const eventDates = [e.E1.date,e.E3.date,e.E5.date,e.E6.date,e.E7.date,e.E8.date];
  for (const range of [e.E2,e.E4]) {
    if (range.from > range.to) { fail('Reversed event period'); continue; }
    eventDates.push(...datesBetween(range.from, range.to).filter(isWorkingDay));
  }
  for (const d of [...eventDates, ...config.seedIssues.map(i => i.date)]) {
    if (d < config.periodStart || d > config.periodEnd || !isWorkingDay(d)) fail('Event/issue outside working days: ' + d);
  }
  if (e.E2.from <= e.E2.to && (weekday(e.E2.from) !== 1 || weekday(e.E2.to) !== 5 ||
      datesBetween(e.E2.from,e.E2.to).filter(isWorkingDay).length !== 5)) fail('E2 must span one Monday-Friday week');
  if (e.E3.date === e.E6.date || new Set([e.E5.date,e.E7.date,e.E8.date]).size !== 3) fail('Events on the same line must not share a production day');
  if (e.E3.hours.some(h => h >= 8 && h < 20)) fail('E3 belongs to the night shift');
  if (e.E1.start < '08:20' || e.E1.end > '20:00' ||
      toMinute(e.E1.date+'T'+e.E1.end)-toMinute(e.E1.date+'T'+e.E1.start) !== 240) fail('E1 must be a four-hour day-shift stop');
  if (weekday(e.E7.date) !== 5 || e.E7.start !== e.E7.date+'T23:30' ||
      toMinute(e.E7.end)-toMinute(e.E7.start) !== 180) fail('E7 must cross Friday midnight for 180 minutes');
  for (const s of e.E4.stops) if (s.start < '09:00' || s.end > '10:00') fail('E4 stops must be in the 09:00 hour');
  for (const l of config.lines) if (l.baseDefectRate * config.normal.defectRateMultiplier[1] > 1) fail('Defect rate exceeds 1');
  if (config.seedIssues.some(i => i.lineId === 'L4' && i.date >= e.E4.from && i.date <= e.E4.to)) {
    fail('Seed issues must not cover the E4 line/period');
  }
});
export type GeneratorConfig = z.infer<typeof schema>;
export function parseConfig(input: unknown): GeneratorConfig { return schema.parse(input); }
export function loadConfig(path: string): GeneratorConfig { return parseConfig(JSON.parse(readFileSync(path, 'utf8'))); }
