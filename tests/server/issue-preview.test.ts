import Database from 'better-sqlite3';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { EXTENSION_ID, RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from '@modelcontextprotocol/ext-apps/server';
import { createApp } from '../../src/server/app.js';
import { FORM_DRAFT_MESSAGE } from '../../src/server/format.js';
import { copyRuntimeDatabase } from '../../src/server/runtime-db.js';
import { ISSUE_PREVIEW_URI, supportsMcpApps } from '../../src/server/ui/issue-preview.js';
import { fixture, generatedHash } from '../core/fixture.js';

type Peer = { client: Client; app: ReturnType<typeof createApp> };
const MCP_APPS = { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } };
let f: ReturnType<typeof fixture>, path: string, db: Database.Database, initial: string;
let text: Peer, form: Peer, formFine: Peer, otherMime: Peer;
async function connect(toolset: 'coarse' | 'fine', extensions?: Record<string, { mimeTypes: string[] }>): Promise<Peer> {
  const app = createApp({ dbPath: path, toolset, role: 'operator', userName: 'ui-test' });
  const client = new Client({ name: 'ui-test-client', version: '1.0.0' }, extensions ? { capabilities: { extensions } } : {});
  const [c, s] = InMemoryTransport.createLinkedPair();
  await app.server.connect(s); await client.connect(c);
  return { app, client };
}
const previewTool = async (peer: Peer) => (await peer.client.listTools()).tools.find(t => t.name === 'preview_issue');
async function draft(peer: Peer) {
  const q = await peer.client.callTool({ name: 'query_production', arguments: { mode: 'production', period: { kind: 'yesterday' }, lineIds: ['L1'] } });
  const evidenceId = (q.structuredContent as { evidenceId: string }).evidenceId;
  const result = await peer.client.callTool({ name: 'preview_issue', arguments: { lineId: 'L1', relatedDate: '2026-09-30',
    title: '폼 표시 확인', severity: 'medium', description: '화면 확인용 초안', evidenceRefs: [evidenceId] } });
  return { result, body: result.structuredContent as Record<string, unknown> };
}
const count = (table: 'issue_drafts' | 'issues') => (db.prepare('SELECT COUNT(*) n FROM ' + table).get() as { n: number }).n;
beforeAll(async () => {
  f = fixture(); initial = generatedHash(f.path);
  path = await copyRuntimeDatabase(f.path, join(f.root, 'ui-runtime.db'));
  db = new Database(path);
  text = await connect('coarse'); form = await connect('coarse', MCP_APPS); formFine = await connect('fine', MCP_APPS);
  otherMime = await connect('coarse', { [EXTENSION_ID]: { mimeTypes: ['text/html'] } });
});
afterAll(async () => {
  for (const peer of [text, form, formFine, otherMime]) { await peer?.client.close(); await peer?.app.close(); }
  db?.close(); expect(generatedHash(f.path)).toBe(initial); f.close();
});

describe('issue preview form surface (MCP Apps)', () => {
  it('detects MCP Apps only from the declared extension MIME type', () => {
    expect(supportsMcpApps(undefined)).toBe(false);
    expect(supportsMcpApps({})).toBe(false);
    expect(supportsMcpApps({ extensions: { [EXTENSION_ID]: { mimeTypes: ['text/html'] } } })).toBe(false);
    expect(supportsMcpApps({ extensions: MCP_APPS })).toBe(true);
  });

  it('keeps the Phase 4 text-only surface for clients without MCP Apps', async () => {
    for (const peer of [text, otherMime]) {
      const resources = (await peer.client.listResources()).resources;
      expect(resources).toHaveLength(4);
      expect(resources.some(r => r.uri.startsWith('ui://'))).toBe(false);
      expect((await previewTool(peer))?._meta).toBeUndefined();
      await expect(peer.client.readResource({ uri: ISSUE_PREVIEW_URI })).rejects.toThrow();
    }
    const { body } = await draft(text);
    expect(body.summary).toContain('이 환경에서는 확정할 수 없습니다');
    expect(body.message).toContain('이 텍스트 환경에서는 확정할 수 없습니다');
  });

  it('links preview_issue to the form resource for MCP Apps clients in both tool sets', async () => {
    for (const [peer, tools] of [[form, 4], [formFine, 10]] as const) {
      const listed = (await peer.client.listTools()).tools;
      expect(listed).toHaveLength(tools);
      expect(listed.some(t => t.name.includes('confirm'))).toBe(false);
      const meta = (await previewTool(peer))?._meta as Record<string, unknown>;
      expect(meta.ui).toEqual({ resourceUri: ISSUE_PREVIEW_URI });
      expect(meta[RESOURCE_URI_META_KEY]).toBe(ISSUE_PREVIEW_URI);
      const resources = (await peer.client.listResources()).resources;
      expect(resources).toHaveLength(5);
      expect(resources.find(r => r.uri === ISSUE_PREVIEW_URI)?.mimeType).toBe(RESOURCE_MIME_TYPE);
    }
  });

  it('serves a self-contained form that talks only to its host', async () => {
    const [content] = (await form.client.readResource({ uri: ISSUE_PREVIEW_URI })).contents;
    expect(content?.mimeType).toBe(RESOURCE_MIME_TYPE);
    const html = content && 'text' in content ? content.text : '';
    expect(html.startsWith('<!doctype html>')).toBe(true);
    // The default MCP Apps CSP blocks every outside origin, so nothing may be loaded or fetched.
    expect(html).not.toMatch(/\b(?:src|href|action)\s*=|@import|url\(|fetch\(|XMLHttpRequest|WebSocket/i);
    // Server strings reach the DOM only as text.
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(html).toContain("event.source !== window.parent");
    for (const method of ['ui/initialize', 'ui/notifications/initialized', 'ui/notifications/tool-result', 'tools/call']) {
      expect(html).toContain("'" + method + "'");
    }
    expect(html).toContain("name: 'confirm_issue'");
  });

  it('tells form clients to confirm in the form and still registers no issue', async () => {
    const issues = count('issues'), drafts = count('issue_drafts');
    const { result, body } = await draft(form);
    expect(result.isError).toBe(false);
    expect(body.summary).toContain('화면의 폼에서 확인하고 확정해야 등록됩니다');
    expect(body.message).toBe(FORM_DRAFT_MESSAGE);
    expect(JSON.stringify(result)).not.toContain('확정할 수 없습니다');
    expect(body.draftId).toMatch(/^P-/);
    expect(count('issue_drafts')).toBe(drafts + 1); expect(count('issues')).toBe(issues);
  });
});
