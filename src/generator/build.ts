import { randomUUID } from 'node:crypto';
import type { GeneratedDataset } from '../shared/types.js';
import { buildCalendar, buildWorkers } from './calendar.js';
import { parseConfig, type GeneratorConfig } from './config.js';
import { DowntimeBuilder, plantDowntime } from './events.js';
import { buildIssues } from './issues.js';
import { addNormalDowntime, buildOutput } from './normal.js';
import { buildPlan } from './plan.js';
import { SeededRandom } from './rng.js';

export function buildDataset(input: GeneratorConfig): GeneratedDataset {
  const config = parseConfig(input);
  const calendar = buildCalendar(config), plans = buildPlan(config,calendar), rng = new SeededRandom(config.seed);
  const downtime = new DowntimeBuilder(calendar);
  plantDowntime(config,downtime);
  const attackDowntimeId = addNormalDowntime(config,calendar,downtime,rng);
  const {outputs,defects} = buildOutput(config,plans,downtime.rows,rng);
  return {
    tables: {
      dataset_meta: [{dataset_version: 'ds-'+randomUUID(),seed: config.seed,period_start: config.periodStart,
        period_end: config.periodEnd,reference_now: config.referenceNow,generated_at: new Date().toISOString()}],
      lines: config.lines.map(l => ({line_id:l.id,line_name:l.name,product_name:l.product,std_rate_per_hour:l.stdRatePerHour})),
      workers: buildWorkers(config), calendar, hourly_plan: plans, hourly_output: outputs,
      downtime_events: downtime.rows, defect_events: defects, issues: buildIssues(config), issue_drafts: [], audit_log: [],
    },
    planted: {downtimeIds: downtime.eventIds,attackDowntimeId},
  };
}
