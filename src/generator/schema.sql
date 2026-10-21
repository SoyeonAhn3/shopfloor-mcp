PRAGMA foreign_keys = ON;
CREATE TABLE dataset_meta (
  dataset_version TEXT PRIMARY KEY, seed INTEGER NOT NULL,
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  reference_now TEXT NOT NULL, generated_at TEXT NOT NULL
) STRICT;
CREATE TABLE lines (
  line_id TEXT PRIMARY KEY, line_name TEXT NOT NULL, product_name TEXT NOT NULL,
  std_rate_per_hour INTEGER NOT NULL CHECK(std_rate_per_hour > 0)
) STRICT;
CREATE TABLE workers (
  worker_id TEXT PRIMARY KEY, line_id TEXT NOT NULL REFERENCES lines(line_id),
  crew TEXT NOT NULL CHECK(crew IN ('A','B'))
) STRICT;
CREATE TABLE calendar (
  calendar_date TEXT PRIMARY KEY, day_of_week TEXT NOT NULL,
  is_working_day INTEGER NOT NULL CHECK(is_working_day IN (0,1)), week_start TEXT NOT NULL,
  day_crew TEXT CHECK(day_crew IN ('A','B')), night_crew TEXT CHECK(night_crew IN ('A','B')),
  CHECK((is_working_day=0 AND day_crew IS NULL AND night_crew IS NULL) OR
        (is_working_day=1 AND day_crew IS NOT NULL AND night_crew IS NOT NULL AND day_crew<>night_crew))
) STRICT;
CREATE TABLE hourly_plan (
  line_id TEXT NOT NULL REFERENCES lines(line_id), slot_start TEXT NOT NULL,
  production_date TEXT NOT NULL REFERENCES calendar(calendar_date),
  shift TEXT NOT NULL CHECK(shift IN ('day','night')), crew TEXT NOT NULL CHECK(crew IN ('A','B')),
  hour_of_day INTEGER NOT NULL CHECK(hour_of_day BETWEEN 0 AND 23),
  planned_stop_minutes INTEGER NOT NULL CHECK(planned_stop_minutes BETWEEN 0 AND 60),
  planned_stop_reason TEXT CHECK(planned_stop_reason IN ('shift_change','maintenance')),
  planned_minutes INTEGER NOT NULL CHECK(planned_minutes BETWEEN 0 AND 60),
  target_qty INTEGER NOT NULL CHECK(target_qty>=0),
  PRIMARY KEY(line_id,slot_start), CHECK(planned_minutes+planned_stop_minutes=60)
) STRICT;
CREATE TABLE hourly_output (
  line_id TEXT NOT NULL, slot_start TEXT NOT NULL,
  produced_qty INTEGER NOT NULL CHECK(produced_qty>=0),
  good_qty INTEGER NOT NULL CHECK(good_qty>=0 AND good_qty<=produced_qty),
  PRIMARY KEY(line_id,slot_start),
  FOREIGN KEY(line_id,slot_start) REFERENCES hourly_plan(line_id,slot_start)
) STRICT;
CREATE TABLE defect_events (
  defect_id TEXT PRIMARY KEY, line_id TEXT NOT NULL REFERENCES lines(line_id),
  production_date TEXT NOT NULL REFERENCES calendar(calendar_date),
  detected_at TEXT NOT NULL, shift TEXT NOT NULL CHECK(shift IN ('day','night')),
  crew TEXT NOT NULL CHECK(crew IN ('A','B')),
  defect_type TEXT NOT NULL CHECK(defect_type IN ('dimension','appearance','function')),
  worker_id TEXT NOT NULL REFERENCES workers(worker_id)
) STRICT;
CREATE TABLE downtime_events (
  downtime_id TEXT PRIMARY KEY, line_id TEXT NOT NULL REFERENCES lines(line_id),
  production_date TEXT NOT NULL REFERENCES calendar(calendar_date),
  shift TEXT NOT NULL CHECK(shift IN ('day','night')), crew TEXT NOT NULL CHECK(crew IN ('A','B')),
  start_at TEXT NOT NULL, end_at TEXT NOT NULL CHECK(end_at>start_at),
  duration_min INTEGER NOT NULL CHECK(duration_min>0),
  reason_category TEXT NOT NULL CHECK(reason_category IN ('equipment','material','quality','planned')),
  reason_code TEXT NOT NULL CHECK(reason_code IN ('breakdown','minor_stop','material_shortage','quality_issue','maintenance')),
  is_planned INTEGER NOT NULL CHECK(is_planned IN (0,1)),
  memo TEXT NOT NULL, entered_by TEXT NOT NULL REFERENCES workers(worker_id)
) STRICT;
CREATE TABLE issues (
  issue_id TEXT PRIMARY KEY, line_id TEXT NOT NULL REFERENCES lines(line_id),
  title TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN ('low','medium','high')),
  description TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','in_progress','closed')),
  related_date TEXT REFERENCES calendar(calendar_date), evidence_refs TEXT NOT NULL CHECK(json_valid(evidence_refs)),
  source TEXT NOT NULL CHECK(source IN ('seed','mcp')),
  draft_id TEXT UNIQUE REFERENCES issue_drafts(draft_id),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, closed_at TEXT,
  CHECK(source<>'mcp' OR draft_id IS NOT NULL)
) STRICT;
CREATE TABLE issue_drafts (
  draft_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, line_id TEXT NOT NULL REFERENCES lines(line_id),
  title TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN ('low','medium','high')),
  description TEXT NOT NULL, evidence_refs TEXT NOT NULL CHECK(json_valid(evidence_refs)),
  status TEXT NOT NULL CHECK(status IN ('pending','confirmed','expired','cancelled')),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT,
  issue_id TEXT REFERENCES issues(issue_id)
) STRICT;
CREATE TABLE audit_log (
  log_id INTEGER PRIMARY KEY, ref_id TEXT NOT NULL UNIQUE, at TEXT NOT NULL, session_id TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('claude','human')), user_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('viewer','operator')), tool_name TEXT NOT NULL,
  params TEXT NOT NULL CHECK(json_valid(params)), resolved_range TEXT CHECK(resolved_range IS NULL OR json_valid(resolved_range)),
  outcome TEXT NOT NULL CHECK(outcome IN ('ok','status','denied','error')),
  result_summary TEXT NOT NULL CHECK(json_valid(result_summary)), data_as_of TEXT NOT NULL,
  draft_id TEXT REFERENCES issue_drafts(draft_id), issue_id TEXT REFERENCES issues(issue_id),
  human_changes TEXT CHECK(human_changes IS NULL OR json_valid(human_changes)),
  duration_ms INTEGER NOT NULL CHECK(duration_ms>=0)
) STRICT;
CREATE INDEX idx_plan_date_line ON hourly_plan(production_date,line_id);
CREATE INDEX idx_defects_line_time ON defect_events(line_id,detected_at);
CREATE INDEX idx_downtime_line_time ON downtime_events(line_id,start_at,end_at);
CREATE INDEX idx_issues_duplicate ON issues(line_id,related_date,created_at);
