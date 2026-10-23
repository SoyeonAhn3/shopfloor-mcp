import { z } from 'zod';
import { productionSchema, querySchema } from '../core/query.js';
import { periodSchema } from '../core/period.js';
import { dateSchema } from '../core/guards.js';
import { windowSchema } from '../core/records.js';

export const defectsSchema = querySchema.extend({
  compareTo: periodSchema.optional(),
  comparisonExcludeDates: z.array(dateSchema).max(3660).optional(),
}).refine(v => v.comparisonExcludeDates === undefined || v.compareTo !== undefined,
  'comparisonExcludeDates에는 compareTo가 필요합니다.');
export const downtimeSchema = querySchema.extend({ window: windowSchema.optional() });
export const hourlySchema = querySchema.extend({ splitBy: z.enum(['shift', 'crew']).optional() });
export const queryModes = {
  production: productionSchema, defects: defectsSchema, downtime: downtimeSchema,
};
export const analysisModes = {
  shortfall: querySchema, hourly_pattern: hourlySchema, anomalies: querySchema,
};

// A root object is required by MCP tool schemas. Validate its mode-specific contract
// with the same strict schemas as the fine tools; a refinement never drops fields.
export const groupedQuerySchema = querySchema.extend({
  mode: z.enum(['production', 'defects', 'downtime']).describe('production: 실적/목표/라인/기간 비교, defects: 불량, downtime: 비가동'),
  compareTo: periodSchema.optional().describe('production 또는 defects만 지원'),
  grain: z.enum(['hour', 'shift', 'day']).optional().describe('production만 지원, 기본 day'),
  comparisonExcludeDates: z.array(dateSchema).max(3660).optional().describe('defects 비교 기간에서 제외할 생산일'),
  window: windowSchema.optional().describe('downtime만 지원, 실제 정지 구간과 교집합'),
}).superRefine(({ mode, ...args }, ctx) => {
  const parsed = queryModes[mode].safeParse(args);
  if (!parsed.success) ctx.addIssue({ code: 'custom', message: mode + ' 모드의 입력 조건을 확인하세요: ' + parsed.error.message });
});
export const groupedAnalysisSchema = querySchema.extend({
  mode: z.enum(['shortfall', 'hourly_pattern', 'anomalies']),
  splitBy: z.enum(['shift', 'crew']).optional().describe('hourly_pattern만 지원'),
}).superRefine(({ mode, ...args }, ctx) => {
  const parsed = analysisModes[mode].safeParse(args);
  if (!parsed.success) ctx.addIssue({ code: 'custom', message: mode + ' 모드의 입력 조건을 확인하세요: ' + parsed.error.message });
});
