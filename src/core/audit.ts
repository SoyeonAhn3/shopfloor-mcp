import { ZodError } from 'zod';
import type { AuditInput, RuntimeWriter } from './db.js';
import type { Clocks } from './clock.js';
import type { Evidence } from './evidence.js';
import { DeniedError, protectOutput, type Role } from './guards.js';

export interface CallContext {
  sessionId: string; actor: 'claude' | 'human'; userName: string; role: Role;
  clocks: Clocks; writer: RuntimeWriter; datasetVersion: string;
}
export type CoreFailure = { ok: false; status?: 'query_failed'; reason?: string; message: string };
export type Audited<T> = (T | CoreFailure) & Evidence;
function failure(error: unknown): CoreFailure {
  if (error instanceof DeniedError) return { ok: false, reason: 'denied', message: error.message };
  if (error instanceof ZodError || error instanceof RangeError) return { ok: false, reason: 'invalid_input',
    message: '입력 형식이나 범위를 확인해 주세요. 라인은 L1~L6, 날짜는 실제 YYYY-MM-DD이며 기간과 집계 조건만 지원합니다.' };
  return { ok: false, status: 'query_failed', message: '조회 또는 저장에 실패했습니다. 데이터 연결과 서버 기록을 확인한 뒤 다시 시도해 주세요.' };
}
function summary(result: Record<string, unknown>, params: unknown): Record<string, unknown> {
  const total = result.total as Record<string, unknown> | null | undefined;
  const lines = result.lines as { lineId: string }[] | undefined;
  const lineIds = result.lineIds ?? lines?.map(line => line.lineId);
  const period = result.period as { from: string; to: string } | undefined;
  const comparison = result.comparison as { period?: { from: string; to: string } } | null | undefined;
  const input = params && typeof params === 'object' ? params as { excludeDates?: string[]; comparisonExcludeDates?: string[] } : {};
  const scopes = [
    ...(period ? [{ from: period.from, to: period.to, lineIds, excludeDates: input.excludeDates ?? [] }] : []),
    ...(comparison?.period ? [{ from: comparison.period.from, to: comparison.period.to, lineIds,
      excludeDates: input.comparisonExcludeDates ?? input.excludeDates ?? [] }] : []),
  ];
  return { ok: result.ok, status: result.status, reason: result.reason,
    lineIds, scopes,
    total: total ? Object.fromEntries(Object.entries(total).filter(([key, value]) => key !== 'coverage' && (value === null || typeof value !== 'object'))) : null,
    itemCount: Array.isArray(result.items) ? result.items.length : undefined,
    totalMinutes: result.totalMinutes, unplannedMinutes: result.unplannedMinutes,
    draftId: result.draftId, issueId: result.issueId };
}
export function audited<T extends object>(ctx: CallContext, name: string, params: unknown, fn: () => T,
  options: { atomic?: boolean } = {}): Audited<T> {
  const started = ctx.clocks.system().getTime();
  const finish = (raw: T | CoreFailure, outcomeOverride?: AuditInput['outcome']): Audited<T> => {
    const result = protectOutput(raw), obj = result as Record<string, unknown>;
    const period = obj.period as { from: string; to: string; label: string } | undefined;
    const resolved = period ? { from: period.from, to: period.to, label: period.label } : undefined;
    const outcome: AuditInput['outcome'] = outcomeOverride ?? (obj.status === 'query_failed' ? 'error'
      : obj.ok === false ? (obj.reason ? 'denied' : 'status') : obj.status && obj.status !== 'ok' ? 'status' : 'ok');
    const input: AuditInput = {
      at: ctx.clocks.system().toISOString(), session_id: ctx.sessionId, actor: ctx.actor, user_name: ctx.userName,
      role: ctx.role, tool_name: name, params: JSON.stringify(protectOutput(params ?? null)),
      resolved_range: resolved ? JSON.stringify(resolved) : null, outcome,
      result_summary: JSON.stringify(summary(obj, params)), data_as_of: ctx.clocks.reference(),
      draft_id: typeof obj.draftId === 'string' ? obj.draftId : null,
      issue_id: typeof obj.issueId === 'string' ? obj.issueId : null,
      human_changes: obj.humanChanges ? JSON.stringify(obj.humanChanges) : null,
      duration_ms: Math.max(0, ctx.clocks.system().getTime() - started),
    };
    const evidenceId = ctx.writer.insertAudit(input);
    // Human edits belong in the audit, not in public query responses.
    const { humanChanges: _, ...response } = obj;
    return { ...response, evidenceId, dataAsOf: ctx.clocks.reference(), datasetVersion: ctx.datasetVersion,
      ...(resolved ? { resolvedRange: resolved } : {}) } as Audited<T>;
  };
  try {
    const run = () => finish(fn());
    return options.atomic ? ctx.writer.transaction(run) : run();
  } catch (error) {
    const result = failure(error);
    try { return finish(result, result.reason === 'denied' ? 'denied' : 'error'); }
    catch {
      // A broken audit store cannot supply an evidence ID. Fail closed without inventing one.
      return { ok: false, status: 'query_failed', message: '감사 기록을 저장하지 못했습니다. 작업 결과를 확인할 수 없습니다.',
        evidenceId: null, dataAsOf: ctx.clocks.reference(), datasetVersion: ctx.datasetVersion };
    }
  }
}
