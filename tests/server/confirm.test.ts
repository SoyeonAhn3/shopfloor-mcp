import Database from 'better-sqlite3';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { createCore } from '../../src/core/service.js';
import { createApp } from '../../src/server/app.js';
import { copyRuntimeDatabase } from '../../src/server/runtime-db.js';
import { fixture, generatedHash } from '../core/fixture.js';

type Peer = { client: Client; app: ReturnType<typeof createApp> };
type Body = Record<string, unknown>;
const MCP_APPS = { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } };
let f: ReturnType<typeof fixture>, path: string, db: Database.Database, initial: string;
let text: Peer, textFine: Peer, otherMime: Peer, form: Peer, formFine: Peer, formViewer: Peer;
async function connect(toolset: 'coarse' | 'fine', role: 'viewer' | 'operator', extensions?: Record<string, { mimeTypes: string[] }>): Promise<Peer> {
  const app = createApp({ dbPath: path, toolset, role, userName: 'confirm-test' });
  const client = new Client({ name: 'confirm-test-client', version: '1.0.0' }, extensions ? { capabilities: { extensions } } : {});
  const [c, s] = InMemoryTransport.createLinkedPair();
  await app.server.connect(s); await client.connect(c);
  return { app, client };
}
async function call(peer: Peer, name: string, args: Body) {
  const result = await peer.client.callTool({ name, arguments: args });
  return { result, body: result.structuredContent as Body };
}
let drafts = 0;
// Unique titles keep duplicate checks to the test that asks for one.
async function draft(peer: Peer, title = '확정 폼 확인 ' + ++drafts) {
  const period = { kind: 'yesterday' };
  const q = peer === formFine ? await call(peer, 'get_production', { period, lineIds: ['L1'] })
    : await call(peer, 'query_production', { mode: 'production', period, lineIds: ['L1'] });
  const { body } = await call(peer, 'preview_issue', { lineId: 'L1', relatedDate: '2026-09-30', title, severity: 'medium',
    description: '폼에서 확정하는 초안', evidenceRefs: [q.body.evidenceId] });
  expect(body.draftId).toMatch(/^P-/);
  return body.draftId as string;
}
const count = (table: 'issues' | 'issue_drafts' | 'audit_log') => (db.prepare('SELECT COUNT(*) n FROM ' + table).get() as { n: number }).n;
// Rejected attempts carry the draft ID only in params.
const confirmAudits = (draftId: string) => db.prepare("SELECT actor, outcome, human_changes FROM audit_log WHERE tool_name = 'confirm_issue' AND json_extract(params, '$.draftId') = ? ORDER BY log_id")
  .all(draftId) as { actor: string; outcome: string; human_changes: string | null }[];
const storedDraft = (draftId: string) => db.prepare('SELECT status, used_at, issue_id FROM issue_drafts WHERE draft_id = ?').get(draftId) as
  { status: string; used_at: string | null; issue_id: string | null };
beforeAll(async () => {
  f = fixture(); initial = generatedHash(f.path);
  path = await copyRuntimeDatabase(f.path, join(f.root, 'confirm-runtime.db'));
  db = new Database(path);
  text = await connect('coarse', 'operator'); textFine = await connect('fine', 'operator');
  otherMime = await connect('coarse', 'operator', { [EXTENSION_ID]: { mimeTypes: ['text/html'] } });
  form = await connect('coarse', 'operator', MCP_APPS); formFine = await connect('fine', 'operator', MCP_APPS);
  formViewer = await connect('coarse', 'viewer', MCP_APPS);
});
afterAll(async () => {
  for (const peer of [text, textFine, otherMime, form, formFine, formViewer]) { await peer?.client.close(); await peer?.app.close(); }
  db?.close(); expect(generatedHash(f.path)).toBe(initial); f.close();
});

describe('confirm_issue visibility and registration', () => {
  it('is never registered for clients without MCP Apps', async () => {
    for (const peer of [text, textFine, otherMime]) {
      expect((await peer.client.listTools()).tools.some(t => t.name.includes('confirm'))).toBe(false);
      // "not found", not "disabled": a text client cannot tell the tool exists.
      await expect(peer.client.callTool({ name: 'confirm_issue', arguments: { draftId: 'P-x' } })).rejects.toThrow('not found');
    }
    const issues = count('issues'), draftId = await draft(text);
    await expect(text.client.callTool({ name: 'confirm_issue', arguments: { draftId } })).rejects.toThrow('not found');
    expect(count('issues')).toBe(issues); expect(storedDraft(draftId).status).toBe('pending');
  });

  it('is app-only for MCP Apps clients in both tool sets', async () => {
    for (const peer of [form, formFine]) {
      const confirm = (await peer.client.listTools()).tools.filter(t => t.name === 'confirm_issue');
      expect(confirm).toHaveLength(1);
      // Without "model" the host leaves the tool out of the agent's list (ext-apps spec MUST).
      expect(confirm[0]?._meta?.ui).toEqual({ visibility: ['app'] });
      expect(confirm[0]?.annotations?.readOnlyHint).toBe(false);
      expect(confirm[0]?.inputSchema).toMatchObject({ additionalProperties: false, required: ['draftId'] });
    }
  });

  it('keeps confirmation out of the public core tools', () => {
    const core = createCore({ dbPath: path, sessionId: 'confirm-core', userName: 'confirm-test', role: 'operator', clocks: f.clocks });
    try {
      expect(Object.keys(core.tools).some(name => /confirm/i.test(name))).toBe(false);
      expect(Object.keys(core.human)).toEqual(['confirmDraft']);
    } finally { core.close(); }
  });
});

describe('form → confirm_issue → issue and audit', () => {
  it('registers exactly one issue with the human edits and one success audit', async () => {
    for (const [peer, title] of [[form, '사람이 고친 제목 coarse'], [formFine, '사람이 고친 제목 fine']] as const) {
      const draftId = await draft(peer), issues = count('issues');
      const { result, body } = await call(peer, 'confirm_issue', { draftId, edits: { severity: 'high', title } });
      expect(result.isError).toBe(false);
      expect(body).toMatchObject({ ok: true, draftId, request: { tool: 'confirm_issue' } });
      expect(body.summary).toBe('이슈 등록됨 (' + body.issueId + '). 사람의 확인으로 등록되었습니다.');
      expect(body).not.toHaveProperty('humanChanges'); expect(body).not.toHaveProperty('recovery');
      expect(count('issues')).toBe(issues + 1);
      expect(db.prepare('SELECT issue_id, title, severity, source, created_by FROM issues WHERE draft_id = ?').all(draftId))
        .toEqual([{ issue_id: body.issueId, title, severity: 'high', source: 'mcp', created_by: 'confirm-test' }]);
      expect(storedDraft(draftId)).toMatchObject({ status: 'confirmed', issue_id: body.issueId });
      const audits = confirmAudits(draftId);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actor: 'human', outcome: 'ok' });
      const changes = JSON.parse(audits[0]?.human_changes ?? 'null') as { before: Body; after: Body };
      expect(changes.before).toMatchObject({ title: expect.stringMatching(/^확정 폼 확인 \d+$/), severity: 'medium' });
      expect(changes.after).toMatchObject({ title, severity: 'high' });
    }
  });

  it('confirms an unedited draft when the form sends no edits', async () => {
    const draftId = await draft(form);
    const { body } = await call(form, 'confirm_issue', { draftId });
    expect(body.ok).toBe(true);
    expect(db.prepare('SELECT severity FROM issues WHERE draft_id = ?').get(draftId)).toEqual({ severity: 'medium' });
  });

  it('rejects a double click without a second issue', async () => {
    const draftId = await draft(form);
    expect((await call(form, 'confirm_issue', { draftId, edits: {} })).body.ok).toBe(true);
    const issues = count('issues');
    const { result, body } = await call(form, 'confirm_issue', { draftId, edits: { severity: 'low' } });
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({ ok: false, reason: 'already_used', message: '이미 사용한 초안입니다.' });
    expect(body).not.toHaveProperty('recovery');
    expect(count('issues')).toBe(issues);
    expect(confirmAudits(draftId).map(a => a.outcome)).toEqual(['ok', 'denied']);
  });

  it('rejects an expired draft and marks it expired', async () => {
    const draftId = await draft(form), issues = count('issues');
    db.prepare('UPDATE issue_drafts SET expires_at = ? WHERE draft_id = ?').run('2000-01-01T00:00:00.000Z', draftId);
    const { result, body } = await call(form, 'confirm_issue', { draftId });
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({ ok: false, reason: 'expired' });
    expect(body.message).toContain('새 초안');
    expect(count('issues')).toBe(issues); expect(storedDraft(draftId).status).toBe('expired');
  });

  it('rejects a duplicate and leaves the draft usable with a new title', async () => {
    const first = await draft(form, '중복 확인'), second = await draft(form, '중복 확인');
    expect((await call(form, 'confirm_issue', { draftId: first })).body.ok).toBe(true);
    const issues = count('issues');
    const duplicate = await call(form, 'confirm_issue', { draftId: second, edits: { title: ' 중복  확인!' } });
    expect(duplicate.result.isError).toBe(true);
    expect(duplicate.body).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(count('issues')).toBe(issues); expect(storedDraft(second).status).toBe('pending');
    expect((await call(form, 'confirm_issue', { draftId: second, edits: { title: '중복 확인 2차' } })).body.ok).toBe(true);
  });

  it('accepts only the fields the form can edit', async () => {
    const draftId = await draft(form), issues = count('issues'), audits = count('audit_log');
    for (const args of [{ draftId, edits: { lineId: 'L2' } }, { draftId, edits: { relatedDate: '2026-09-29' } },
      { draftId, edits: { evidenceRefs: ['Q-0001'] } }, { draftId, actor: 'human' }, {}]) {
      const result = await form.client.callTool({ name: 'confirm_issue', arguments: args });
      expect(result.isError).toBe(true);
    }
    expect(count('issues')).toBe(issues); expect(count('audit_log')).toBe(audits);
    expect(storedDraft(draftId).status).toBe('pending');
  });

  it('rejects another session\'s draft and a viewer, each audited', async () => {
    const draftId = await draft(form), issues = count('issues');
    for (const peer of [formFine, formViewer]) {
      const { result, body } = await call(peer, 'confirm_issue', { draftId });
      expect(result.isError).toBe(true);
      expect(body).toMatchObject({ ok: false, reason: 'denied' });
    }
    expect(count('issues')).toBe(issues); expect(storedDraft(draftId).status).toBe('pending');
    expect(confirmAudits(draftId).map(a => [a.actor, a.outcome])).toEqual([['human', 'denied'], ['human', 'denied']]);
  });
});
