import { z } from 'zod';
import { createClocks, type Clocks } from './clock.js';
import { openReadOnly, RuntimeWriter } from './db.js';
import { audited } from './audit.js';
import { dateSchema, roleSchema, type Role } from './guards.js';
import { periodSchema, resolvePeriod, type PeriodInput } from './period.js';
import { lineInfo, productionSchema, querySchema, type Query } from './query.js';
import { breakdownLoss, getAchievement, getProduction } from './metrics.js';
import { compareDefects, getDefects, getDowntime, windowSchema } from './records.js';
import { compareLines, detectAnomalies, hourlyPattern } from './analysis.js';
import { confirmDraft, createDraft, createHumanContext, type DraftEdits, type ToolContext } from './issues.js';

export interface CoreOptions { dbPath: string; sessionId: string; userName: string; role: Role; clocks?: Clocks }
// Public operations all validate, guard, audit and redact. No arbitrary SQL or confirm operation is exposed in tools;
// confirmation lives on the separate human entry, which only the host's button handler receives.
export function createCore(options: CoreOptions) {
  roleSchema.parse(options.role);
  z.string().trim().min(1).max(200).parse(options.sessionId);
  z.string().trim().min(1).max(200).parse(options.userName);
  const db = openReadOnly(options.dbPath);
  let writer: RuntimeWriter;
  try { writer = new RuntimeWriter(options.dbPath); } catch (error) { db.close(); throw error; }
  const meta = db.metadata(), clocks = options.clocks ?? createClocks(meta);
  const ctx: ToolContext = { sessionId: options.sessionId, userName: options.userName, role: options.role,
    actor: 'claude', clocks, writer, datasetVersion: meta.dataset_version };
  const resolve = (period: PeriodInput) => resolvePeriod(period, clocks, db);
  function query<T extends object>(name: string, raw: unknown, fn: (q: Query) => T) {
    return audited(ctx, name, raw, () => {
      const q = querySchema.parse(raw), period = resolve(q.period);
      return period.ok ? fn({ ...q, period }) : period;
    });
  }
  const tools = {
    getLineInfo: (raw: unknown = {}) => audited(ctx, 'get_line_info', raw, () => {
      z.strictObject({}).parse(raw); return { ok: true as const, status: 'ok' as const, items: lineInfo(db) };
    }),
    getProduction: (raw: unknown) => audited(ctx, 'get_production', raw, () => {
      const q = productionSchema.parse(raw), period = resolve(q.period);
      if (!period.ok) return period;
      const compareTo = q.compareTo ? resolve(q.compareTo) : undefined;
      if (compareTo && !compareTo.ok) return { ...compareTo, failedPeriod: 'comparison' };
      const { compareTo: _, ...current } = q;
      return getProduction(db, { ...current, period, ...(compareTo ? { compareTo } : {}) });
    }),
    getAchievement: (raw: unknown) => query('get_target_vs_actual', raw, q => getAchievement(db, q)),
    getDefects: (raw: unknown) => audited(ctx, 'get_defects', raw, () => {
      const q = querySchema.extend({ compareTo: periodSchema.optional(), comparisonExcludeDates: z.array(dateSchema).max(3660).optional() }).parse(raw);
      const period = resolve(q.period);
      if (!period.ok) return period;
      if (!q.compareTo) return { ...getDefects(db, { ...q, period }), comparison: null };
      const baseline = resolve(q.compareTo);
      if (!baseline.ok) return { ...baseline, failedPeriod: 'comparison' };
      return compareDefects(db, { ...q, period }, { ...q, period: baseline, excludeDates: q.comparisonExcludeDates ?? q.excludeDates ?? [] });
    }),
    getDowntime: (raw: unknown) => audited(ctx, 'get_downtime', raw, () => {
      const q = querySchema.extend({ window: windowSchema.optional() }).parse(raw), period = resolve(q.period);
      return period.ok ? getDowntime(db, { ...q, period }) : period;
    }),
    breakdownLoss: (raw: unknown) => query('analyze_shortfall', raw, q => breakdownLoss(db, q)),
    hourlyPattern: (raw: unknown) => audited(ctx, 'analyze_hourly_pattern', raw, () => {
      const q = querySchema.extend({ splitBy: z.enum(['shift', 'crew']).optional() }).parse(raw), period = resolve(q.period);
      return period.ok ? hourlyPattern(db, { ...q, period }) : period;
    }),
    detectAnomalies: (raw: unknown) => query('detect_anomalies', raw, q => detectAnomalies(db, q)),
    compareLines: (raw: unknown) => query('compare_lines', raw, q => compareLines(db, q)),
    createDraft: (raw: unknown) => createDraft(ctx, raw),
  };
  const { actor: _, ...base } = ctx;
  const human = { confirmDraft: (draftId: string, edits: DraftEdits = {}) => confirmDraft(createHumanContext(base), draftId, edits) };
  return { tools, human, close: () => { db.close(); writer.close(); } };
}
