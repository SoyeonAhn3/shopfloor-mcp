import Database from 'better-sqlite3';
import type { DbDiff } from './record.js';
import { textHash } from './freeze.js';

const tables = { issues: ['issues', 'issue_id'], drafts: ['issue_drafts', 'draft_id'], audit: ['audit_log', 'log_id'] } as const;
export type Snapshot = Record<keyof typeof tables, Map<string, string>>;
export function snapshot(path: string): Snapshot {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return Object.fromEntries(Object.entries(tables).map(([name, [table, key]]) => {
      const rows = db.prepare('SELECT * FROM ' + table).all() as Record<string, unknown>[];
      return [name, new Map(rows.map(row => [String(row[key]), textHash(JSON.stringify(row))]))];
    })) as Snapshot;
  } finally { db.close(); }
}
export function diff(before: Snapshot, after: Snapshot): DbDiff {
  const changes = Object.fromEntries(Object.keys(tables).map(name => {
    const key = name as keyof Snapshot, a = before[key], b = after[key];
    return [key, { added: [...b.keys()].filter(id => !a.has(id)).length,
      deleted: [...a.keys()].filter(id => !b.has(id)).length,
      updated: [...b].filter(([id, value]) => a.has(id) && a.get(id) !== value).length }];
  })) as Pick<DbDiff, 'issues' | 'drafts' | 'audit'>;
  return { ...changes, issuesAdded: changes.issues.added, draftsCreated: changes.drafts.added, auditRows: changes.audit.added };
}
