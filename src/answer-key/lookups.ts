import type { GeneratorConfig } from '../generator/config.js';
import type { GeneratedDataset } from '../shared/types.js';
import { addDays, mondayOf, slotKey } from '../shared/time.js';

// Independent arithmetic over generated observations; never imports server calculations.
export function buildEvaluationLookups(config: GeneratorConfig, data: GeneratedDataset): Record<string, number | string> {
  const values: Record<string, number | string> = {
    reference_now: config.referenceNow, available_from: config.periodStart, available_to: config.periodEnd,
  };
  const weekStart = mondayOf(config.referenceNow.slice(0, 10));
  const periods = [
    { name: 'last_week', from: addDays(weekStart, -7), to: addDays(weekStart, -3) },
    { name: 'two_weeks_ago', from: addDays(weekStart, -14), to: addDays(weekStart, -10) },
  ];
  const outputs = new Map(data.tables.hourly_output.map(row => [slotKey(row.line_id, row.slot_start), row]));
  const rates = new Map(config.lines.map(line => [line.id, line.stdRatePerHour]));
  for (const period of periods) {
    values[period.name + '_from'] = period.from;
    values[period.name + '_to'] = period.to;
    for (const line of [...config.lines.map(line => line.id), 'ALL']) {
      let produced = 0, good = 0, target = 0, missing = 0;
      const days = new Set<string>();
      for (const plan of data.tables.hourly_plan) {
        if ((line !== 'ALL' && plan.line_id !== line) || plan.production_date < period.from || plan.production_date > period.to) continue;
        days.add(plan.production_date);
        const minutes = plan.line_id === config.events.E5.lineId && plan.production_date === config.events.E5.date
          ? 0 : [8, 20].includes(plan.hour_of_day) ? 40 : 60;
        const output = outputs.get(slotKey(plan.line_id, plan.slot_start));
        if (!output) { if (minutes > 0) missing++; continue; }
        target += minutes * rates.get(plan.line_id)! / 60;
        produced += output.produced_qty;
        good += output.good_qty;
      }
      const prefix = line + '_' + period.name + '_';
      Object.assign(values, {
        [prefix + 'produced']: produced, [prefix + 'good']: good, [prefix + 'target']: target,
        [prefix + 'achievement']: target > 0 ? good / target : 'not_applicable',
        [prefix + 'missing_slots']: missing, [prefix + 'production_days']: days.size,
      });
    }
  }
  for (const line of [...config.lines.map(line => line.id), 'ALL']) {
    const current = Number(values[line + '_last_week_produced']);
    const previous = Number(values[line + '_two_weeks_ago_produced']);
    values[line + '_weekly_produced_delta'] = current - previous;
    values[line + '_weekly_produced_change_pct'] = previous === 0 ? 'not_applicable' : (current - previous) / previous * 100;
  }
  return values;
}
