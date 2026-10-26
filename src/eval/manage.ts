import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { descriptionsHash, policyHash, PROJECT_ROOT } from './config.js';
import { assertPublishable } from './record.js';
import { prepareReview } from './review.js';
import { applyDecisions, DecisionError, defaultSheetRuns, writeSheet } from './sheet.js';
import { buildSummary, readRun, summaryMarkdown } from './summary.js';

export function freezeDescriptions(runIds: string[], reason: string, root = PROJECT_ROOT) {
  if (!reason.trim()) throw new Error('Provide a reason for freezing the descriptions');
  const runs = runIds.map(id => {
    if (!/^[\w-]+$/.test(id)) throw new Error('Invalid run ID');
    return readRun(join(root, 'eval/runs', id));
  });
  const descHash = descriptionsHash(), promptHash = policyHash();
  if (!['fine', 'coarse'].every(toolset => runs.some(({ manifest, records }) => manifest.toolset === toolset
    && manifest.set === 'dev' && manifest.selectedIds.length === 10 && manifest.status === 'completed'
    && records.length === manifest.repeat * 10 && records.every(r => r.outcome === 'completed')
    && manifest.descriptionsHash === descHash && manifest.policyHash === promptHash))) {
    throw new Error('Freeze requires completed D01–D10 runs on both tool sets with current descriptions/policy');
  }
  if (new Set(runs.map(r => r.manifest.model)).size !== 1) throw new Error('Dev runs must use the same pinned model');
  const current = join(root, 'eval/description-freeze.json');
  const freeze = { schemaVersion: 1, frozenAt: new Date().toISOString(), model: runs[0]!.manifest.model,
    descriptionsHash: descHash, policyHash: promptHash, devRunIds: runIds, reason,
    previous: existsSync(current) ? JSON.parse(readFileSync(current, 'utf8')) as unknown : null };
  assertPublishable(freeze);
  const directory = join(root, 'eval/freezes'); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, randomUUID() + '.json'), JSON.stringify(freeze, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(current, JSON.stringify(freeze, null, 2) + '\n');
  return freeze;
}
function main() {
const [command, ...args] = process.argv.slice(2);
try {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    run: { type: 'string' }, runs: { type: 'string' }, reason: { type: 'string' }, apply: { type: 'string' },
  } });
  if (command === 'review' && values.apply) {
    const result = applyDecisions(PROJECT_ROOT, JSON.parse(readFileSync(resolve(values.apply), 'utf8')));
    console.log(JSON.stringify({ ...result, next: 'npm run eval:summary' }));
  } else if (command === 'sheet') {
    const runIds = values.runs ? values.runs.split(',') : defaultSheetRuns(PROJECT_ROOT);
    console.log(JSON.stringify(writeSheet(PROJECT_ROOT, runIds, resolve(PROJECT_ROOT, 'eval/reviews/review-sheet.html'))));
  } else if (command === 'review') {
    if (!values.run || !/^[\w-]+$/.test(values.run)) throw new Error('Provide --run <runId>');
    const { records } = readRun(join(PROJECT_ROOT, 'eval/runs', values.run));
    const directory = join(PROJECT_ROOT, 'eval/reviews', values.run);
    for (const record of records) prepareReview(directory, record);
    console.log(JSON.stringify({ reviews: records.length, directory, status: 'pending human review' }));
  } else if (command === 'freeze') {
    if (!values.runs || !values.reason) throw new Error('Provide --runs <coarseDevRun>,<fineDevRun> --reason <text>');
    const freeze = freezeDescriptions(values.runs.split(','), values.reason);
    console.log(JSON.stringify({ frozenAt: freeze.frozenAt, model: freeze.model, descriptionsHash: freeze.descriptionsHash }));
  } else if (command === 'summary') {
    const summary = buildSummary(PROJECT_ROOT); assertPublishable(summary);
    const path = resolve(PROJECT_ROOT, 'eval/summary.json');
    writeFileSync(path, JSON.stringify(summary, null, 2) + '\n');
    writeFileSync(resolve(PROJECT_ROOT, 'eval/summary.md'), summaryMarkdown(summary));
    console.log(JSON.stringify({ output: path, runs: summary.runs.length, comparisons: summary.comparisons.length }));
  } else throw new Error('Expected review, sheet, freeze, or summary');
} catch (error) {
  console.error(error instanceof DecisionError ? error.message
    : 'Evaluation management failed. Check run IDs, completed dev runs, review fields, and frozen conditions.');
  process.exitCode = 1;
}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
