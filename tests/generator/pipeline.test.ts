import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/generator/config.js';
import { generate } from '../../src/generator/index.js';
import { buildDataset } from '../../src/generator/build.js';
import { writeDataset } from '../../src/generator/writer.js';
import { removeOwnedTemp } from '../../src/shared/files.js';
import type { AnswerKey } from '../../src/answer-key/types.js';

const config=loadConfig('config/generator.config.json');
let directory:string,db:Database.Database,key:AnswerKey;
beforeAll(() => {
  directory=mkdtempSync(join(tmpdir(),'shopfloor-test-'));
  generate(config,join(directory,'production.db'));
  db=new Database(join(directory,'production.db'),{readonly:true});
  key=JSON.parse(readFileSync(join(directory,'answer_key.json'),'utf8')) as AnswerKey;
});
afterAll(() => { db?.close(); if (directory) removeOwnedTemp(directory); });
const count=(table:string) => (db.prepare('SELECT COUNT(*) AS n FROM '+table).get() as {n:number}).n;

describe('persisted generation',() => {
  it('writes 11 tables with the specified dimensions and empty runtime tables',() => {
    expect((db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())).toHaveLength(11);
    expect([count('lines'),count('workers'),count('calendar'),count('hourly_plan'),count('hourly_output'),count('issues')]).toEqual([6,24,92,9504,9500,25]);
    expect(count('issue_drafts')).toBe(0); expect(count('audit_log')).toBe(0);
    expect((db.prepare('SELECT SUM(target_qty) AS n FROM hourly_plan').get() as {n:number}).n).toBe(2677500);
    expect(readdirSync(directory).sort()).toEqual(['answer_key.json','generator.config.json','production.db','validation.json']);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.prepare('SELECT * FROM dataset_meta').get()).toMatchObject({dataset_version:key.datasetVersion});
  });
  it('keeps zero production and missing output structurally different',() => {
    expect(db.prepare("SELECT * FROM hourly_output JOIN hourly_plan USING(line_id,slot_start) WHERE line_id='L5' AND production_date=?").all(config.events.E5.date)).toHaveLength(24);
    expect(db.prepare("SELECT * FROM hourly_output JOIN hourly_plan USING(line_id,slot_start) WHERE line_id='L5' AND production_date=? AND produced_qty<>0").all(config.events.E5.date)).toHaveLength(0);
    const missing=db.prepare('SELECT line_id,slot_start FROM hourly_plan LEFT JOIN hourly_output USING(line_id,slot_start) WHERE produced_qty IS NULL').all();
    expect(missing).toEqual([13,14,15,16].map(h => ({line_id:'L1',slot_start:'2026-09-08T'+h+':00'})));
  });
  it('does not store planted-event labels or answer-key tables in the DB',() => {
    const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table'").all() as {name:string;sql:string}[];
    for (const table of tables) expect(table.sql).not.toMatch(/\bevent_id\b|\bscenario_id\b|\bplanted\b|answer_key/i);
  });
  it('preserves an existing generation when another generation targets it',() => {
    const digest=() => createHash('sha256').update(readFileSync(join(directory,'production.db'))).digest('hex');
    const before=digest();
    expect(() => generate(config,join(directory,'production.db'))).toThrow('Existing generation is preserved');
    expect(digest()).toBe(before);
    expect(JSON.parse(readFileSync(join(directory,'answer_key.json'),'utf8')).datasetVersion).toBe(key.datasetVersion);
  });
  it('assigns a new identity to a fresh generation and retains identity in a DB copy',() => {
    // Tests identity only. No repeated-production-content equality test is adopted.
    const next=buildDataset(config);
    expect(next.tables.dataset_meta[0]!.dataset_version).not.toBe(key.datasetVersion);
    const copyPath=join(directory,'copy.db'); copyFileSync(join(directory,'production.db'),copyPath);
    const copy=new Database(copyPath,{readonly:true});
    try { expect(copy.prepare('SELECT dataset_version FROM dataset_meta').get()).toEqual({dataset_version:key.datasetVersion}); }
    finally { copy.close(); }
  });
  it('rolls back schema and data when the bulk insert fails',() => {
    const data=buildDataset(config);
    data.tables.issues.push({...data.tables.issues[0]!});
    const memory=new Database(':memory:');
    try {
      expect(() => writeDataset(memory,data.tables)).toThrow();
      expect(memory.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toHaveLength(0);
    } finally { memory.close(); }
  });
  it('enforces the one-issue-per-draft constraint in SQLite',() => {
    const memory=new Database(':memory:');
    try {
      const data=buildDataset(config); writeDataset(memory,data.tables);
      memory.prepare("INSERT INTO issue_drafts VALUES ('P-test','session','L4','title','low','description','[]','pending','2026-10-21T10:00','2026-10-21T10:10',NULL,NULL)").run();
      const insert=memory.prepare("INSERT INTO issues VALUES (?, 'L4','title','low','description','open',NULL,'[]','mcp','P-test','operator','2026-10-21T10:01',NULL)");
      insert.run('ISS-new-1');
      expect(() => insert.run('ISS-new-2')).toThrow(/UNIQUE/);
    } finally { memory.close(); }
  });
});
