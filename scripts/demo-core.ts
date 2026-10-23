import { constants, copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createCore } from '../src/core/service.js';
import { removeOwnedTemp } from '../src/shared/files.js';

// Exercise the real audited service on a disposable copy; no model or API key is needed.
let directory: string | undefined, core: ReturnType<typeof createCore> | undefined;
try {
  const { values } = parseArgs({ options: {
    db: { type: 'string', default: 'data/phase2/production.db' },
    period: { type: 'string', default: '{"kind":"last_month"}' },
    'compare-to': { type: 'string' }, lines: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('npm run core:demo -- [--db source.db] [--period JSON] [--compare-to JSON] [--lines L1,L2]\n'
      + 'Uses a temporary database copy. Periods: last_month, recent, weeks_ago, past_weeks, week_day, month, date, range.');
  } else {
    const period: unknown = JSON.parse(values.period);
    const compareTo: unknown = values['compare-to'] ? JSON.parse(values['compare-to']) : undefined;
    directory = mkdtempSync(join(tmpdir(), 'shopfloor-core-demo-'));
    const dbPath = join(directory, 'production.db');
    copyFileSync(resolve(values.db), dbPath, constants.COPYFILE_EXCL);
    core = createCore({ dbPath, sessionId: 'core-demo', userName: 'demo', role: 'viewer' });
    const result = core.tools.getProduction({ period, ...(compareTo ? { compareTo } : {}),
      ...(values.lines ? { lineIds: values.lines.split(',') } : {}) });
    if (result.ok) {
      const { items: _, comparison, ...summary } = result;
      console.log(JSON.stringify({ ...summary, ...(comparison ? { comparison: {
        period: comparison.period, total: comparison.total, lines: comparison.lines, changes: comparison.changes,
      } } : {}) }, null, 2));
    } else { console.log(JSON.stringify(result, null, 2)); process.exitCode = 1; }
  }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
finally { core?.close(); if (directory) removeOwnedTemp(directory); }
