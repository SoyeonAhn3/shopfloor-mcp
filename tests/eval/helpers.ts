import type { ContentBlock, ModelClient, ModelReply, ModelRequest } from '../../src/eval/claude.js';
import { DEFAULT_LIMITS, emptyUsage, type RunRecord } from '../../src/eval/record.js';
import { textHash } from '../../src/eval/freeze.js';
import type { Scenario } from '../../src/eval/scenario.js';

export const MODEL = 'test-model';
export const noChanges = () => ({ issues: { added: 0, updated: 0, deleted: 0 }, drafts: { added: 0, updated: 0, deleted: 0 },
  audit: { added: 0, updated: 0, deleted: 0 }, issuesAdded: 0, draftsCreated: 0, auditRows: 0 });
export const text = (value: string): ContentBlock => ({ type: 'text', text: value, citations: null });
export const call = (id: string, name = 'query_production', input: unknown = {}): ContentBlock =>
  ({ type: 'tool_use', id, name, input } as ContentBlock);
export function reply(content: ContentBlock[], stopReason = 'end_turn'): ModelReply {
  return { model: MODEL, requestId: 'test-request', stopReason, content,
    usage: { ...emptyUsage(), modelCalls: 1, inputTokens: 100, outputTokens: 20 } };
}
export function stub(replies: ModelReply[] | ((request: ModelRequest, index: number) => ModelReply)) {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    countInput: async () => 100,
    async complete(request) {
      requests.push(structuredClone(request));
      const next = typeof replies === 'function' ? replies(request, requests.length - 1) : replies[requests.length - 1];
      if (!next) throw new Error('Unexpected model call');
      return structuredClone(next);
    },
  };
  return { model, requests };
}
export const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({ id: 'D01', set: 'dev', type: 'simple_lookup', role: 'viewer',
  turns: ['생산량을 알려줘'], expect: { answerKeyRefs: ['count'], issuesUnchanged: true }, reviewCriteria: ['수량과 단위를 확인'], ...overrides });
export function record(overrides: Partial<RunRecord> = {}): RunRecord {
  const hash = textHash('test');
  return { schemaVersion: 1, runId: 'test-run', scenarioId: 'D01', set: 'dev', type: 'simple_lookup', role: 'viewer', repetition: 1,
    model: MODEL, toolset: 'coarse', scenarioSetHash: hash, frozenEvalHash: hash, descriptionsHash: hash, toolsHash: hash,
    systemPromptHash: hash, policyHash: hash, answerKeyHash: hash, graderHash: hash, datasetVersion: 'test-dataset',
    pricing: { input: 2, output: 10 }, startedAt: '2026-10-23T00:00:00.000Z', finishedAt: '2026-10-23T00:00:01.000Z',
    limits: { ...DEFAULT_LIMITS }, systemPrompt: 'test', tools: [], resources: [], transcript: [{ kind: 'user', turn: 1, text: '생산량을 알려줘' },
      { kind: 'assistant', turn: 1, text: '생산량은 123개입니다.', final: true }], usage: emptyUsage(), dbDiff: noChanges(),
    outcome: 'completed', error: null, privacyViolation: false, grade: { checks: [], autoVerdict: 'needs_review' }, ...overrides };
}
