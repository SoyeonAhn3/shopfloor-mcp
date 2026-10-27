import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { createCore } from '../core/service.js';
import { openReadOnly } from '../core/db.js';
import { lineInfo } from '../core/query.js';
import { launchSchema, type LaunchConfig } from './config.js';
import { serverInstructions } from './descriptions.js';
import { assertRuntimeDatabase } from './runtime-db.js';
import { registerCoarse } from './toolsets/coarse.js';
import { registerFine } from './toolsets/fine.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';
import { registerIssuePreview, supportsMcpApps } from './ui/issue-preview.js';

export function createApp(config: LaunchConfig) {
  const valid = launchSchema.parse(config);
  assertRuntimeDatabase(valid.dbPath);
  const referenceDb = openReadOnly(valid.dbPath);
  const { meta, lines } = (() => {
    try { return { meta: referenceDb.metadata(), lines: lineInfo(referenceDb) }; }
    finally { referenceDb.close(); }
  })();
  const core = createCore({ ...valid, sessionId: randomUUID() });
  const server = new McpServer({ name: 'shopfloor-mcp', version: '0.1.0' },
    { instructions: serverInstructions(meta.reference_now, meta.period_start, meta.period_end) });
  let mcpApps = false;
  try {
    const preview = (valid.toolset === 'coarse' ? registerCoarse : registerFine)(server, core, () => mcpApps);
    registerResources(server, meta, lines);
    registerPrompts(server, valid.toolset);
    const issuePreview = registerIssuePreview(server, preview, core.human);
    // Fail closed: capabilities are read once at a 2025-era initialize. A client that never declares MCP Apps
    // there (including 2026-07-28 per-request clients) keeps the text-only surface.
    server.server.oninitialized = () => {
      if (supportsMcpApps(server.server.getClientCapabilities())) { mcpApps = true; issuePreview.enable(); }
    };
  } catch (error) { core.close(); throw error; }
  let closed = false;
  const closeCore = () => { if (!closed) { closed = true; core.close(); } };
  server.server.onclose = closeCore;
  return { server, close: async () => { try { await server.close(); } finally { closeCore(); } } };
}
