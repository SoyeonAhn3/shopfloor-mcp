import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const SCENARIO_TYPES = ['simple_lookup', 'multi_step', 'recurring_pattern', 'ambiguous',
  'no_data_trap', 'out_of_permission', 'change_request', 'attack'] as const;
export const ACTIONS = ['create_draft', 'claim_registered', 'follow_memo_instruction', 'worker_level_analysis'] as const;
export type ScenarioType = typeof SCENARIO_TYPES[number];
export type Action = typeof ACTIONS[number];
export type ScenarioSet = 'eval' | 'dev';
export const EVAL_DISTRIBUTION: Record<ScenarioType, number> = {
  simple_lookup: 5, multi_step: 4, recurring_pattern: 3, ambiguous: 3,
  no_data_trap: 6, out_of_permission: 3, change_request: 3, attack: 3,
};
const text = z.string().trim().min(1);
const unique = <T>(items: T[]) => new Set(items).size === items.length;
const references = z.array(text).min(1).refine(unique, 'Duplicate answer-key references');
const actions = z.array(z.enum(ACTIONS)).min(1).refine(unique, 'Duplicate actions');

export const expectationSchema = z.strictObject({
  answerKeyRefs: references.optional(),
  mustMention: z.array(text).min(1).optional(),
  mustAskBack: z.boolean().optional(),
  expectedStatus: z.enum(['out_of_range', 'non_working_day', 'planned_stop', 'missing_data', 'zero_production', 'query_failed']).optional(),
  expectedActions: actions.optional(),
  forbiddenActions: actions.optional(),
  issuesUnchanged: z.literal(true),
}).superRefine((value, ctx) => {
  if (!value.answerKeyRefs?.length && !value.mustAskBack && !value.expectedStatus && !value.expectedActions?.length && !value.forbiddenActions?.length) {
    ctx.addIssue({ code: 'custom', message: 'An expectation needs an answer-key reference or observable behaviour' });
  }
  for (const action of value.expectedActions ?? []) {
    if (value.forbiddenActions?.includes(action)) ctx.addIssue({ code: 'custom', message: 'Conflicting action: ' + action });
  }
  if (value.mustAskBack && value.expectedActions?.includes('create_draft')) {
    ctx.addIssue({ code: 'custom', message: 'Clarification cannot require a draft' });
  }
});
export const scenarioSchema = z.strictObject({
  id: z.string().regex(/^(?:S(?:0[1-9]|[12][0-9]|30)|D(?:0[1-9]|10))$/),
  set: z.enum(['eval', 'dev']),
  type: z.enum(SCENARIO_TYPES),
  role: z.enum(['viewer', 'operator']),
  turns: z.array(text).min(1),
  expect: expectationSchema,
  // Only earlier replies: expect always describes the final reply and whole-run actions.
  checkpoints: z.array(z.strictObject({ afterTurn: z.number().int().positive(), expect: expectationSchema })).min(1).optional(),
  reviewCriteria: z.array(text).min(1),
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (value.id[0] !== (value.set === 'eval' ? 'S' : 'D')) fail('ID and set disagree');
  if (value.type === 'ambiguous' && value.expect.mustAskBack !== true) fail('Ambiguous questions must expect clarification');
  const indices = (value.checkpoints ?? []).map(item => item.afterTurn);
  if (!unique(indices) || indices.some(index => index >= value.turns.length)) fail('Checkpoints must uniquely address earlier turns');
  for (const expectation of [value.expect, ...(value.checkpoints ?? []).map(item => item.expect)]) {
    if (value.role === 'viewer' && expectation.expectedActions?.includes('create_draft')) fail('Viewer cannot create drafts');
  }
  if (value.turns.some(turn => /\[[^\]]*(?:실제 생산일|실제 날짜|TODO)[^\]]*\]|\{\{|\bTODO\b/i.test(turn))) {
    fail('Replace authoring placeholders before loading scenarios');
  }
});
export type Expectation = z.infer<typeof expectationSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;

export function scenarioIds(set: ScenarioSet): string[] {
  return Array.from({ length: set === 'eval' ? 30 : 10 }, (_, i) => (set === 'eval' ? 'S' : 'D') + String(i + 1).padStart(2, '0'));
}

export function loadScenarios(directory: string, set: ScenarioSet): Scenario[] {
  const expected = scenarioIds(set).map(id => id + '.json');
  const files = readdirSync(join(directory, set)).sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error(set + ' must contain exactly ' + expected.join(', '));
  return expected.map(filename => {
    const scenario = scenarioSchema.parse(JSON.parse(readFileSync(join(directory, set, filename), 'utf8')));
    if (scenario.set !== set || filename !== scenario.id + '.json') throw new Error('Scenario filename/ID/set mismatch: ' + filename);
    return scenario;
  });
}

export function resolveAnswerKeyRef(key: unknown, reference: string): unknown {
  const parts = reference.split('.');
  let value: unknown = key;
  for (const part of parts) {
    if (!/^[A-Za-z0-9_-]+$/.test(part) || ['__proto__', 'prototype', 'constructor'].includes(part)
      || value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) {
      throw new Error('Unresolved answer-key reference: ' + reference);
    }
    value = (value as Record<string, unknown>)[part];
  }
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Invalid answer-key value: ' + reference);
  return value;
}

export function validateScenarioSets(directory: string, key: unknown): { eval: Scenario[]; dev: Scenario[] } {
  const sets = { eval: loadScenarios(directory, 'eval'), dev: loadScenarios(directory, 'dev') };
  const seen = new Set<string>();
  for (const scenario of [...sets.eval, ...sets.dev]) {
    for (const turn of scenario.turns) {
      const normalized = turn.normalize('NFKC').replace(/[\s\p{P}]/gu, '').toLowerCase();
      if (seen.has(normalized)) throw new Error('Repeated question in scenario sets: ' + scenario.id);
      seen.add(normalized);
    }
    for (const expectation of [scenario.expect, ...(scenario.checkpoints ?? []).map(item => item.expect)]) {
      for (const reference of expectation.answerKeyRefs ?? []) resolveAnswerKeyRef(key, reference);
    }
  }
  for (const type of SCENARIO_TYPES) {
    if (sets.eval.filter(scenario => scenario.type === type).length !== EVAL_DISTRIBUTION[type]) throw new Error('Wrong eval distribution: ' + type);
    if (!sets.dev.some(scenario => scenario.type === type)) throw new Error('Missing dev type: ' + type);
  }
  return sets;
}
