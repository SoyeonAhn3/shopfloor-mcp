const MINUTE = 60000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// Plant-local text is a civil-time coordinate, never the computer's local timezone.
export function toMinute(value: string): number {
  const text = DATE_PATTERN.test(value) ? value + 'T00:00' : value;
  if (!TIME_PATTERN.test(text)) throw new Error('Invalid plant timestamp: ' + value);
  const ms = Date.parse(text + ':00.000Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 16) !== text) {
    throw new Error('Invalid calendar date/time: ' + value);
  }
  return ms / MINUTE;
}
export function fromMinute(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error('Expected whole minutes');
  return new Date(value * MINUTE).toISOString().slice(0, 16);
}
export function addMinutes(value: string, minutes: number): string {
  return fromMinute(toMinute(value) + minutes);
}
export function addDays(date: string, days: number): string {
  return addMinutes(date, days * 1440).slice(0, 10);
}
export function hourOf(value: string): number { return Number(value.slice(11, 13)); }
export function minuteOfDay(value: string): number { return hourOf(value) * 60 + Number(value.slice(14, 16)); }
export function productionDateOf(value: string): string {
  toMinute(value);
  const date = value.slice(0, 10);
  return hourOf(value) < 8 ? addDays(date, -1) : date;
}
export function weekday(date: string): number { return new Date(toMinute(date) * MINUTE).getUTCDay(); }
export function isWorkingDay(date: string): boolean { return ![0, 6].includes(weekday(date)); }
export function mondayOf(date: string): string { return addDays(date, -((weekday(date) + 6) % 7)); }
export function datesBetween(from: string, to: string): string[] {
  if (toMinute(from) > toMinute(to)) throw new Error('Date range is reversed');
  const result: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) result.push(date);
  return result;
}
export function slotFor(productionDate: string, hour: number): string {
  return (hour < 8 ? addDays(productionDate, 1) : productionDate) + 'T' + String(hour).padStart(2, '0') + ':00';
}
export function shiftOf(value: string): 'day' | 'night' {
  return hourOf(value) >= 8 && hourOf(value) < 20 ? 'day' : 'night';
}
export function inShiftChange(value: string): boolean {
  return [8, 20].includes(hourOf(value)) && Number(value.slice(14, 16)) < 20;
}
export function overlapMinutes(start: string, end: string, from: string, to: string): number {
  return Math.max(0, Math.min(toMinute(end), toMinute(to)) - Math.max(toMinute(start), toMinute(from)));
}
export function slotKey(line: string, slot: string): string { return line + '|' + slot; }
