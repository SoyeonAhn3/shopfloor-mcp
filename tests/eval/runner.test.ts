import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CostBudget } from '../../src/eval/claude.js';
import { parseRunConfig } from '../../src/eval/config.js';
import { textHash } from '../../src/eval/freeze.js';
import { runScenario, verifyDescriptionFreeze } from '../../src/eval/runner.js';
import { fixture, generatedHash } from '../core/fixture.js';
import { call, MODEL, reply, scenario, stub, text } from './helpers.js';

let f: ReturnType<typeof fixture>;
beforeAll(() => { f = fixture(); });
afterAll(() => f.close());
describe('scenario runner using a real stdio MCP server and stub model', () => {
  it.each(['coarse', 'fine'] as const)('queries real data with %s, records evidence, and leaves the source DB untouched', async toolset => {
    const before = generatedHash(f.path), bytes = readFileSync(f.path), hash = textHash('test');
    const config = { ...parseRunConfig(['--toolset', toolset]), model: MODEL };
    const fake = stub((request, index) => {
      expect(request.tools).toHaveLength(toolset === 'coarse' ? 4 : 10);
      expect(request.system).toContain('2026-10-01');
      expect(request.system).toContain('viewer');
      expect(request.system).toContain('08:00~08:20');
      expect(JSON.stringify(request)).not.toContain('answerKeyRefs');
      if (index === 0) return reply([call('query', toolset === 'coarse' ? 'query_production' : 'get_production',
        { ...(toolset === 'coarse' ? { mode: 'production' } : {}), lineIds: ['L5'], period: { kind: 'yesterday' } })], 'tool_use');
      const content = request.messages.at(-1)!.content;
      if (!Array.isArray(content) || content[0]?.type !== 'tool_result') throw new Error('Expected a correlated result');
      const body = JSON.parse(String(content[0].content));
      expect(body.evidenceId).toBe('Q-0001');
      return reply([text(`생산 ${body.total.produced}개, 양품 ${body.total.good}개 [${body.evidenceId}]`)]);
    });
    const output = await runScenario({ runId: 'integration-' + toolset, repetition: 1,
      scenario: scenario({ expect: { answerKeyRefs: ['lookups.L5_0930_produced', 'lookups.L5_0930_good'], issuesUnchanged: true } }),
      config, sourceDb: f.path, modelClient: fake.model, budget: new CostBudget(5, config.pricing), key: f.key,
      identity: { scenarioSetHash: hash, frozenEvalHash: hash, descriptionsHash: hash, answerKeyHash: hash, datasetVersion: f.key.datasetVersion },
      serverEntry: resolve('src/server/index.ts'), serverPrefix: ['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href] });
    expect(output.record.outcome).toBe('completed');
    expect(output.record.usage.toolCalls).toBe(1);
    expect(output.record.resources).toHaveLength(4);
    expect(output.record.dbDiff.auditRows).toBe(1);
    expect(output.record.grade.checks.some(c => c.status === 'fail')).toBe(false);
    expect(generatedHash(f.path)).toBe(before); expect(readFileSync(f.path).equals(bytes)).toBe(true);
  });
  it('refuses eval execution without a description freeze', () => {
    expect(() => verifyDescriptionFreeze(f.root, MODEL, textHash('desc'), textHash('prompt'))).toThrow('dev scenarios');
  });
  it('requires known or explicitly provided model prices and positive execution limits', () => {
    expect(() => parseRunConfig(['--model', 'unknown-model'])).toThrow();
    expect(parseRunConfig(['--model', 'unknown-model', '--input-usd-per-mtok', '3', '--output-usd-per-mtok', '15']).pricing.input).toBe(3);
    expect(() => parseRunConfig(['--repeat', '0'])).toThrow();
    expect(() => parseRunConfig(['--max-cost-usd', '0'])).toThrow();
  });
});
