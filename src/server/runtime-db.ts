import Database from 'better-sqlite3';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { openReadOnly } from '../core/db.js';

const markerSchema = z.strictObject({
  kind: z.literal('shopfloor-runtime-v1'), sourcePath: z.string(), runtimePath: z.string(),
  datasetVersion: z.string(), createdAt: z.string(),
});
export const markerPath = (path: string): string => path + '.runtime.json';
function sameFile(a: string, b: string): boolean {
  if (realpathSync(a) === realpathSync(b)) return true;
  const x = statSync(a), y = statSync(b);
  return x.dev === y.dev && x.ino === y.ino;
}
export async function copyRuntimeDatabase(source: string, destination: string): Promise<string> {
  const from = realpathSync(source), to = resolve(destination);
  if (from === to || existsSync(to) || existsSync(markerPath(to))) {
    throw new Error('실행용 DB는 새 경로여야 합니다. 기존 DB와 원본을 덮어쓰지 않습니다.');
  }
  const db = new Database(from, { readonly: true, fileMustExist: true });
  let reserved = false;
  try {
    const metadata = db.prepare('SELECT dataset_version FROM dataset_meta').all() as { dataset_version: string }[];
    if (metadata.length !== 1) throw new Error('데이터셋 메타정보가 올바르지 않습니다.');
    mkdirSync(dirname(to), { recursive: true });
    // Exclusive reservation prevents concurrent copy commands from overwriting one another.
    closeSync(openSync(to, 'wx')); reserved = true;
    await db.backup(to);
    writeFileSync(markerPath(to), JSON.stringify({
      kind: 'shopfloor-runtime-v1', sourcePath: from, runtimePath: realpathSync(to),
      datasetVersion: metadata[0]!.dataset_version, createdAt: new Date().toISOString(),
    }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    return to;
  } catch (error) {
    // Only the file reserved by this invocation is removed, never a pre-existing DB.
    if (reserved) unlinkSync(to);
    throw error;
  } finally { db.close(); }
}
export function assertRuntimeDatabase(path: string): void {
  if (!existsSync(path) || !existsSync(markerPath(path))) {
    throw new Error('npm run db:copy로 실행용 DB를 먼저 만드세요. 원본 DB는 서버에서 직접 열지 않습니다.');
  }
  const marker = markerSchema.parse(JSON.parse(readFileSync(markerPath(path), 'utf8')));
  const runtime = realpathSync(path);
  if (runtime !== marker.runtimePath || runtime === marker.sourcePath
    || (existsSync(marker.sourcePath) && sameFile(path, marker.sourcePath))) {
    throw new Error('실행용 복사본 경로를 확인하세요. 원본 또는 다른 DB의 표시 파일을 사용할 수 없습니다.');
  }
  const db = openReadOnly(path);
  try {
    if (db.metadata().dataset_version !== marker.datasetVersion) throw new Error('실행용 DB의 생성본 식별값이 다릅니다.');
  } finally { db.close(); }
}
