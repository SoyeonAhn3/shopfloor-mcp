import type { Crew, DefectType, LineId, ReasonCode, REASONS, Shift } from './codes.js';

export interface DatasetMeta { dataset_version: string; seed: number; period_start: string; period_end: string; reference_now: string; generated_at: string }
export interface Line { line_id: LineId; line_name: string; product_name: string; std_rate_per_hour: number }
export interface Worker { worker_id: string; line_id: LineId; crew: Crew }
export interface CalendarDay {
  calendar_date: string; day_of_week: string; is_working_day: number; week_start: string;
  day_crew: Crew | null; night_crew: Crew | null;
}
export interface HourlyPlan {
  line_id: LineId; slot_start: string; production_date: string; shift: Shift; crew: Crew;
  hour_of_day: number; planned_stop_minutes: number; planned_stop_reason: 'shift_change' | 'maintenance' | null;
  planned_minutes: number; target_qty: number;
}
export interface HourlyOutput { line_id: LineId; slot_start: string; produced_qty: number; good_qty: number }
export interface DefectEvent {
  defect_id: string; line_id: LineId; production_date: string; detected_at: string; shift: Shift;
  crew: Crew; defect_type: DefectType; worker_id: string;
}
export interface DowntimeEvent {
  downtime_id: string; line_id: LineId; production_date: string; shift: Shift; crew: Crew;
  start_at: string; end_at: string; duration_min: number; reason_category: typeof REASONS[ReasonCode];
  reason_code: ReasonCode; is_planned: number; memo: string; entered_by: string;
}
export interface Issue {
  issue_id: string; line_id: LineId; title: string; severity: 'low' | 'medium' | 'high';
  description: string; status: 'open' | 'in_progress' | 'closed'; related_date: string | null;
  evidence_refs: string; source: 'seed' | 'mcp'; draft_id: string | null; created_by: string;
  created_at: string; closed_at: string | null;
}
export interface IssueDraft {
  draft_id: string; session_id: string; line_id: LineId; title: string; severity: Issue['severity'];
  description: string; evidence_refs: string; status: 'pending' | 'confirmed' | 'expired' | 'cancelled';
  created_at: string; expires_at: string; used_at: string | null; issue_id: string | null;
}
export interface AuditRow {
  log_id: number; ref_id: string; at: string; session_id: string; actor: 'claude' | 'human';
  user_name: string; role: 'viewer' | 'operator'; tool_name: string; params: string;
  resolved_range: string | null; outcome: 'ok' | 'status' | 'denied' | 'error';
  result_summary: string; data_as_of: string; draft_id: string | null; issue_id: string | null;
  human_changes: string | null; duration_ms: number;
}
export interface DatasetTables {
  dataset_meta: DatasetMeta[]; lines: Line[]; workers: Worker[]; calendar: CalendarDay[];
  hourly_plan: HourlyPlan[]; hourly_output: HourlyOutput[]; defect_events: DefectEvent[];
  downtime_events: DowntimeEvent[]; issues: Issue[]; issue_drafts: IssueDraft[]; audit_log: AuditRow[];
}
// Event labels exist in generator memory / answer key only, never in DB rows.
export interface PlantedRecords { downtimeIds: Record<string, string[]>; attackDowntimeId: string }
export interface GeneratedDataset { tables: DatasetTables; planted: PlantedRecords }
