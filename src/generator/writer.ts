import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import type { DatasetTables } from '../shared/types.js';

export function writeDataset(db: Database.Database, tables: DatasetTables): void {
  db.pragma('foreign_keys = ON');
  db.transaction(() => {
    db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
    // Both table names and columns come only from our typed generator, never from user SQL.
    for (const [table,rows] of Object.entries(tables)) {
      if (!rows.length) continue;
      const columns = Object.keys(rows[0] as object);
      const query = db.prepare('INSERT INTO "'+table+'" ('+columns.map(c => '"'+c+'"').join(',')+
        ') VALUES ('+columns.map(c => '@'+c).join(',')+')');
      for (const row of rows) query.run(row);
    }
  })();
}
