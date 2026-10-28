import { describe, expect, it, vi } from 'vitest';
import { CostBudget, createClaude, EvalError, safeError } from '../../src/eval/claude.js';
import { executeConversation, type LoopOptions } from '../../src/eval/loop.js';
import { DEFAULT_LIMITS, emptyUsage, type Event } from '../../src/eval/record.js';
import { call, MODEL, noChanges, reply, stub, text } from './helpers.js';

function setup(replies: Parameters<typeof stub>[0], changes: Partial<LoopOptions> = {}) {
  const fake = stub(replies), executed: string[] = [], transcript: Event[] = [];
  const options: LoopOptions = { turns: ['조회해줘'], model: MODEL, system: 'system without answers', limits: { ...DEFAULT_LIMITS },
    modelClient: fake.model, budget: new CostBudget(5, { input: 2, output: 10 }), signal: new AbortController().signal,
    transcript, usage: emptyUsage(), onPrivacyViolation: () => {}, endpoint: {
      tools: [{ name: 'query_production', input_schema: { type: 'object' } }, { name: 'get_line_info', input_schema: { type: 'object' } }],
      changes: noChanges, async call(name) { executed.push(name); return { output: { ok: true, evidenceId: 'Q-0001' }, isError: false }; },
    }, ...changes };
  return { options, executed, ...fake };
}
describe('model/MCP exchange', () => {
  it('correlates multiple tool results immediately and preserves earlier user turns', async () => {
    const s = setup([reply([call('a'), call('b', 'get_line_info')], 'tool_use'), reply([text('조회 결과입니다.')]), reply([text('비교 결과입니다.')])],
      { turns: ['조회해줘', '앞선 결과와 비교해줘'] });
    await executeConversation(s.options);
    expect(s.executed).toEqual(['query_production', 'get_line_info']);
    expect(s.requests[1]!.messages.at(-1)).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a' }, { type: 'tool_result', tool_use_id: 'b' }] });
    expect(s.requests[2]!.messages.at(-1)).toEqual({ role: 'user', content: '앞선 결과와 비교해줘' });
    expect(s.options.transcript.filter(e => e.kind === 'turn_end')).toHaveLength(2);
  });
  it('does not dispatch unlisted tools and returns an error to the model', async () => {
    const s = setup([reply([call('a', 'execute_sql')], 'tool_use'), reply([text('허용되지 않습니다.')])]);
    await executeConversation(s.options);
    expect(s.executed).toEqual([]);
    expect(s.requests[1]!.messages.at(-1)).toMatchObject({ content: [{ is_error: true, tool_use_id: 'a' }] });
  });
  it('never executes a tool twice for a repeated call ID', async () => {
    const s = setup([reply([call('a')], 'tool_use'), reply([call('a')], 'tool_use')]);
    await expect(executeConversation(s.options)).rejects.toMatchObject({ code: 'duplicate_tool_call_id' });
    expect(s.executed).toHaveLength(1);
  });
  it('stops repeated tool requests at the model-call limit', async () => {
    const s = setup((_r, i) => reply([call(String(i))], 'tool_use'));
    s.options.limits.maxModelCalls = 2;
    await expect(executeConversation(s.options)).rejects.toMatchObject({ code: 'model_call_limit' });
    expect(s.executed).toHaveLength(2);
  });
  it('refuses a batch exceeding the tool-call limit before any side effects', async () => {
    const s = setup([reply([call('a'), call('b')], 'tool_use')]);
    s.options.limits.maxToolCalls = 1;
    await expect(executeConversation(s.options)).rejects.toMatchObject({ code: 'tool_call_limit' });
    expect(s.executed).toHaveLength(0);
  });
  it('checks cost before paid completion and charges actual token usage', async () => {
    const s = setup([reply([text('답변')])], { budget: new CostBudget(0.00001, { input: 2, output: 10 }) });
    await expect(executeConversation(s.options)).rejects.toMatchObject({ code: 'cost_budget', fatal: true });
    expect(s.requests).toHaveLength(0);
    const ok = setup([reply([text('답변')])]); await executeConversation(ok.options);
    expect(ok.options.budget.spent).toBeCloseTo(0.0004);
  });
  it('prices cache reads at 0.1x and 5-minute cache writes at 1.25x of the input rate', () => {
    const budget = new CostBudget(5, { input: 2, output: 10 });
    const usage = { ...emptyUsage(), inputTokens: 1000, cacheReadTokens: 10_000, cacheWriteTokens: 2000, outputTokens: 100 };
    budget.charge(usage);
    expect(usage.estimatedCostUsd).toBeCloseTo(0.01, 9);
    expect(budget.spent).toBeCloseTo(0.01, 9);
  });
  it('reserves counted input at the cache-write rate so a cache-writing call cannot pass the limit', () => {
    const budget = new CostBudget(0.01, { input: 2, output: 10 });
    expect(() => budget.ensure(4400, 0)).toThrow(EvalError);
    budget.ensure(4000, 0);
  });
  it('marks the tools and system prefix for caching without changing the prompt and records cache usage', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: MODEL,
        content: [{ type: 'text', text: '답변' }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 } }),
      { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
    });
    try {
      const tools = [{ name: 'query_production', input_schema: { type: 'object' as const } }];
      const result = await createClaude('test-key').complete({ model: MODEL, system: 'system without answers',
        messages: [{ role: 'user', content: '조회해줘' }], tools, maxTokens: 100 }, new AbortController().signal);
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({ tools,
        system: [{ type: 'text', text: 'system without answers', cache_control: { type: 'ephemeral' } }] });
      expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 900, cacheWriteTokens: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('records truncation as an incomplete response and does not execute partial calls', async () => {
    const s = setup([reply([text('미완성'), call('a')], 'max_tokens')]);
    await expect(executeConversation(s.options)).rejects.toMatchObject({ code: 'output_truncated' });
    expect(s.options.transcript.some(e => e.kind === 'assistant' && e.final)).toBe(false);
    expect(s.executed).toHaveLength(0);
  });
  it('honours cancellation without starting a model call', async () => {
    const controller = new AbortController(); controller.abort();
    const s = setup([], { signal: controller.signal });
    await expect(executeConversation(s.options)).rejects.toMatchObject({ code: 'timeout' });
    expect(s.requests).toHaveLength(0);
  });
  it('marks a privacy failure and redacts persisted events', async () => {
    let detected = false;
    const s = setup([reply([text('W-L3-A1 작업자')])], { onPrivacyViolation: () => { detected = true; } });
    await executeConversation(s.options);
    expect(detected).toBe(true); expect(JSON.stringify(s.options.transcript)).not.toContain('W-L3-A1');
  });
  it('keeps opaque model thinking out of persisted transcripts', async () => {
    const s = setup([reply([{ type: 'thinking', thinking: 'private-thought', signature: 'opaque' }, text('답변')])]);
    await executeConversation(s.options);
    expect(JSON.stringify(s.options.transcript)).not.toContain('private-thought');
  });
  it('sanitizes arbitrary exceptions rather than exposing secret-bearing error messages', () => {
    expect(safeError(new Error('sk-ant-api-secret-value')).message).toBe('execution_failed');
    expect(safeError(new EvalError('known')).code).toBe('known');
  });
});
