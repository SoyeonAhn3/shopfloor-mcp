import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CostBudget } from '../../src/eval/claude.js';
import { parseRunConfig } from '../../src/eval/config.js';
import { textHash } from '../../src/eval/freeze.js';
import { runScenario, verifyDescriptionFreeze } from '../../src/eval/runner.js';
import { loadScenarios } from '../../src/eval/scenario.js';
import { METRIC_LOOKUP_HELP } from '../../src/server/descriptions.js';
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
  it.each(['coarse', 'fine'] as const)('exposes D05 metrics after a production lookup through %s without model arithmetic', async toolset => {
    const config = { ...parseRunConfig(['--toolset', toolset]), model: MODEL }, hash = textHash('test');
    const d05 = loadScenarios(resolve('eval/scenarios'), 'dev').find(s => s.id === 'D05')!;
    const period = { kind: 'range', from: '2026-09-10', to: '2026-09-30' }, lineIds = ['L4'];
    const fake = stub((request, index) => {
      expect(request.system).toContain(METRIC_LOOKUP_HELP);
      const analysisName = toolset === 'coarse' ? 'analyze_production' : 'analyze_hourly_pattern';
      const analysis = request.tools.find(t => t.name === analysisName)!;
      for (const field of ['outputPerPlannedMinute', 'downtimeCount', 'downtimeMinutes', 'deviationFromLineAveragePct']) {
        expect(analysis.description).toContain(field);
      }
      if (index === 0) return reply([call('production', toolset === 'coarse' ? 'query_production' : 'get_production',
        { ...(toolset === 'coarse' ? { mode: 'production' } : {}), period, lineIds })], 'tool_use');
      const content = request.messages.at(-1)!.content;
      if (!Array.isArray(content) || content[0]?.type !== 'tool_result') throw new Error('Expected a correlated result');
      const body = JSON.parse(String(content[0].content));
      if (index === 1) {
        expect(body.total).not.toHaveProperty('outputPerPlannedMinute');
        return reply([call('pattern', analysisName,
          { ...(toolset === 'coarse' ? { mode: 'hourly_pattern' } : {}), period, lineIds, splitBy: 'crew' })], 'tool_use');
      }
      for (const crew of ['A', 'B'] as const) {
        const item = body.items.find((row: { hour: number; crew: string }) => row.hour === 9 && row.crew === crew);
        const expected = f.key.E4.byCrew[crew].find(row => row.hour === 9)!;
        expect(item.outputPerPlannedMinute).toBeCloseTo(expected.outputPerPlannedMinute!, 12);
        expect(item).toMatchObject({ downtimeCount: expected.downtimeCount, downtimeMinutes: expected.downtimeMinutes });
        expect(Number.isFinite(item.deviationFromLineAveragePct)).toBe(true);
      }
      return reply([text('서버의 시간대별 분석 결과를 확인했습니다. [' + body.evidenceId + ']')]);
    });
    const { record: output } = await runScenario({ runId: 'd05-metrics-' + toolset, repetition: 1, scenario: d05,
      config, sourceDb: f.path, modelClient: fake.model, budget: new CostBudget(5, config.pricing), key: f.key,
      identity: { scenarioSetHash: hash, frozenEvalHash: hash, descriptionsHash: hash, answerKeyHash: hash, datasetVersion: f.key.datasetVersion },
      serverEntry: resolve('src/server/index.ts'), serverPrefix: ['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href] });
    expect(output.outcome).toBe('completed'); expect(fake.requests).toHaveLength(3);
    expect(output.usage.toolCalls).toBe(2); expect(output.dbDiff.issuesAdded).toBe(0);
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
