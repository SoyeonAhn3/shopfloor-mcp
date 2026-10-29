import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LINE_IDS } from '../shared/codes.js';
import { audited, type CallContext } from './audit.js';
import { dateSchema, DeniedError, InputError, protectOutput, requireOperator } from './guards.js';
import type { StoredDraft } from './db.js';

export const DRAFT_TTL_MS = 10 * 60 * 1000;
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export function normalizedTitle(title: string): string { return title.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, ''); }
const titleSchema = z.string().trim().min(1).max(200).refine(v => normalizedTitle(v).length > 0);
export const draftSchema = z.strictObject({
  lineId: z.enum(LINE_IDS), relatedDate: dateSchema, title: titleSchema,
  severity: z.enum(['low', 'medium', 'high']), description: z.string().trim().min(1).max(5000),
  evidenceRefs: z.array(z.string().regex(/^Q-\d+$/)).min(1).max(20).refine(v => new Set(v).size === v.length),
});
export type DraftInput = z.infer<typeof draftSchema>;
export const editsSchema = draftSchema.partial();
export type DraftEdits = z.infer<typeof editsSchema>;
export type ToolContext = CallContext & { actor: 'claude' };
declare const humanBrand: unique symbol;
export type HumanContext = CallContext & { actor: 'human'; readonly [humanBrand]: true };
const humanContexts = new WeakSet<object>();
// Trusted host entry only; Phase 7 supplies its human-button context, never model JSON.
export function createHumanContext(ctx: Omit<CallContext, 'actor'>): HumanContext {
  const context = { ...ctx, actor: 'human' as const } as HumanContext;
  humanContexts.add(context); return context;
}
function validateEvidence(ctx: CallContext, input: DraftInput): void {
  if (!ctx.writer.isProductionDate(input.relatedDate)) throw new InputError('유효한 생산일이 필요합니다.');
  for (const id of input.evidenceRefs) {
    const row = ctx.writer.getAudit(id);
    if (!row || row.session_id !== ctx.sessionId || !['ok', 'status'].includes(row.outcome)
      || row.tool_name === 'preview_issue' || row.tool_name === 'confirm_issue' || row.data_as_of !== ctx.clocks.reference()) {
      throw new InputError('현재 세션의 조회 근거가 필요합니다.', 'invalid_evidence');
    }
    const result = JSON.parse(row.result_summary) as { scopes?: { from: string; to: string; lineIds?: string[]; excludeDates: string[] }[] };
    if (!result.scopes?.some(scope => input.relatedDate >= scope.from && input.relatedDate <= scope.to
      && scope.lineIds?.includes(input.lineId) && !scope.excludeDates.includes(input.relatedDate))) {
      throw new InputError('조회 근거의 라인과 생산일을 확인해 주세요.', 'invalid_evidence');
    }
  }
}
function inputFromDraft(draft: StoredDraft): DraftInput {
  return { lineId: draft.line_id, relatedDate: draft.related_date, title: draft.title, severity: draft.severity,
    description: draft.description, evidenceRefs: JSON.parse(draft.evidence_refs) as string[] };
}
export function createDraft(ctx: ToolContext, raw: unknown) {
  return audited(ctx, 'preview_issue', raw, () => {
    requireOperator(ctx.role);
    if (ctx.actor !== 'claude') throw new DeniedError('도구 초안 경로가 아닙니다.');
    const input = draftSchema.parse(protectOutput(draftSchema.parse(raw)));
    validateEvidence(ctx, input);
    const now = ctx.clocks.system(), draftId = 'P-' + randomUUID();
    const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS).toISOString();
    ctx.writer.insertDraft({ draft_id: draftId, session_id: ctx.sessionId, line_id: input.lineId,
      related_date: input.relatedDate, title: input.title, severity: input.severity, description: input.description,
      evidence_refs: JSON.stringify(input.evidenceRefs), status: 'pending', created_at: now.toISOString(),
      expires_at: expiresAt, used_at: null, issue_id: null });
    return { ok: true as const, draftId, expiresAt, draft: input, severityStatus: 'proposed' as const,
      severityNotice: '심각도는 잠정 제안입니다. 최종 심각도는 사람이 확정 화면에서 선택합니다.',
      message: '초안 생성됨. 아직 등록되지 않았으며 이 텍스트 환경에서는 확정할 수 없습니다.' };
  }, { atomic: true });
}
export function confirmDraft(ctx: HumanContext, draftId: string, edits: DraftEdits = {}) {
  return audited(ctx, 'confirm_issue', { draftId, edits }, () => {
    if (!humanContexts.has(ctx) || ctx.actor !== 'human') throw new DeniedError('사람의 확정 경로만 사용할 수 있습니다.');
    requireOperator(ctx.role);
    z.string().uuid().parse(draftId.slice(2));
    if (!draftId.startsWith('P-')) throw new InputError('초안 번호를 확인해 주세요.');
    const changes = editsSchema.parse(edits), draft = ctx.writer.getDraft(draftId);
    if (!draft) return { ok: false as const, reason: 'not_found', message: '초안을 찾을 수 없습니다.' };
    if (draft.session_id !== ctx.sessionId) throw new DeniedError('다른 세션의 초안은 확정할 수 없습니다.');
    if (draft.status === 'confirmed' || draft.used_at) return { ok: false as const, reason: 'already_used', message: '이미 사용한 초안입니다.' };
    const now = ctx.clocks.system();
    if (draft.status === 'expired' || now.getTime() >= Date.parse(draft.expires_at)) {
      ctx.writer.updateDraft(draftId, 'expired', null, null);
      return { ok: false as const, reason: 'expired', message: '초안이 만료되었습니다. 새 초안을 만들어 주세요.' };
    }
    if (draft.status !== 'pending') return { ok: false as const, reason: 'already_used', message: '사용할 수 없는 초안입니다.' };
    const before = inputFromDraft(draft), input = draftSchema.parse(protectOutput({ ...before, ...changes }));
    validateEvidence(ctx, input);
    const candidates = ctx.writer.duplicateCandidates(input.lineId, input.relatedDate,
      new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString(), now.toISOString());
    if (candidates.some(issue => normalizedTitle(issue.title) === normalizedTitle(input.title))) {
      return { ok: false as const, reason: 'duplicate', message: '24시간 이내 같은 라인·생산일·제목으로 등록한 이슈가 있습니다.' };
    }
    const issueId = 'I-' + randomUUID();
    ctx.writer.insertIssue({ issue_id: issueId, line_id: input.lineId, title: input.title, severity: input.severity,
      description: input.description, status: 'open', related_date: input.relatedDate, evidence_refs: JSON.stringify(input.evidenceRefs),
      source: 'mcp', draft_id: draftId, created_by: ctx.userName, created_at: now.toISOString(), closed_at: null });
    ctx.writer.updateDraft(draftId, 'confirmed', now.toISOString(), issueId);
    return { ok: true as const, draftId, issueId, message: '사람의 확인으로 이슈가 등록되었습니다.', humanChanges: { before, after: input } };
  }, { atomic: true });
}
