import { parseArgs } from 'node:util';
import { copyRuntimeDatabase } from '../src/server/runtime-db.js';

try {
  const { values } = parseArgs({ options: {
    from: { type: 'string', default: 'data/phase2/production.db' },
    to: { type: 'string', default: 'data/run/production.db' },
  }, strict: true, allowPositionals: false });
  const path = await copyRuntimeDatabase(values.from!, values.to!);
  console.log('실행용 DB 생성: ' + path);
} catch (error) {
  console.error(error instanceof Error ? error.message : '실행용 DB 복사 실패');
  process.exitCode = 1;
}
