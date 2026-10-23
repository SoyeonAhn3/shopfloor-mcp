import { RuntimeWriter, openReadOnly } from '../../src/core/db.js';
import { createClocks } from '../../src/core/clock.js';
import { confirmDraft, createHumanContext } from '../../src/core/issues.js';

const [path, draftId, now, sessionId] = process.argv.slice(2) as [string, string, string, string];
const db = openReadOnly(path), writer = new RuntimeWriter(path), meta = db.metadata();
const ctx = createHumanContext({ writer, clocks: createClocks(meta, () => new Date(now)),
  sessionId, userName: 'human', role: 'operator', datasetVersion: meta.dataset_version });
process.stdout.write('READY\n');
process.stdin.once('data', () => {
  try { process.stdout.write(JSON.stringify(confirmDraft(ctx, draftId)) + '\n'); }
  finally { db.close(); writer.close(); process.stdin.destroy(); }
});
