import { z } from 'zod';
import type { CalendarDay } from '../shared/types.js';
import { addDays, datesBetween, mondayOf, productionDateOf } from '../shared/time.js';
import type { Clocks } from './clock.js';
import type { ReadDb } from './db.js';
import { dateSchema } from './guards.js';

const count = z.number().int().min(1).max(3660);
export const periodSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month']) }),
  z.strictObject({ kind: z.literal('date'), date: dateSchema }),
  z.strictObject({ kind: z.literal('range'), from: dateSchema, to: dateSchema }).refine(v => v.from <= v.to, '기간 시작은 끝보다 늦을 수 없습니다.'),
  z.strictObject({ kind: z.literal('weeks_ago'), weeks: count }),
  z.strictObject({ kind: z.literal('months_ago'), months: count }),
  z.strictObject({ kind: z.literal('month'), year: z.number().int().min(1).max(9999), month: z.number().int().min(1).max(12) }),
  z.strictObject({ kind: z.literal('week_day'), weeksAgo: z.number().int().min(0).max(3660), weekday: z.number().int().min(1).max(7) }),
  z.strictObject({ kind: z.literal('recent'), unit: z.enum(['days', 'weeks', 'months']), count }),
  z.strictObject({ kind: z.literal('past_weeks'), count }),
]);
export type PeriodInput = z.infer<typeof periodSchema>;
export type Range = { from: string; to: string };
export type Resolved = Range & {
  ok: true; requested: Range; productionDays: string[]; label: string; referenceNow: string;
};
export type PeriodFailure = {
  ok: false; status: 'out_of_range' | 'non_working_day'; requested: Range; available: Range; message: string;
};

function monthStart(date: string): string { return date.slice(0, 7) + '-01'; }
// Calendar-month arithmetic, clamped at month end (Jan 31 + 1 month -> Feb 28/29).
export function shiftMonths(date: string, amount: number): string {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const index = year * 12 + month - 1 + amount;
  const y = Math.floor(index / 12), m = index % 12 + 1;
  if (y < 1 || y > 9999) throw new RangeError('지원하는 날짜 범위를 벗어났습니다.');
  const start = String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-01';
  const last = m === 12 ? String(y + 1).padStart(4, '0') + '-01-01' : String(y).padStart(4, '0') + '-' + String(m + 1).padStart(2, '0') + '-01';
  const days = Number(addDays(last, -1).slice(8, 10));
  return start.slice(0, 8) + String(Math.min(Number(date.slice(8, 10)), days)).padStart(2, '0');
}
export function resolvePeriod(input: PeriodInput, clocks: Clocks, db: ReadDb): Resolved | PeriodFailure {
  const p = periodSchema.parse(input);
  const today = productionDateOf(clocks.reference()), completed = addDays(today, -1);
  let from: string, to: string, label: string;
  switch (p.kind) {
    case 'today': from = to = today; label = '오늘 생산일'; break;
    case 'yesterday': from = to = completed; label = '어제 생산일'; break;
    case 'date': from = to = p.date; label = '지정 생산일'; break;
    case 'range': ({ from, to } = p); label = '지정 생산일 범위'; break;
    case 'this_week': from = mondayOf(today); to = completed < from ? from : completed; label = '이번 주 완료된 생산일까지'; break;
    case 'last_week': case 'weeks_ago': {
      const n = p.kind === 'weeks_ago' ? p.weeks : 1;
      from = addDays(mondayOf(today), -7 * n); to = addDays(from, 6); label = `${n}주 전 (월~일 중 생산일)`; break;
    }
    case 'week_day':
      from = to = addDays(mondayOf(today), -7 * p.weeksAgo + p.weekday - 1);
      label = `${p.weeksAgo}주 전 ${['월','화','수','목','금','토','일'][p.weekday - 1]}요일`; break;
    case 'this_month': from = monthStart(today); to = completed < from ? from : completed; label = '이번 달 완료된 생산일까지'; break;
    case 'last_month': case 'months_ago': {
      const n = p.kind === 'months_ago' ? p.months : 1;
      from = shiftMonths(monthStart(today), -n); to = addDays(shiftMonths(from, 1), -1); label = `${n}개월 전 달력 월`; break;
    }
    case 'month':
      from = String(p.year).padStart(4, '0') + '-' + String(p.month).padStart(2, '0') + '-01';
      to = addDays(shiftMonths(from, 1), -1); label = `${p.year}년 ${p.month}월`; break;
    case 'past_weeks':
      from = addDays(mondayOf(today), -7 * p.count); to = addDays(mondayOf(today), -1); label = `완료된 달력 주 ${p.count}주`; break;
    case 'recent':
      to = completed;
      from = p.unit === 'months' ? shiftMonths(today, -p.count) : addDays(today, -p.count * (p.unit === 'weeks' ? 7 : 1));
      label = `최근 ${p.count}${{ days: '일', weeks: '주', months: '개월' }[p.unit]} (완료된 생산일까지)`; break;
  }
  dateSchema.parse(from); dateSchema.parse(to);
  const meta = db.metadata(), requested = { from, to };
  const available = { from: meta.period_start, to: meta.period_end };
  if (from < available.from || to > available.to) return {
    ok: false, status: 'out_of_range', requested, available,
    message: `요청 기간 ${from}~${to}은 조회 가능 범위 ${available.from}~${available.to}를 벗어납니다. 기간을 변경해 주세요.`,
  };
  const calendar = db.all<CalendarDay>('SELECT * FROM calendar WHERE calendar_date BETWEEN ? AND ? ORDER BY calendar_date', [from, to]);
  if (calendar.length !== datesBetween(from, to).length) throw new Error('Calendar coverage is incomplete');
  const days = calendar.filter(day => day.is_working_day === 1).map(day => day.calendar_date);
  if (!days.length) return { ok: false, status: 'non_working_day', requested, available,
    message: '요청한 생산일은 휴무일입니다. 토요일 00:00~08:00 기록은 금요일 생산일의 야간에 속합니다.' };
  return { ok: true, from: days[0]!, to: days.at(-1)!, requested, productionDays: days,
    label: `${label}: ${days[0]}~${days.at(-1)} (${days.length}생산일)`, referenceNow: clocks.reference() };
}
