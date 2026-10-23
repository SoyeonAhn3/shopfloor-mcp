import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { loadScenarios, validateScenarioSets } from './scenario.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identitySchema = z.strictObject({ setHash: hash, datasetVersion: z.string().min(1) });
export const lockSchema = z.strictObject({
  schemaVersion: z.literal(1), hashEncoding: z.literal('utf8-lf'), frozenAt: z.string().min(1),
  datasetDirectory: z.string().min(1), datasetVersion: z.string().min(1), answerKeySha256: hash,
  files: z.record(z.string().regex(/^S(?:0[1-9]|[12][0-9]|30)\.json$/), hash),
  setHash: hash,
  history: z.array(z.strictObject({
    eventType: z.literal('CHANGE'), at: z.string().min(1), reason: z.string().trim().min(1),
    before: identitySchema.nullable(), after: identitySchema,
  })).min(1),
});
export type ScenarioLock = z.infer<typeof lockSchema>;
const logSession = randomUUID().slice(0, 8);

// Git on Windows may change line endings. Every other byte of UTF-8 text is significant.
export function textHash(value: string): string {
  return createHash('sha256').update(value.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}
function fileHash(path: string): string { return textHash(readFileSync(path, 'utf8')); }
function setHash(files: Record<string, string>, datasetVersion: string, answerKeySha256: string): string {
  return textHash(JSON.stringify({ files: Object.fromEntries(Object.entries(files).sort()), datasetVersion, answerKeySha256 }));
}
function fileHashes(directory: string): Record<string, string> {
  return Object.fromEntries(loadScenarios(directory, 'eval').map(scenario => [scenario.id + '.json', fileHash(join(directory, 'eval', scenario.id + '.json'))]));
}
export function readLock(directory: string): ScenarioLock {
  return lockSchema.parse(JSON.parse(readFileSync(join(directory, 'eval.lock.json'), 'utf8')));
}

export function readDataset(directory: string) {
  const keyPath = join(directory, 'answer_key.json');
  const key = z.looseObject({ datasetVersion: z.string().min(1), generatedAt: z.string().min(1) })
    .parse(JSON.parse(readFileSync(keyPath, 'utf8')));
  const db = new Database(join(directory, 'production.db'), { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare('SELECT dataset_version, generated_at FROM dataset_meta').all() as { dataset_version: string; generated_at: string }[];
    if (rows.length !== 1 || rows[0]!.dataset_version !== key.datasetVersion || rows[0]!.generated_at !== key.generatedAt) {
      throw new Error('DB and answer-key identity mismatch');
    }
  } finally { db.close(); }
  const validation = JSON.parse(readFileSync(join(directory, 'validation.json'), 'utf8')) as { datasetVersion?: string; passed?: boolean };
  if (validation.datasetVersion !== key.datasetVersion || validation.passed !== true) throw new Error('Dataset needs a matching successful validation report');
  return { key, answerKeySha256: fileHash(keyPath) };
}

// Portable check used by tests without needing the git-ignored dataset on a fresh checkout.
export function checkFrozenFiles(directory: string): ScenarioLock {
  const lock = readLock(directory);
  const files = fileHashes(directory);
  if (Object.keys(lock.files).length !== 30 || Object.keys(files).some(name => files[name] !== lock.files[name])) {
    throw new Error('Frozen evaluation files differ from eval.lock.json');
  }
  if (setHash(files, lock.datasetVersion, lock.answerKeySha256) !== lock.setHash) throw new Error('Evaluation set hash mismatch');
  const latest = lock.history.at(-1)!;
  if (latest.after.setHash !== lock.setHash || latest.after.datasetVersion !== lock.datasetVersion || latest.at !== lock.frozenAt) {
    throw new Error('Freeze history does not match the lock');
  }
  return lock;
}

export function checkScenarios(directory: string, datasetDirectory?: string) {
  const lock = checkFrozenFiles(directory);
  const dataset = readDataset(datasetDirectory ?? resolve(dirname(dirname(directory)), lock.datasetDirectory));
  if (dataset.key.datasetVersion !== lock.datasetVersion || dataset.answerKeySha256 !== lock.answerKeySha256) {
    throw new Error('Frozen dataset version or answer key changed; use the matching generation or explicitly re-freeze with a reason');
  }
  const sets = validateScenarioSets(directory, dataset.key);
  return { lock, evalCount: sets.eval.length, devCount: sets.dev.length };
}

export function freezeScenarios(directory: string, datasetDirectory: string, reason?: string): ScenarioLock {
  const lockPath = join(directory, 'eval.lock.json');
  const previous = existsSync(lockPath) ? readLock(directory) : undefined;
  if (previous && !reason?.trim()) throw new Error('Re-freezing requires --reason; the before/after change is recorded in lock history');
  const dataset = readDataset(datasetDirectory);
  validateScenarioSets(directory, dataset.key);
  const files = fileHashes(directory);
  const digest = setHash(files, dataset.key.datasetVersion, dataset.answerKeySha256);
  const at = new Date().toISOString();
  const lock = lockSchema.parse({
    schemaVersion: 1, hashEncoding: 'utf8-lf', frozenAt: at,
    datasetDirectory: relative(dirname(dirname(directory)), datasetDirectory).replace(/\\/g, '/'),
    datasetVersion: dataset.key.datasetVersion, answerKeySha256: dataset.answerKeySha256, files, setHash: digest,
    history: [...(previous?.history ?? []), {
      eventType: 'CHANGE', at, reason: reason?.trim() || 'Initial Phase 2 freeze',
      before: previous ? { setHash: previous.setHash, datasetVersion: previous.datasetVersion } : null,
      after: { setHash: digest, datasetVersion: dataset.key.datasetVersion },
    }],
  });
  const content = JSON.stringify(lock, null, 2) + '\n';
  if (!previous) writeFileSync(lockPath, content, { flag: 'wx' });
  else {
    const temporary = lockPath + '.' + process.pid + '.tmp';
    try {
      writeFileSync(temporary, content, { flag: 'wx' });
      renameSync(temporary, lockPath);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  const logDirectory = join(dirname(dirname(directory)), 'logs');
  mkdirSync(logDirectory, { recursive: true });
  const local = new Date(at);
  const date = String(local.getFullYear()) + String(local.getMonth() + 1).padStart(2, '0') + String(local.getDate()).padStart(2, '0');
  appendFileSync(join(logDirectory, 'dev_' + date + '.jsonl'), JSON.stringify({
    timestamp: at, session_id: logSession, module: 'ScenarioFreeze', event_type: 'CHANGE',
    message: previous ? '평가 시나리오 재동결' : '평가 시나리오 최초 동결',
    data: {
      before: previous ? { setHash: previous.setHash, datasetVersion: previous.datasetVersion } : null,
      after: { setHash: digest, datasetVersion: dataset.key.datasetVersion }, reason: lock.history.at(-1)!.reason,
    },
  }) + '\n');
  return lock;
}
