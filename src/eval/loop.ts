import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { CostBudget, EvalError, type ModelClient, type ModelRequest, type Tool } from './claude.js';
import { hasPrivateData, safeEvent, type DbDiff, type Event, type Limits, type Usage } from './record.js';

export interface ToolEndpoint {
  tools: Tool[];
  call(name: string, input: Record<string, unknown>, signal: AbortSignal): Promise<{ output: unknown; isError: boolean }>;
  changes(): DbDiff;
}
export interface LoopOptions {
  turns: string[]; model: string; system: string; limits: Limits; modelClient: ModelClient;
  endpoint: ToolEndpoint; budget: CostBudget; signal: AbortSignal;
  transcript: Event[]; usage: Usage; onPrivacyViolation: () => void;
}
export async function executeConversation(o: LoopOptions): Promise<void> {
  const messages: MessageParam[] = [], names = new Set(o.endpoint.tools.map(t => t.name));
  const seenCallIds = new Set<string>();
  const emit = (event: Event) => {
    if (hasPrivateData(event)) o.onPrivacyViolation();
    o.transcript.push(safeEvent(event));
  };
  for (const [index, question] of o.turns.entries()) {
    const turn = index + 1;
    emit({ kind: 'user', turn, text: question });
    messages.push({ role: 'user', content: question });
    for (;;) {
      if (o.signal.aborted) throw new EvalError('timeout', 'limit');
      if (o.usage.modelCalls >= o.limits.maxModelCalls) throw new EvalError('model_call_limit', 'limit');
      const request: ModelRequest = { model: o.model, system: o.system, messages, tools: o.endpoint.tools, maxTokens: o.limits.maxOutputTokens };
      const inputTokens = await o.modelClient.countInput(request, o.signal);
      o.budget.ensure(inputTokens, request.maxTokens);
      const reply = await o.modelClient.complete(request, o.signal);
      o.budget.charge(reply.usage);
      for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'modelCalls', 'estimatedCostUsd'] as const) o.usage[key] += reply.usage[key];
      emit({ kind: 'model', turn, model: reply.model, requestId: reply.requestId, stopReason: reply.stopReason, usage: reply.usage });
      if (reply.model !== o.model) throw new EvalError('model_version_changed', 'error', true);
      const calls = reply.content.filter(block => block.type === 'tool_use');
      const text = reply.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
      const final = ['end_turn', 'stop_sequence', 'refusal'].includes(reply.stopReason) && calls.length === 0;
      if (text) emit({ kind: 'assistant', turn, text, final });
      // Full content (including opaque thinking signatures) stays only in memory for API continuity.
      messages.push({ role: 'assistant', content: reply.content });
      if (reply.stopReason === 'max_tokens') throw new EvalError('output_truncated', 'limit');
      if (final) {
        if (!text.trim()) throw new EvalError('empty_final_answer');
        emit({ kind: 'turn_end', turn, dbDiff: o.endpoint.changes() });
        break;
      }
      if (reply.stopReason === 'pause_turn' && !calls.length) continue;
      if (reply.stopReason !== 'tool_use' || !calls.length) throw new EvalError('unexpected_model_response');
      if (o.usage.toolCalls + calls.length > o.limits.maxToolCalls) throw new EvalError('tool_call_limit', 'limit');
      const results: ToolResultBlockParam[] = [];
      for (const call of calls) {
        if (o.signal.aborted) throw new EvalError('timeout', 'limit');
        if (seenCallIds.has(call.id)) throw new EvalError('duplicate_tool_call_id');
        seenCallIds.add(call.id);
        const start = Date.now();
        const validInput = call.input !== null && typeof call.input === 'object' && !Array.isArray(call.input);
        const result = !names.has(call.name) || !validInput
          ? { output: { ok: false, reason: 'invalid_tool', message: 'Use a listed tool with an object input.' }, isError: true }
          : await o.endpoint.call(call.name, call.input as Record<string, unknown>, o.signal);
        o.usage.toolCalls++;
        const evidenceId = result.output && typeof result.output === 'object' && 'evidenceId' in result.output
          && typeof result.output.evidenceId === 'string' ? result.output.evidenceId : null;
        emit({ kind: 'tool_call', turn, callId: call.id, name: call.name, input: call.input,
          output: result.output, isError: result.isError, evidenceId, ms: Date.now() - start });
        results.push({ type: 'tool_result', tool_use_id: call.id,
          content: JSON.stringify(result.output), is_error: result.isError });
      }
      // Every tool_use gets its own matching result in the immediately following user message.
      messages.push({ role: 'user', content: results });
    }
  }
}
