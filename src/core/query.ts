import { z } from 'zod';
import { LINE_IDS } from '../shared/codes.js';
import type { HourlyPlan, Line } from '../shared/types.js';
import type { ReadDb } from './db.js';
import { dateSchema } from './guards.js';
import { periodSchema, type Resolved } from './period.js';

export const filtersShape = {
  lineIds: z.array(z.enum(LINE_IDS)).min(1).max(6).refine(v => new Set(v).size === v.length).default([...LINE_IDS]),
  hours: z.array(z.number().int().min(0).max(23)).min(1).max(24).refine(v => new Set(v).size === v.length).optional(),
  shift: z.enum(['day', 'night']).optional(), crew: z.enum(['A', 'B']).optional(),
  excludeDates: z.array(dateSchema).max(3660).optional(),
};
export const querySchema = z.strictObject({ ...filtersShape, period: periodSchema });
export const productionSchema = querySchema.extend({ compareTo: periodSchema.optional(), grain: z.enum(['hour', 'shift', 'day']).default('day') });
export type Filters = z.infer<typeof querySchema>;
export type Query = Omit<Filters, 'period'> & { period: Resolved };
export interface Slot extends HourlyPlan { produced_qty: number | null; good_qty: number | null; std_rate_per_hour: number }
export function lineInfo(db: ReadDb): Line[] {
  return db.all<Line>('SELECT line_id,line_name,product_name,std_rate_per_hour FROM lines ORDER BY line_id');
}
export function readSlots(db: ReadDb, q: Query): Slot[] {
  return db.all<Slot>(`SELECT p.*,o.produced_qty,o.good_qty,l.std_rate_per_hour
    FROM hourly_plan p LEFT JOIN hourly_output o ON o.line_id=p.line_id AND o.slot_start=p.slot_start
    JOIN lines l ON l.line_id=p.line_id
    WHERE p.line_id IN (SELECT value FROM json_each(?))
      AND p.production_date IN (SELECT value FROM json_each(?))
      AND (? IS NULL OR p.hour_of_day IN (SELECT value FROM json_each(?)))
      AND (? IS NULL OR p.shift=?) AND (? IS NULL OR p.crew=?)
      AND p.production_date NOT IN (SELECT value FROM json_each(?))
    ORDER BY p.production_date,p.line_id,p.slot_start`, [JSON.stringify(q.lineIds), JSON.stringify(q.period.productionDays),
    q.hours ? JSON.stringify(q.hours) : null, q.hours ? JSON.stringify(q.hours) : null,
    q.shift ?? null, q.shift ?? null, q.crew ?? null, q.crew ?? null, JSON.stringify(q.excludeDates ?? [])]);
}
