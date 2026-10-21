import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildDataset } from '../../src/generator/build.js';
import { loadConfig } from '../../src/generator/config.js';
import { writeDataset } from '../../src/generator/writer.js';
import { validate } from '../../src/validator/rules.js';

const config=loadConfig('config/generator.config.json');
let db:Database.Database;
beforeAll(() => {
  db=new Database(':memory:'); writeDataset(db,buildDataset(config).tables);
  // Simulate corrupted imports bypassing constraints to exercise the validator itself.
  db.pragma('foreign_keys=OFF'); db.pragma('ignore_check_constraints=ON');
});
afterAll(() => db?.close());
beforeEach(() => db.exec('SAVEPOINT mutation'));
afterEach(() => db.exec('ROLLBACK TO mutation; RELEASE mutation'));
const cases:[string,string][]=[
  ['V01',"DELETE FROM hourly_plan WHERE line_id='L1' AND slot_start='2026-07-01T10:00'"],
  ['V02',"UPDATE hourly_plan SET planned_minutes=60,planned_stop_minutes=0,planned_stop_reason=NULL WHERE line_id='L1' AND slot_start='2026-07-01T08:00'"],
  ['V03',"UPDATE hourly_plan SET target_qty=target_qty+1 WHERE line_id='L2' AND slot_start='2026-07-01T10:00'"],
  ['V04',"UPDATE hourly_output SET produced_qty=100000 WHERE line_id='L2' AND slot_start='2026-07-15T11:00'"],
  ['V05',"UPDATE hourly_output SET good_qty=produced_qty+1 WHERE line_id='L1' AND slot_start='2026-07-01T10:00'"],
  ['V06',"DELETE FROM defect_events WHERE defect_id=(SELECT MIN(defect_id) FROM defect_events)"],
  ['V07',"UPDATE defect_events SET detected_at='2026-07-01T08:05' WHERE defect_id=(SELECT MIN(defect_id) FROM defect_events)"],
  ['V08',"UPDATE hourly_output SET good_qty=good_qty-1 WHERE line_id='L1' AND slot_start='2026-07-01T10:00'"],
  ['V09',"UPDATE hourly_plan SET target_qty=1 WHERE line_id='L5' AND production_date='2026-07-29'"],
  ['V10',"UPDATE downtime_events SET is_planned=0 WHERE reason_code='maintenance'"],
  ['V11',"UPDATE downtime_events SET end_at='2026-08-15T08:30' WHERE line_id='L5' AND start_at='2026-08-14T23:30'"],
  ['V12',"UPDATE hourly_plan SET production_date='2026-07-04' WHERE line_id='L1' AND slot_start='2026-07-01T10:00'"],
  ['V13',"UPDATE hourly_plan SET crew='B' WHERE line_id='L1' AND slot_start='2026-07-01T10:00'"],
  ['V14',"UPDATE downtime_events SET production_date='2026-08-15' WHERE line_id='L5' AND start_at='2026-08-14T23:30'"],
  ['V15',"UPDATE downtime_events SET memo='clean' WHERE line_id='L5' AND production_date='2026-09-16'"],
  ['V16',"UPDATE hourly_output SET produced_qty=1,good_qty=1 WHERE line_id='L6' AND slot_start='2026-07-01T10:00'"],
  ['V17',"UPDATE issues SET line_id='L4',related_date='2026-09-10' WHERE issue_id='ISS-001'"],
];
describe('validation of persisted rows',() => {
  it('passes all 17 rules on the complete dataset',() => {
    const report=validate(db,config);
    expect(report.passed).toBe(true); expect(report.rules).toHaveLength(17);
    expect(report.rules.every(r => r.checked>0)).toBe(true);
  });
  it.each(cases)('%s detects the relevant corruption', (id,sql) => {
    db.exec(sql);
    const report=validate(db,config),rule=report.rules.find(r => r.id===id)!;
    expect(report.passed).toBe(false); expect(rule.passed).toBe(false);
    expect(rule.failureCount).toBeGreaterThan(0);
    expect(rule.examples.length).toBeLessThanOrEqual(5);
  });
});
