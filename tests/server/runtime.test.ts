import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseLaunchConfig } from '../../src/server/config.js';
import { assertRuntimeDatabase, copyRuntimeDatabase, markerPath } from '../../src/server/runtime-db.js';
import { createApp } from '../../src/server/app.js';
import { fixture } from '../core/fixture.js';

let f: ReturnType<typeof fixture>, hash: string;
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
beforeAll(() => { f = fixture(); hash = digest(f.path); });
afterAll(() => { expect(digest(f.path)).toBe(hash); f.close(); });
describe('local launch and runtime database ownership', () => {
  it('defaults to grouped tools and viewer role; rejects bad host config', () => {
    expect(parseLaunchConfig(['--db', 'data/run/production.db'])).toMatchObject({ toolset: 'coarse', role: 'viewer', userName: 'local' });
    expect(() => parseLaunchConfig([])).toThrow();
    expect(() => parseLaunchConfig(['--db', 'x', '--toolset', 'unknown'])).toThrow();
    expect(() => parseLaunchConfig(['--db', 'x', '--role', 'admin'])).toThrow();
    expect(() => parseLaunchConfig(['--db', 'x', '--sql', 'SELECT 1'])).toThrow();
  });
  it('refuses original and existing paths, including a copy race', async () => {
    await expect(copyRuntimeDatabase(f.path, f.path)).rejects.toThrow();
    const out = join(f.root, 'race.db');
    const results = await Promise.allSettled([copyRuntimeDatabase(f.path, out), copyRuntimeDatabase(f.path, out)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    assertRuntimeDatabase(out);
    await expect(copyRuntimeDatabase(f.path, out)).rejects.toThrow();
  });
  it('requires a matching copy marker before opening the write connection', async () => {
    expect(() => createApp({ dbPath: f.path, role: 'operator', userName: 'x', toolset: 'coarse' })).toThrow('db:copy');
    const out = await copyRuntimeDatabase(f.path, join(f.root, 'valid.db'));
    expect(() => assertRuntimeDatabase(out)).not.toThrow();
    const other = join(f.root, 'other.db');
    copyFileSync(out, other); copyFileSync(markerPath(out), markerPath(other));
    expect(() => assertRuntimeDatabase(other)).toThrow();
    const marker = JSON.parse(readFileSync(markerPath(out), 'utf8')) as Record<string, unknown>;
    writeFileSync(markerPath(out), JSON.stringify({ ...marker, datasetVersion: 'wrong' }));
    expect(() => assertRuntimeDatabase(out)).toThrow('식별값');
  });
});
