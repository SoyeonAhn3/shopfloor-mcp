import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { copyRuntimeDatabase } from '../../src/server/runtime-db.js';
import { fixture } from '../core/fixture.js';

let f: ReturnType<typeof fixture>, path: string;
beforeAll(async () => { f = fixture(); path = await copyRuntimeDatabase(f.path, join(f.root, 'stdio.db')); });
afterAll(() => f.close());
describe('real stdio process', () => {
  it.each(['coarse', 'fine'])('performs initialize/discovery/query with %s from another cwd', async toolset => {
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href, resolve('src/server/index.ts'),
        '--db', path, '--toolset', toolset, '--role', 'viewer', '--user', 'stdio-test'],
      cwd: f.root, stderr: 'pipe',
    });
    let stderr = ''; transport.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(toolset === 'coarse' ? 4 : 10);
      expect((await client.listResources()).resources).toHaveLength(4);
      expect((await client.listPrompts()).prompts).toHaveLength(2);
      const result = await client.callTool({
        name: toolset === 'coarse' ? 'query_production' : 'get_production',
        arguments: { ...(toolset === 'coarse' ? { mode: 'production' } : {}), period: { kind: 'last_week' }, compareTo: { kind: 'weeks_ago', weeks: 2 } },
      });
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({ ok: true, resolvedRange: { from: '2026-09-21', to: '2026-09-25' } });
      expect(stderr).toBe('');
    } catch (error) { throw new Error('stdio failure: ' + stderr, { cause: error }); }
    finally { await client.close(); await transport.close(); }
  });
});
