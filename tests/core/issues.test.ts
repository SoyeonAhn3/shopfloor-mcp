import { spawn } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../../src/core/service.js';
import { openReadOnly, RuntimeWriter } from '../../src/core/db.js';
import { createClocks } from '../../src/core/clock.js';
import { audited } from '../../src/core/audit.js';
import { confirmDraft, createDraft, createHumanContext, DRAFT_TTL_MS, type DraftInput, type HumanContext, type ToolContext } from '../../src/core/issues.js';
import { fixture, generatedHash, success } from './fixture.js';

let f: ReturnType<typeof fixture>, core: ReturnType<typeof createCore>, writer: RuntimeWriter,
  db: ReturnType<typeof openReadOnly>, path: string, tool: ToolContext, human: HumanContext, input: DraftInput,
  now: number, initial: string, number = 0;
beforeAll(() => { f = fixture(); initial = generatedHash(f.path); });
beforeEach(() => {
  path = join(f.root, 'issues-' + (++number) + '.db'); copyFileSync(f.path, path);
  db = openReadOnly(path); writer = new RuntimeWriter(path);
  now = Date.parse('2026-10-23T01:00:00Z');
  const clocks = createClocks(db.metadata(), () => new Date(now));
  tool = { writer, clocks, actor: 'claude', sessionId: 'session-a', userName: 'operator', role: 'operator', datasetVersion: f.key.datasetVersion };
  human = createHumanContext({ ...tool, userName: 'human' });
  core = createCore({ dbPath: path, sessionId: tool.sessionId, userName: tool.userName, role: 'operator', clocks });
  const evidence = success(core.tools.getProduction({ lineIds: ['L2'], period: { kind: 'date', date: f.key.E1.productionDate } }));
  input = { lineId: 'L2', relatedDate: f.key.E1.productionDate, title: '장시간 정지 확인', description: '관측된 설비 정지 기록을 확인합니다.', severity: 'medium', evidenceRefs: [evidence.evidenceId!] };
});
afterEach(() => {
  vi.restoreAllMocks(); core.close(); writer.close(); db.close();
  expect(generatedHash(path)).toBe(initial);
});
afterAll(() => { expect(generatedHash(f.path)).toBe(initial); f.close(); });
const issueCount = () => db.get<{ n: number }>("SELECT COUNT(*) n FROM issues WHERE source='mcp'")!.n;
const draft = () => success(createDraft(tool, input));

describe('draft/confirm permissions and transactions', () => {
  it('creates a ten-minute draft without an issue, then atomically records human edits and one confirmation', () => {
    const d = draft();
    expect(draft().draftId).not.toBe(d.draftId);
    expect(issueCount()).toBe(0);
    expect(Date.parse(d.expiresAt) - now).toBe(DRAFT_TTL_MS);
    const result = success(confirmDraft(human, d.draftId, { title: '정지 원인 확인 요청', severity: 'high' }));
    expect(issueCount()).toBe(1);
    expect(writer.getDraft(d.draftId)).toMatchObject({ status: 'confirmed', issue_id: result.issueId, used_at: new Date(now).toISOString() });
    const issue = db.get<{ title: string; severity: string; related_date: string }>('SELECT * FROM issues WHERE issue_id=?', [result.issueId])!;
    expect(issue).toMatchObject({ title: '정지 원인 확인 요청', severity: 'high', related_date: input.relatedDate });
    const audit = writer.getAudit(result.evidenceId!)!;
    expect(audit).toMatchObject({ actor: 'human', outcome: 'ok', draft_id: d.draftId, issue_id: result.issueId });
    expect(JSON.parse(audit.human_changes!)).toMatchObject({ before: { title: input.title }, after: { title: '정지 원인 확인 요청' } });
    expect(confirmDraft(human, d.draftId)).toMatchObject({ ok: false, reason: 'already_used' });
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM audit_log WHERE tool_name='confirm_issue' AND outcome='ok'")!.n).toBe(1);
  });
  it('refuses expired, nonexistent, foreign-session and non-human confirmations', () => {
    const d = draft();
    expect(confirmDraft(createHumanContext({ ...tool, sessionId: 'other' }), d.draftId)).toMatchObject({ reason: 'denied' });
    expect(confirmDraft(tool as unknown as HumanContext, d.draftId)).toMatchObject({ reason: 'denied' });
    expect(confirmDraft({ ...human } as HumanContext, d.draftId)).toMatchObject({ reason: 'denied' });
    expect(confirmDraft(human, 'P-00000000-0000-4000-8000-000000000000')).toMatchObject({ reason: 'not_found' });
    now += DRAFT_TTL_MS;
    expect(confirmDraft(human, d.draftId)).toMatchObject({ reason: 'expired' });
    expect(writer.getDraft(d.draftId)?.status).toBe('expired');
    expect(issueCount()).toBe(0);
  });
  it('rejects viewers for both paths and rejects unsupported draft fields', () => {
    expect(createDraft({ ...tool, role: 'viewer' }, input)).toMatchObject({ reason: 'denied' });
    expect(confirmDraft(createHumanContext({ ...tool, role: 'viewer' }), draft().draftId)).toMatchObject({ reason: 'denied' });
    expect(createDraft(tool, { ...input, workerId: 'W-L2-A1' })).toMatchObject({ reason: 'invalid_input' });
    expect(issueCount()).toBe(0);
  });
  it('requires real same-session evidence for the requested line and included production date', () => {
    const session = { reason: 'invalid_evidence', message: '현재 세션의 조회 근거가 필요합니다.' };
    const scope = { reason: 'invalid_evidence', message: '조회 근거의 라인과 생산일을 확인해 주세요.' };
    expect(createDraft(tool, { ...input, evidenceRefs: ['Q-999999'] })).toMatchObject(session);
    expect(createDraft({ ...tool, sessionId: 'other' }, input)).toMatchObject(session);
    expect(createDraft(tool, { ...input, lineId: 'L3' })).toMatchObject(scope);
    expect(createDraft(tool, { ...input, relatedDate: '2026-07-16' })).toMatchObject(scope);
    expect(createDraft(tool, { ...input, relatedDate: '2026-07-18' })).toMatchObject({ reason: 'invalid_input', message: '유효한 생산일이 필요합니다.' });
    const excluded = success(core.tools.getProduction({ lineIds: ['L2'], period: { kind: 'range', from: '2026-07-13', to: '2026-07-17' }, excludeDates: [input.relatedDate] }));
    expect(createDraft(tool, { ...input, evidenceRefs: [excluded.evidenceId] })).toMatchObject(scope);
    const d = draft();
    expect(confirmDraft(human, d.draftId, { lineId: 'L3' })).toMatchObject(scope);
    expect(writer.getDraft(d.draftId)?.status).toBe('pending');
  });
  it('normalizes duplicate titles for 24 hours and permits a later separately reviewed issue', () => {
    const first = draft(); success(confirmDraft(human, first.draftId));
    const second = success(createDraft(tool, { ...input, title: '장시간   정지 확인!!' }));
    expect(confirmDraft(human, second.draftId)).toMatchObject({ reason: 'duplicate' });
    expect(writer.getDraft(second.draftId)?.status).toBe('pending');
    now += 24 * 60 * 60 * 1000 + 1;
    success(confirmDraft(human, draft().draftId));
    expect(issueCount()).toBe(2);
  });
  it('accepts loss-analysis evidence and either included period of a comparison', () => {
    const loss = success(core.tools.breakdownLoss({ lineIds: ['L2'], period: { kind: 'date', date: input.relatedDate } }));
    expect(createDraft(tool, { ...input, evidenceRefs: [loss.evidenceId] }).ok).toBe(true);
    const comparison = success(core.tools.getProduction({ lineIds: ['L2'], period: { kind: 'date', date: '2026-07-16' },
      compareTo: { kind: 'date', date: input.relatedDate } }));
    expect(createDraft(tool, { ...input, evidenceRefs: [comparison.evidenceId] }).ok).toBe(true);
    const excluded = success(core.tools.getProduction({ lineIds: ['L2'], period: { kind: 'date', date: '2026-07-16' },
      compareTo: { kind: 'range', from: '2026-07-13', to: '2026-07-15' }, excludeDates: [input.relatedDate] }));
    expect(createDraft(tool, { ...input, evidenceRefs: [excluded.evidenceId] })).toMatchObject({ reason: 'invalid_evidence' });
  });
  it('keeps the generic text for runtime range errors so internal messages never reach the response', () => {
    const result = audited(tool, 'test_query', {}, () => { throw new RangeError('Invalid time value'); });
    expect(result).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(JSON.stringify(result)).not.toContain('Invalid time value');
  });
  it('reports any malformed draft number with the same specific reason', () => {
    for (const id of ['Q-00000000-0000-4000-8000-000000000000', 'P-123', 'abc'])
      expect(confirmDraft(human, id)).toMatchObject({ reason: 'invalid_input', message: '초안 번호를 확인해 주세요.' });
  });
  it.each(['insertIssue', 'updateDraft', 'insertAudit'] as const)('rolls back all writes if %s fails, then logs the failure outside the transaction', stage => {
    const d = draft();
    vi.spyOn(writer, stage).mockImplementationOnce(() => { throw new Error('Injected failure'); });
    expect(confirmDraft(human, d.draftId)).toMatchObject({ ok: false, status: 'query_failed' });
    expect(issueCount()).toBe(0);
    expect(writer.getDraft(d.draftId)).toMatchObject({ status: 'pending', used_at: null, issue_id: null });
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM audit_log WHERE tool_name='confirm_issue' AND outcome='ok'")!.n).toBe(0);
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM audit_log WHERE tool_name='confirm_issue' AND outcome='error'")!.n).toBe(1);
  });
  it('rolls back draft creation when its audit write fails and fails closed when all audit writes fail', () => {
    vi.spyOn(writer, 'insertAudit').mockImplementationOnce(() => { throw new Error('Audit unavailable'); });
    expect(createDraft(tool, input)).toMatchObject({ ok: false, status: 'query_failed' });
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM issue_drafts')!.n).toBe(0);
    vi.restoreAllMocks();
    vi.spyOn(writer, 'insertAudit').mockImplementation(() => { throw new Error('Audit unavailable'); });
    expect(audited(tool, 'test_query', {}, () => ({ ok: true, value: 1 }))).toMatchObject({ ok: false, status: 'query_failed', evidenceId: null });
  });
  it('redacts worker identifiers in draft and human-edited free text', () => {
    const d = success(createDraft(tool, { ...input, description: 'W-L2-A1 관련 기록' }));
    expect(JSON.stringify(d)).not.toContain('W-L2-A1');
    const result = success(confirmDraft(human, d.draftId, { title: 'W-L2-B1 기록 확인' }));
    expect(JSON.stringify(result)).not.toContain('W-L2-B1');
    expect(writer.getAudit(result.evidenceId!)!.human_changes).not.toMatch(/W-L\d-[AB]\d/);
  });
  it('serializes genuinely concurrent confirmations on two independent processes', async () => {
    const d = draft(), children: ReturnType<typeof spawn>[] = [];
    try {
      const pending = [0,1].map(() => {
        const child = spawn(process.execPath, ['--import', 'tsx', resolve('tests/core/confirm-worker.ts'), path, d.draftId, new Date(now).toISOString(), tool.sessionId],
          { stdio: ['pipe','pipe','pipe'], windowsHide: true });
        children.push(child);
        let output = '', error = '', readyResolve!: () => void;
        const ready = new Promise<void>(resolve => { readyResolve = resolve; });
        child.stdout!.on('data', chunk => { output += String(chunk); if (output.includes('READY\n')) readyResolve(); });
        child.stderr!.on('data', chunk => { error += String(chunk); });
        const result = new Promise<{ ok: boolean; reason?: string }>((resolve, reject) => {
          child.on('error', reject);
          child.on('exit', code => {
            if (code !== 0) reject(new Error('Confirmation worker failed: ' + error));
            else { try { resolve(JSON.parse(output.trim().split('\n').at(-1)!)); } catch (failure) { reject(failure); } }
          });
        });
        return { ready: Promise.race([ready, result.then(() => { throw new Error('Worker exited before request'); })]), result, child };
      });
      await Promise.all(pending.map(p => p.ready));
      for (const p of pending) p.child.stdin!.end('confirm\n');
      const results = await Promise.all(pending.map(p => p.result));
      expect(results.filter(r => r.ok)).toHaveLength(1);
      expect(results.filter(r => r.reason === 'already_used')).toHaveLength(1);
      expect(issueCount()).toBe(1);
      expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM audit_log WHERE tool_name='confirm_issue' AND outcome='ok'")!.n).toBe(1);
    } finally { for (const child of children) if (child.exitCode === null) child.kill(); }
  });
});
