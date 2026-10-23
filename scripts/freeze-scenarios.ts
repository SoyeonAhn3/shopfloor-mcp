import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkScenarios, freezeScenarios } from '../src/eval/freeze.js';

try {
  const { values } = parseArgs({ options: {
    check: { type: 'boolean' }, 'dataset-dir': { type: 'string' }, reason: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: npm run scenarios:freeze -- [--dataset-dir data/phase2] [--reason "why"]\n'
      + '       npm run scenarios:check -- [--dataset-dir path-to-matching-copy]\n'
      + 'Freeze validates 30 eval + 10 dev scenarios. Re-freezing requires a reason. Check never writes.');
  } else {
    const directory = resolve('eval/scenarios');
    if (values.check && values.reason !== undefined) throw new Error('--reason is only valid when freezing');
    const lock = values.check
      ? checkScenarios(directory, values['dataset-dir'] === undefined ? undefined : resolve(values['dataset-dir'])).lock
      : freezeScenarios(directory, resolve(values['dataset-dir'] ?? 'data/phase2'), values.reason);
    console.log((values.check ? 'Checked' : 'Frozen') + ': 30 eval + 10 dev scenarios');
    console.log('Dataset: ' + lock.datasetVersion);
    console.log('Set hash: ' + lock.setHash);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
