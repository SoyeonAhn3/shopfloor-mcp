import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Usage } from './record.js';
import { emptyUsage } from './record.js';

export type { MessageParam, Tool, ContentBlock };
export interface ModelRequest { model: string; system: string; messages: MessageParam[]; tools: Tool[]; maxTokens: number }
export interface ModelReply { model: string; requestId: string | null; stopReason: string; content: ContentBlock[]; usage: Usage }
export interface ModelClient {
  countInput(request: ModelRequest, signal: AbortSignal): Promise<number>;
  complete(request: ModelRequest, signal: AbortSignal): Promise<ModelReply>;
}
// Standard, uncached token rates checked 2026-10-23. No batch, fast-mode, or regional premiums.
// Unknown models must supply explicit rates, rather than silently using a cheaper model's price.
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};
export class EvalError extends Error {
  constructor(public code: string, public kind: 'error' | 'limit' = 'error', public fatal = false) { super(code); }
}
export function safeError(error: unknown): EvalError {
  if (error instanceof EvalError) return error;
  if (error instanceof Anthropic.APIError) {
    // Do not write SDK error bodies/headers: they can contain credentials or echoed requests.
    return new EvalError('anthropic_http_' + (error.status ?? 'connection'), 'error', true);
  }
  if (error instanceof Error && /abort|timeout/i.test(error.name)) return new EvalError('timeout', 'limit');
  return new EvalError('execution_failed');
}
export function createClaude(apiKey: string): ModelClient {
  if (!apiKey.trim()) throw new EvalError('missing_api_key', 'error', true);
  const client = new Anthropic({ apiKey: apiKey.trim(), maxRetries: 0, timeout: 45_000,
    baseURL: 'https://api.anthropic.com' });
  return {
    async countInput(r, signal) {
      const result = await client.messages.countTokens({ model: r.model, system: r.system,
        messages: r.messages, tools: r.tools }, { signal });
      return result.input_tokens;
    },
    async complete(r, signal) {
      const started = Date.now();
      // Tools render before system, so this one breakpoint caches both; the prompt text itself is unchanged.
      const response = await client.messages.create({ model: r.model,
        system: [{ type: 'text', text: r.system, cache_control: { type: 'ephemeral' } }],
        messages: r.messages, tools: r.tools, max_tokens: r.maxTokens }, { signal });
      const usage: Usage = { ...emptyUsage(), inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens, cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0, modelCalls: 1, ms: Date.now() - started };
      return { model: response.model, requestId: response._request_id ?? null,
        stopReason: response.stop_reason ?? 'unknown', content: response.content, usage };
    },
  };
}
// Requests mark only 5-minute cache entries. Reads use the standard 0.1x; models with cheaper reads are overestimated.
const CACHE_WRITE = 1.25, CACHE_READ = 0.1;
export class CostBudget {
  spent = 0;
  constructor(readonly limit: number, readonly rates: { input: number; output: number }) {
    if (![limit, rates.input, rates.output].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid cost budget/rates');
  }
  ensure(inputTokens: number, maxOutputTokens: number): void {
    // Any counted token may be a cache write, so reserve at the write rate to keep the limit an upper bound.
    const reserve = (inputTokens * this.rates.input * CACHE_WRITE + maxOutputTokens * this.rates.output) / 1_000_000;
    if (this.spent + reserve > this.limit) throw new EvalError('cost_budget', 'limit', true);
  }
  charge(usage: Usage): void {
    usage.estimatedCostUsd = ((usage.inputTokens + usage.cacheReadTokens * CACHE_READ + usage.cacheWriteTokens * CACHE_WRITE)
      * this.rates.input + usage.outputTokens * this.rates.output) / 1_000_000;
    this.spent += usage.estimatedCostUsd;
  }
}
