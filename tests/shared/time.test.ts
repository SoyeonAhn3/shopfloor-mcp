import { describe, expect, it } from 'vitest';
import { addDays, addMinutes, datesBetween, inShiftChange, isWorkingDay, mondayOf, productionDateOf, slotFor, toMinute } from '../../src/shared/time.js';
import { loadConfig, parseConfig } from '../../src/generator/config.js';
import { buildCalendar } from '../../src/generator/calendar.js';

describe('production calendar boundaries',() => {
  it('assigns Friday night after midnight to Friday, including the final minute',() => {
    expect(productionDateOf('2026-08-15T02:30')).toBe('2026-08-14');
    expect(productionDateOf('2026-08-15T07:59')).toBe('2026-08-14');
    expect(productionDateOf('2026-08-15T08:00')).toBe('2026-08-15');
    expect(slotFor('2026-09-30',7)).toBe('2026-10-01T07:00');
    expect(addMinutes('2026-09-30T23:30',180)).toBe('2026-10-01T02:30');
  });
  it('handles changeover half-open intervals and civil dates',() => {
    expect(inShiftChange('2026-07-01T08:19')).toBe(true);
    expect(inShiftChange('2026-07-01T08:20')).toBe(false);
    expect(inShiftChange('2026-07-01T20:00')).toBe(true);
    expect(addDays('2024-02-28',1)).toBe('2024-02-29');
    expect(() => toMinute('2026-02-30')).toThrow();
    expect(() => toMinute('2026-07-01T24:00')).toThrow();
    expect(() => toMinute('2026-07-01T08:00Z')).toThrow();
    expect(() => datesBetween('2026-09-30','2026-07-01')).toThrow();
  });
  it('has the specified 66 working days and alternating crews',() => {
    const config=loadConfig('config/generator.config.json'), days=buildCalendar(config);
    expect(days).toHaveLength(92);
    expect(days.filter(d => d.is_working_day)).toHaveLength(66);
    expect([7,8,9].map(month => days.filter(d => d.is_working_day && Number(d.calendar_date.slice(5,7))===month).length)).toEqual([23,21,22]);
    expect(days.find(d => d.calendar_date==='2026-07-01')?.day_crew).toBe('A');
    expect(days.find(d => d.calendar_date==='2026-07-06')?.day_crew).toBe('B');
    expect(days.find(d => d.calendar_date==='2026-09-15')?.day_crew).toBe('B');
    expect(datesBetween('2026-09-10','2026-09-30').filter(isWorkingDay)).toHaveLength(15);
    expect(mondayOf('2026-07-01')).toBe('2026-06-29');
  });
});
describe('configuration preconditions',() => {
  it.each(['2026-07-18','2026-06-30','2026-02-30'])('rejects invalid E1 date %s',date => {
    const config=loadConfig('config/generator.config.json');
    config.events.E1.date=date;
    expect(() => parseConfig(config)).toThrow();
  });
  it('rejects duplicate lines, non-Friday E7 and overlapping event days',() => {
    const config=loadConfig('config/generator.config.json');
    config.lines[1]!.id='L1';
    expect(() => parseConfig(config)).toThrow();
    const next=loadConfig('config/generator.config.json');
    next.events.E7.date='2026-08-13';
    expect(() => parseConfig(next)).toThrow();
    next.events.E7.date='2026-08-14'; next.events.E6.date=next.events.E3.date;
    expect(() => parseConfig(next)).toThrow();
  });
});
