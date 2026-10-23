import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildAnswerKey } from '../../src/answer-key/build.js';
import type { AnswerKey } from '../../src/answer-key/types.js';
import { buildDataset } from '../../src/generator/build.js';
import { loadConfig } from '../../src/generator/config.js';
import { writeDataset } from '../../src/generator/writer.js';
import { checkScenarios } from '../../src/eval/freeze.js';
import { openReadOnly } from '../../src/core/db.js';
import { createClocks } from '../../src/core/clock.js';
import { removeOwnedTemp } from '../../src/shared/files.js';

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'shopfloor-core-')), path = join(root, 'production.db');
  let key: AnswerKey;
  if (existsSync('data/phase2/production.db')) {
    checkScenarios(resolve('eval/scenarios'));
    copyFileSync('data/phase2/production.db', path);
    key = JSON.parse(readFileSync('data/phase2/answer_key.json', 'utf8')) as AnswerKey;
  } else {
    // A fresh checkout has no ignored data. Unit tests use their own independent generation.
    const config = loadConfig('config/generator.config.json'), data = buildDataset(config);
    key = buildAnswerKey(config, data);
    const db = new Database(path);
    try { writeDataset(db, data.tables); } finally { db.close(); }
  }
  const db = openReadOnly(path), clocks = createClocks(db.metadata(), () => new Date('2026-10-23T01:00:00.000Z'));
  return { root, path, key, db, clocks, close: () => { db.close(); removeOwnedTemp(root); } };
}
export function generatedHash(path: string): string {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const data = ['dataset_meta','lines','workers','calendar','hourly_plan','hourly_output','defect_events','downtime_events']
      .map(table => db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all());
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  } finally { db.close(); }
}
export function success<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error('Expected success: ' + JSON.stringify(result));
  return result as Extract<T, { ok: true }>;
}
