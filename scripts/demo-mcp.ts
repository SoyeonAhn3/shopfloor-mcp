import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { openReadOnly } from '../src/core/db.js';
import { copyRuntimeDatabase } from '../src/server/runtime-db.js';
import { removeOwnedTemp } from '../src/shared/files.js';

// Protocol smoke test, not an LLM evaluation. Default question is dev scenario D01.
let root: string | undefined, client: Client | undefined, transport: StdioClientTransport | undefined;
try {
  const { values } = parseArgs({ strict: true, allowPositionals: false, options: {
    db: { type: 'string', default: 'data/phase2/production.db' },
    toolset: { type: 'string', default: 'coarse' },
    period: { type: 'string', default: '{"kind":"yesterday"}' },
    'compare-to': { type: 'string' }, lines: { type: 'string', default: 'L5' }, out: { type: 'string' },
  } });
  if (!['fine','coarse'].includes(values.toolset)) throw new Error('toolset must be coarse or fine');
  const lineIds = values.lines.split(','), period: unknown = JSON.parse(values.period);
  root = mkdtempSync(join(tmpdir(), 'shopfloor-mcp-demo-'));
  const dbPath = await copyRuntimeDatabase(resolve(values.db), join(root, 'runtime.db'));
  transport = new StdioClientTransport({ command: process.execPath, cwd: root, stderr: 'pipe',
    args: [resolve('dist/server/index.js'), '--db', dbPath, '--toolset', values.toolset, '--role', 'viewer', '--user', 'demo'],
  });
  let stderr = ''; transport.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  client = new Client({ name: 'shopfloor-demo', version: '1.0.0' });
  await client.connect(transport);
  const tools = await client.listTools(), resources = await client.listResources(), prompts = await client.listPrompts();
  const query = {
    name: values.toolset === 'coarse' ? 'query_production' : 'get_production',
    arguments: { ...(values.toolset === 'coarse' ? { mode: 'production' } : {}), period, lineIds,
      ...(values['compare-to'] ? { compareTo: JSON.parse(values['compare-to']) as unknown } : {}) },
  };
  const info = await client.callTool({ name: 'get_line_info', arguments: {} });
  const answer = await client.callTool(query);
  const reference = await client.readResource({ uri: 'shopfloor://data-guide' });
  const template = await client.getPrompt({ name: 'daily_briefing' });
  const db = openReadOnly(dbPath);
  let audits: unknown[];
  try { audits = db.all('SELECT ref_id, tool_name, params, resolved_range, outcome, result_summary FROM audit_log ORDER BY log_id'); }
  finally { db.close(); }
  const report = { recordedAt: new Date().toISOString(), transport: 'stdio', toolset: values.toolset,
    modelUsed: false, server: client.getServerVersion(), tools: tools.tools, resources: resources.resources, prompts: prompts.prompts,
    calls: [{ name: 'get_line_info', arguments: {}, output: info.structuredContent },
      { ...query, isError: answer.isError, output: answer.structuredContent }],
    reference, template, audits, stderr,
  };
  if (values.out) {
    const out = resolve(values.out); mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify({ report: out, tools: tools.tools.length, resources: resources.resources.length,
      prompts: prompts.prompts.length, isError: answer.isError, stderr }, null, 2));
  } else console.log(JSON.stringify(report, null, 2));
  if (answer.isError || stderr) process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.message : 'MCP demo failed'); process.exitCode = 1; }
finally {
  await client?.close(); await transport?.close();
  if (root) removeOwnedTemp(root);
}
