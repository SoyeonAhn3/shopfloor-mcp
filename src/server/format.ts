import type { CallToolResult } from '@modelcontextprotocol/server';
import { protectOutput } from '../core/guards.js';
import { LINE_COMPARISON_NOTE } from './descriptions.js';

export const DETAIL_LIMIT = 60;
type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown) => typeof v === 'number' ? v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '산출 불가';
const percent = (v: unknown) => typeof v === 'number' ? number(v * 100) + '%' : '산출 불가';
const statusLabels: Record<string, string> = {
  ok: '정상', missing_data: '미입력 포함', planned_stop: '계획 정지', zero_production: '생산 0',
  out_of_range: '조회 범위 밖', non_working_day: '휴무일', query_failed: '조회 실패',
};
export const FORM_DRAFT_MESSAGE = '초안 생성됨. 아직 등록되지 않았습니다. 사람이 화면의 폼에서 확인하고 확정해야 등록됩니다.';
function summary(raw: Row, ui: boolean): string {
  if (raw.ok === false) return String(raw.message ?? '요청을 처리하지 못했습니다.');
  if (raw.issueId) return '이슈 등록됨 (' + raw.issueId + '). 사람의 확인으로 등록되었습니다.';
  if (raw.draftId) return '초안 생성됨 (' + raw.draftId + '). '
    + (ui ? '사람이 화면의 폼에서 확인하고 확정해야 등록됩니다.' : '이 환경에서는 확정할 수 없습니다.');
  const range = isRow(raw.resolvedRange) ? raw.resolvedRange.from + '~' + raw.resolvedRange.to + ': ' : '';
  const total = isRow(raw.total) ? raw.total : undefined;
  let detail: string;
  if (typeof raw.totalMinutes === 'number') detail = '비가동 ' + number(raw.totalMinutes) + '분, 비계획 ' + number(raw.unplannedMinutes) + '분';
  else if (total && 'produced' in total) detail = '생산 ' + number(total.produced) + ', 양품 ' + number(total.good)
    + ', 목표 ' + number(total.target) + ', 달성률 ' + percent(total.achievement) + ', 불량률 ' + percent(total.defectRate);
  else if (total && 'shortfall' in total) detail = '미달 ' + number(total.shortfall)
    + ' (비가동 ' + number(total.downtimeLoss) + ', 속도 ' + number(total.speedLoss) + ', 불량 ' + number(total.defectLoss) + ')';
  else detail = '항목 ' + (Array.isArray(raw.items) ? raw.items.length : 0) + '건';
  return range + detail + ' [' + (statusLabels[String(raw.status)] ?? String(raw.status ?? 'ok')) + ']';
}
function recovery(raw: Row): string | undefined {
  if (raw.ok !== false) return undefined;
  if (raw.status === 'out_of_range' || raw.status === 'non_working_day') {
    const available = isRow(raw.available) ? raw.available : {};
    return '조회 가능 범위 ' + available.from + '~' + available.to + '의 생산일을 선택하세요. 원래 요청의 범위를 임의로 바꾸지 마세요.';
  }
  if (raw.reason === 'denied') return 'preview_issue는 operator 역할로 실행한 서버에서만 사용할 수 있습니다. 실행 역할은 AI가 변경할 수 없으므로 초안을 만들 수 없다고 안내하세요.';
  if (raw.reason === 'invalid_evidence') return '초안의 라인·생산일을 같은 세션에서 먼저 조회하고, 그 조회 결과의 evidenceId를 evidenceRefs에 넣으세요. 근거와 맞지 않는 날짜로 바꾸지 마세요.';
  if (raw.reason === 'invalid_input') return 'summary의 이유에 맞게 입력을 고치세요. 라인은 L1~L6, period는 구조화된 생산일 조건입니다.';
  return '서버와 실행용 DB 상태를 확인한 후 다시 시도하세요. 성공으로 처리하지 마세요.';
}
export function formatResult(result: object, context: { tool: string; mode?: string; production?: boolean; ui?: boolean }): CallToolResult {
  // Defense in depth also protects formatter additions. Core already redacts each operation.
  const raw = protectOutput(result) as Row;
  const truncated: { path: string; total: number; returned: number }[] = [];
  const cap = (value: unknown, path = ''): unknown => {
    if (Array.isArray(value)) {
      if (value.length > DETAIL_LIMIT) truncated.push({ path, total: value.length, returned: DETAIL_LIMIT });
      return value.slice(0, DETAIL_LIMIT).map((v, i) => cap(v, path + '[' + i + ']'));
    }
    if (isRow(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cap(v, path ? path + '.' + k : k)]));
    return value;
  };
  const ui = context.ui === true;
  const body = {
    summary: summary(raw, ui), ...cap(raw) as Row,
    // Core's draft message describes the text-only surface; a form client must not be told it cannot confirm.
    ...(ui && raw.draftId ? { message: FORM_DRAFT_MESSAGE } : {}),
    ...(context.production ? { note: LINE_COMPARISON_NOTE } : {}),
    request: { tool: context.tool, ...(context.mode ? { mode: context.mode } : {}) },
    units: { achievement: 'ratio', defectRate: 'ratio', producedChangePct: 'percent', changePercentagePoints: 'percentage_points', loss60: 'quantity × 60' },
    // Recovery hints address the model; the app-only confirm result is read by a person in the form.
    ...(context.tool !== 'confirm_issue' && recovery(raw) ? { recovery: recovery(raw) } : {}),
    truncated,
    ...(truncated.length ? { detailNotice: '합계는 전체 조회 대상 기준이며 상세 내역은 일부입니다. 기간·라인·시간대 조건을 좁혀 다시 조회하세요.' } : {}),
  };
  // Keep exact core numbers in JSON; rounding is only for the human-readable summary.
  return { isError: raw.ok === false, content: [{ type: 'text', text: body.summary + '\n' + JSON.stringify(body) }],
    structuredContent: body };
}
