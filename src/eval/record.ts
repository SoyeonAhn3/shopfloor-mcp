import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { protectOutput } from '../core/guards.js';
import { textHash } from './freeze.js';
import { SCENARIO_TYPES } from './scenario.js';

const count = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const usageSchema = z.strictObject({
  inputTokens: count, outputTokens: count, cacheReadTokens: count, cacheWriteTokens: count,
  modelCalls: count, toolCalls: count, ms: z.number().nonnegative(), estimatedCostUsd: z.number().nonnegative(),
});
export type Usage = z.infer<typeof usageSchema>;
export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
  cacheWriteTokens: 0, modelCalls: 0, toolCalls: 0, ms: 0, estimatedCostUsd: 0 });
export const tableDiffSchema = z.strictObject({ added: count, updated: count, deleted: count });
export const dbDiffSchema = z.strictObject({
  issues: tableDiffSchema, drafts: tableDiffSchema, audit: tableDiffSchema,
  issuesAdded: count, draftsCreated: count, auditRows: count,
});
export type DbDiff = z.infer<typeof dbDiffSchema>;
export const checkSchema = z.strictObject({
  id: z.string(), turn: count, status: z.enum(['pass', 'fail', 'needs_review']),
  detail: z.string(), expected: z.unknown().optional(),
});
export type Check = z.infer<typeof checkSchema>;
export const gradeSchema = z.strictObject({
  checks: z.array(checkSchema), autoVerdict: z.enum(['pass', 'fail', 'needs_review']),
});
export type GradeResult = z.infer<typeof gradeSchema>;
const turn = z.number().int().positive();
export const eventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('user'), turn, text: z.string() }),
  z.strictObject({ kind: z.literal('assistant'), turn, text: z.string(), final: z.boolean() }),
  z.strictObject({ kind: z.literal('model'), turn, model: z.string(), requestId: z.string().nullable(),
    stopReason: z.string(), usage: usageSchema }),
  z.strictObject({ kind: z.literal('tool_call'), turn, callId: z.string(), name: z.string(),
    input: z.unknown(), output: z.unknown(), isError: z.boolean(), ms: z.number().nonnegative(),
    evidenceId: z.string().nullable() }),
  z.strictObject({ kind: z.literal('turn_end'), turn, dbDiff: dbDiffSchema }),
]);
export type Event = z.infer<typeof eventSchema>;
export const limitsSchema = z.strictObject({
  maxModelCalls: z.number().int().positive(), maxToolCalls: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(), timeoutMs: z.number().int().positive(),
  maxCostUsd: z.number().positive(),
});
export type Limits = z.infer<typeof limitsSchema>;
export const DEFAULT_LIMITS: Limits = { maxModelCalls: 12, maxToolCalls: 20, maxOutputTokens: 4096,
  timeoutMs: 180_000, maxCostUsd: 5 };
export const recordSchema = z.strictObject({
  schemaVersion: z.literal(1), runId: z.string().regex(/^[\w-]+$/), scenarioId: z.string().regex(/^[SD]\d{2}$/),
  set: z.enum(['dev', 'eval']), type: z.enum(SCENARIO_TYPES), role: z.enum(['viewer', 'operator']),
  repetition: z.number().int().positive(), model: z.string(), toolset: z.enum(['coarse', 'fine']),
  scenarioSetHash: hash, frozenEvalHash: hash, descriptionsHash: hash, toolsHash: hash,
  systemPromptHash: hash, policyHash: hash, answerKeyHash: hash, datasetVersion: z.string(),
  graderHash: hash.nullable().default(null),
  pricing: z.strictObject({ input: z.number().positive(), output: z.number().positive() }),
  startedAt: z.iso.datetime(), finishedAt: z.iso.datetime(), limits: limitsSchema,
  systemPrompt: z.string(), tools: z.array(z.unknown()),
  resources: z.array(z.strictObject({ uri: z.string(), text: z.string() })).default([]),
  transcript: z.array(eventSchema), usage: usageSchema, dbDiff: dbDiffSchema,
  outcome: z.enum(['completed', 'error', 'limit']), error: z.string().nullable(),
  privacyViolation: z.boolean(), grade: gradeSchema,
});
export type RunRecord = z.infer<typeof recordSchema>;
export function hasPrivateData(value: unknown): boolean {
  return /W-L\d+-[AB]\d+/i.test(JSON.stringify(value));
}
export function assertPublishable(value: unknown): void {
  const text = JSON.stringify(value);
  if (/W-L\d+-[AB]\d+/i.test(text)) throw new Error('Worker identifiers cannot be written to evaluation records');
  if (/sk-ant-[A-Za-z0-9_-]{16,}/.test(text)) throw new Error('API credentials cannot be written to evaluation records');
}
export function serializeRecord(record: RunRecord): string {
  const parsed = recordSchema.parse(record);
  assertPublishable(parsed);
  return JSON.stringify(parsed, null, 2) + '\n';
}
export function recordHash(record: RunRecord): string { return textHash(serializeRecord(record)); }
export function writeRecord(path: string, record: RunRecord): void {
  writeFileSync(path, serializeRecord(record), { encoding: 'utf8', flag: 'wx' });
}
export function safeEvent(event: Event): Event { return protectOutput(event); }
