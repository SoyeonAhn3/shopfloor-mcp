import Database from 'better-sqlite3';
import type { AuditRow, DatasetMeta, Issue, IssueDraft } from '../shared/types.js';

type Bind = string | number | null;
export interface ReadDb {
  all<T>(sql: string, params?: Bind[]): T[];
  get<T>(sql: string, params?: Bind[]): T | undefined;
  metadata(): DatasetMeta;
  close(): void;
}
export function openReadOnly(path: string): ReadDb {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma('foreign_keys = ON');
  return {
    all: <T>(sql: string, params: Bind[] = []) => db.prepare(sql).all(...params) as T[],
    get: <T>(sql: string, params: Bind[] = []) => db.prepare(sql).get(...params) as T | undefined,
    metadata: () => {
      const rows = db.prepare('SELECT * FROM dataset_meta').all() as DatasetMeta[];
      if (rows.length !== 1) throw new Error('Expected one dataset metadata row');
      return rows[0]!;
    },
    close: () => db.close(),
  };
}

export interface StoredDraft extends IssueDraft { related_date: string }
export type AuditInput = Omit<AuditRow, 'log_id' | 'ref_id'>;

// Host-only capability. Never pass this object, a database path or raw SQL to a model.
// Open only a runtime/test COPY: the small migration changes the runtime draft table.
export class RuntimeWriter {
  #db: Database.Database;
  constructor(path: string) {
    this.#db = new Database(path, { fileMustExist: true, timeout: 5000 });
    this.#db.pragma('foreign_keys = ON');
    try {
      this.transaction(() => {
        const columns = this.#db.prepare('PRAGMA table_info(issue_drafts)').all() as { name: string }[];
        if (!columns.some(column => column.name === 'related_date')) {
          this.#db.exec('ALTER TABLE issue_drafts ADD COLUMN related_date TEXT REFERENCES calendar(calendar_date)');
        }
      });
    } catch (error) { this.#db.close(); throw error; }
  }
  transaction<T>(fn: () => T): T { return this.#db.transaction(fn).immediate(); }
  close(): void { this.#db.close(); }
  getDraft(id: string): StoredDraft | undefined {
    return this.#db.prepare('SELECT * FROM issue_drafts WHERE draft_id = ?').get(id) as StoredDraft | undefined;
  }
  getAudit(id: string): AuditRow | undefined {
    return this.#db.prepare('SELECT * FROM audit_log WHERE ref_id = ?').get(id) as AuditRow | undefined;
  }
  isProductionDate(date: string): boolean {
    return !!this.#db.prepare('SELECT 1 FROM calendar WHERE calendar_date = ? AND is_working_day = 1').get(date);
  }
  duplicateCandidates(line: string, date: string, since: string, now: string): Pick<Issue, 'issue_id' | 'title'>[] {
    return this.#db.prepare(`SELECT issue_id, title FROM issues
      WHERE line_id = ? AND related_date = ? AND julianday(created_at) BETWEEN julianday(?) AND julianday(?)`)
      .all(line, date, since, now) as Pick<Issue, 'issue_id' | 'title'>[];
  }
  insertDraft(row: StoredDraft): void {
    this.#db.prepare(`INSERT INTO issue_drafts
      (draft_id,session_id,line_id,title,severity,description,evidence_refs,status,created_at,expires_at,used_at,issue_id,related_date)
      VALUES (@draft_id,@session_id,@line_id,@title,@severity,@description,@evidence_refs,@status,@created_at,@expires_at,@used_at,@issue_id,@related_date)`).run(row);
  }
  updateDraft(id: string, status: IssueDraft['status'], usedAt: string | null, issueId: string | null): void {
    this.#db.prepare('UPDATE issue_drafts SET status = ?, used_at = ?, issue_id = ? WHERE draft_id = ?')
      .run(status, usedAt, issueId, id);
  }
  insertIssue(row: Issue): void {
    this.#db.prepare(`INSERT INTO issues
      (issue_id,line_id,title,severity,description,status,related_date,evidence_refs,source,draft_id,created_by,created_at,closed_at)
      VALUES (@issue_id,@line_id,@title,@severity,@description,@status,@related_date,@evidence_refs,@source,@draft_id,@created_by,@created_at,@closed_at)`).run(row);
  }
  insertAudit(row: AuditInput): string {
    return this.transaction(() => {
      const { id } = this.#db.prepare('SELECT COALESCE(MAX(log_id), 0) + 1 AS id FROM audit_log').get() as { id: number };
      const ref = 'Q-' + String(id).padStart(4, '0');
      this.#db.prepare(`INSERT INTO audit_log
        (log_id,ref_id,at,session_id,actor,user_name,role,tool_name,params,resolved_range,outcome,result_summary,data_as_of,draft_id,issue_id,human_changes,duration_ms)
        VALUES (@log_id,@ref_id,@at,@session_id,@actor,@user_name,@role,@tool_name,@params,@resolved_range,@outcome,@result_summary,@data_as_of,@draft_id,@issue_id,@human_changes,@duration_ms)`)
        .run({ ...row, log_id: id, ref_id: ref });
      return ref;
    });
  }
}
