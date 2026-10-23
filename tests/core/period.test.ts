import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { openReadOnly, type ReadDb } from '../../src/core/db.js';
import { resolvePeriod, shiftMonths, type PeriodInput } from '../../src/core/period.js';
import { datesBetween, isWorkingDay } from '../../src/shared/time.js';
import { removeOwnedTemp } from '../../src/shared/files.js';
import { success } from './fixture.js';

let root: string, db: ReadDb;
const clocks = (reference = '2026-10-01T08:00') => ({ reference: () => reference, system: () => new Date('2030-01-01T00:00:00Z') });
const run = (period: PeriodInput, reference?: string) => resolvePeriod(period, clocks(reference), db);
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'shopfloor-period-'));
  const path = join(root, 'dates.db'), writer = new Database(path);
  writer.exec(`CREATE TABLE dataset_meta(dataset_version,period_start,period_end,reference_now);
    INSERT INTO dataset_meta VALUES ('period-test','2023-01-01','2026-09-30','2026-10-01T08:00');
    CREATE TABLE calendar(calendar_date PRIMARY KEY,is_working_day);`);
  const insert = writer.prepare('INSERT INTO calendar VALUES (?,?)');
  writer.transaction(() => { for (const date of datesBetween('2023-01-01', '2026-09-30')) insert.run(date, Number(isWorkingDay(date))); })();
  writer.close(); db = openReadOnly(path);
});
afterAll(() => { db.close(); removeOwnedTemp(root); });
describe('generic production-period resolution', () => {
  it.each([
    [{ kind: 'last_week' }, '2026-09-21', '2026-09-25'],
    [{ kind: 'weeks_ago', weeks: 2 }, '2026-09-14', '2026-09-18'],
    [{ kind: 'weeks_ago', weeks: 4 }, '2026-08-31', '2026-09-04'],
    [{ kind: 'weeks_ago', weeks: 5 }, '2026-08-24', '2026-08-28'],
    [{ kind: 'recent', unit: 'weeks', count: 4 }, '2026-09-03', '2026-09-30'],
    [{ kind: 'recent', unit: 'weeks', count: 5 }, '2026-08-27', '2026-09-30'],
    [{ kind: 'past_weeks', count: 4 }, '2026-08-31', '2026-09-25'],
    [{ kind: 'last_month' }, '2026-09-01', '2026-09-30'],
    [{ kind: 'months_ago', months: 2 }, '2026-08-03', '2026-08-31'],
    [{ kind: 'month', year: 2026, month: 7 }, '2026-07-01', '2026-07-31'],
    [{ kind: 'week_day', weeksAgo: 1, weekday: 3 }, '2026-09-23', '2026-09-23'],
    [{ kind: 'week_day', weeksAgo: 5, weekday: 1 }, '2026-08-24', '2026-08-24'],
    [{ kind: 'this_week' }, '2026-09-28', '2026-09-30'],
    [{ kind: 'yesterday' }, '2026-09-30', '2026-09-30'],
  ] as [PeriodInput, string, string][])('resolves %j', (input, from, to) => {
    expect(run(input)).toMatchObject({ ok: true, from, to, referenceNow: '2026-10-01T08:00' });
  });
  it('distinguishes trailing months from calendar months and carries the requested weekend bounds', () => {
    expect(run({ kind: 'recent', unit: 'months', count: 1 }, '2026-09-21T08:00')).toMatchObject({
      requested: { from: '2026-08-21', to: '2026-09-20' }, from: '2026-08-21', to: '2026-09-18',
    });
    expect(run({ kind: 'last_month' }, '2026-09-21T08:00')).toMatchObject({ requested: { from: '2026-08-01', to: '2026-08-31' } });
  });
  it('handles leap years, month-end clamping, and week/year boundaries', () => {
    expect(shiftMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(shiftMonths('2025-03-31', -1)).toBe('2025-02-28');
    expect(run({ kind: 'last_month' }, '2024-03-01T08:00')).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
    expect(run({ kind: 'last_week' }, '2024-01-03T08:00')).toMatchObject({ from: '2023-12-25', to: '2023-12-29' });
    expect(run({ kind: 'recent', unit: 'months', count: 1 }, '2024-03-31T08:00')).toMatchObject({ requested: { from: '2024-02-29', to: '2024-03-30' } });
  });
  it('uses the plant 08:00 production-day boundary, independent of the machine clock', () => {
    expect(run({ kind: 'today' }, '2026-10-01T07:59')).toMatchObject({ from: '2026-09-30', to: '2026-09-30' });
    expect(run({ kind: 'today' }, '2026-10-01T08:00')).toMatchObject({ status: 'out_of_range' });
    expect(run({ kind: 'recent', unit: 'days', count: 1 }, '2026-10-01T07:59')).toMatchObject({ from: '2026-09-29', to: '2026-09-29' });
  });
  it('returns non-working and out-of-range states without silently clipping an explicit request', () => {
    expect(run({ kind: 'week_day', weeksAgo: 1, weekday: 6 })).toMatchObject({ ok: false, status: 'non_working_day' });
    expect(run({ kind: 'this_month' })).toMatchObject({ ok: false, status: 'out_of_range' });
    expect(run({ kind: 'range', from: '2026-09-29', to: '2026-10-02' })).toMatchObject({
      status: 'out_of_range', requested: { from: '2026-09-29', to: '2026-10-02' }, available: { from: '2023-01-01', to: '2026-09-30' },
    });
    const range = success(run({ kind: 'range', from: '2026-09-25', to: '2026-09-28' }));
    expect(range.productionDays).toEqual(['2026-09-25', '2026-09-28']);
  });
  it.each([
    { kind: 'weeks_ago', weeks: 0 }, { kind: 'weeks_ago', weeks: 1.5 }, { kind: 'recent', unit: 'weeks', count: -4 },
    { kind: 'week_day', weeksAgo: 1, weekday: 8 }, { kind: 'month', year: 2026, month: 13 },
    { kind: 'date', date: '2026-02-29' }, { kind: 'range', from: '2026-09-30', to: '2026-09-01' },
    { kind: 'last_week', sql: 'DROP TABLE lines' },
  ])('rejects invalid period %j', input => expect(() => run(input as PeriodInput)).toThrow());
});
