import type Database from 'better-sqlite3';
import type { GeneratorConfig } from '../generator/config.js';
import { LINE_IDS, REASONS } from '../shared/codes.js';
import type { DatasetTables, DowntimeEvent } from '../shared/types.js';
import {
  addDays, addMinutes, datesBetween, fromMinute, hourOf, inShiftChange, isWorkingDay,
  mondayOf, overlapMinutes, productionDateOf, shiftOf, slotFor, slotKey, toMinute, weekday,
} from '../shared/time.js';
import { RuleCheck, type RuleResult, type ValidationReport } from './types.js';

export const TABLES = ['dataset_meta','lines','workers','calendar','hourly_plan','hourly_output',
  'defect_events','downtime_events','issues','issue_drafts','audit_log'] as const;

export function validate(db: Database.Database, config: GeneratorConfig): ValidationReport {
  const tables = Object.fromEntries(TABLES.map(table => [table,db.prepare('SELECT * FROM "'+table+'"').all()])) as unknown as DatasetTables;
  const t = tables, e = config.events;
  const working = datesBetween(config.periodStart,config.periodEnd).filter(isWorkingDay);
  const days = new Map(t.calendar.map(d => [d.calendar_date,d]));
  const plans = new Map(t.hourly_plan.map(p => [slotKey(p.line_id,p.slot_start),p]));
  const outputs = new Map(t.hourly_output.map(o => [slotKey(o.line_id,o.slot_start),o]));
  const lines = new Map(t.lines.map(l => [l.line_id,l]));
  const workers = new Map(t.workers.map(w => [w.worker_id,w]));
  const defects = new Map<string,number>();
  for (const d of t.defect_events) {
    const key = slotKey(d.line_id,d.detected_at.slice(0,13)+':00');
    defects.set(key,(defects.get(key) ?? 0)+1);
  }
  const stopsByDay = new Map<string,DowntimeEvent[]>();
  for (const stop of t.downtime_events) {
    const key = stop.line_id+'|'+stop.production_date;
    const rows = stopsByDay.get(key) ?? []; rows.push(stop); stopsByDay.set(key,rows);
  }
  const stopMinutes = (lineId: string, date: string, slot: string) =>
    (stopsByDay.get(lineId+'|'+date) ?? []).filter(s => !s.is_planned).reduce((n,s) =>
      n+overlapMinutes(s.start_at,s.end_at,slot,addMinutes(slot,60)),0);
  const rules: RuleResult[] = [];
  function rule(id: string,name: string,check: (r: RuleCheck) => void): void {
    const r = new RuleCheck(id,name);
    try { check(r); } catch (error) { r.expect(false,error instanceof Error ? error.message : String(error)); }
    rules.push(r.result());
  }

  rule('V01','교대 시간과 시간대 구성',r => {
    r.expect(t.hourly_plan.length === working.length*config.lines.length*24,'Incorrect planned slot count');
    for (const date of working) for (const line of config.lines) for (let hour=0;hour<24;hour++) {
      r.expect(plans.has(slotKey(line.id,slotFor(date,hour))),line.id+' missing slot '+slotFor(date,hour));
    }
    for (const p of t.hourly_plan) {
      const label = slotKey(p.line_id,p.slot_start);
      r.expect(p.slot_start.endsWith(':00') && p.hour_of_day===hourOf(p.slot_start),label+' not an hourly slot');
      if ([8,20].includes(p.hour_of_day)) {
        r.expect(p.planned_minutes<=40 && p.planned_stop_minutes>=20,label+' includes changeover minutes');
        const output = outputs.get(label);
        if (output) r.expect(output.produced_qty*60<=40*(lines.get(p.line_id)?.std_rate_per_hour ?? 0),label+' exceeds 40-minute capacity');
      }
    }
  });
  rule('V02','교대 시간대 목표 조정',r => {
    for (const p of t.hourly_plan.filter(p => [8,20].includes(p.hour_of_day))) {
      const maintenance = p.line_id==='L5' && p.production_date===e.E5.date;
      r.expect(p.planned_minutes===(maintenance ? 0 : 40) && p.planned_stop_reason===(maintenance ? 'maintenance' : 'shift_change'),
        slotKey(p.line_id,p.slot_start));
    }
  });
  rule('V03','기준정보와 목표 정의',r => {
    r.expect(t.lines.length===6,'Expected six lines');
    for (const line of config.lines) {
      const stored=lines.get(line.id);
      r.expect(stored?.std_rate_per_hour===line.stdRatePerHour && stored.product_name===line.product,'Line mismatch: '+line.id);
    }
    for (const p of t.hourly_plan) r.expect(
      p.planned_minutes+p.planned_stop_minutes===60 && p.target_qty*60===p.planned_minutes*(lines.get(p.line_id)?.std_rate_per_hour ?? -1),
      slotKey(p.line_id,p.slot_start));
  });
  rule('V04','비가동과 생산 가능 수량',r => {
    for (const o of t.hourly_output) {
      const key=slotKey(o.line_id,o.slot_start),p=plans.get(key);
      if (!p) { r.expect(false,'Output without plan: '+key); continue; }
      const available=p.planned_minutes-stopMinutes(p.line_id,p.production_date,p.slot_start);
      r.expect(available>=0 && o.produced_qty>=0 && o.produced_qty*60<=available*(lines.get(o.line_id)?.std_rate_per_hour ?? -1),key);
      if (available===0) r.expect(o.produced_qty===0 && o.good_qty===0,'Production during full stop: '+key);
    }
  });
  rule('V05','양품 수량 범위',r => {
    for (const o of t.hourly_output) r.expect(Number.isInteger(o.good_qty) && o.good_qty>=0 && o.good_qty<=o.produced_qty,slotKey(o.line_id,o.slot_start));
  });
  rule('V06','불량 기록 수 일치',r => {
    for (const o of t.hourly_output) r.expect((defects.get(slotKey(o.line_id,o.slot_start)) ?? 0)===o.produced_qty-o.good_qty,slotKey(o.line_id,o.slot_start));
  });
  rule('V07','불량 위치',r => {
    for (const d of t.defect_events) {
      const key=slotKey(d.line_id,d.detected_at.slice(0,13)+':00');
      r.expect(outputs.has(key) && !inShiftChange(d.detected_at),d.defect_id+' is in a missing slot/changeover');
      const p=plans.get(key);
      r.expect(Boolean(p && p.planned_minutes>0),d.defect_id+' has no operating plan');
    }
  });
  rule('V08','손실 분해 등식',r => {
    for (const o of t.hourly_output) {
      const key=slotKey(o.line_id,o.slot_start),p=plans.get(key);
      if (!p) { r.expect(false,key+' has no plan'); continue; }
      const rate=lines.get(p.line_id)?.std_rate_per_hour ?? 0;
      const target60=p.planned_minutes*rate;
      const downtime60=stopMinutes(p.line_id,p.production_date,p.slot_start)*rate;
      const speed60=target60-downtime60-o.produced_qty*60;
      // Count the separate defect table, rather than substituting produced - good.
      const defect60=(defects.get(key) ?? 0)*60;
      r.expect(speed60>=0 && downtime60>=0 && defect60>=0 &&
        downtime60+speed60+defect60===target60-o.good_qty*60,key);
    }
  });
  rule('V09','계획 정지',r => {
    const rows=t.hourly_plan.filter(p => p.line_id==='L5' && p.production_date===e.E5.date);
    r.expect(rows.length===24,'E5 must have 24 planned slots');
    for (const p of rows) {
      const o=outputs.get(slotKey(p.line_id,p.slot_start));
      r.expect(p.target_qty===0 && p.planned_minutes===0 && p.planned_stop_minutes===60 &&
        p.planned_stop_reason==='maintenance' && o?.produced_qty===0 && o.good_qty===0,p.slot_start);
    }
    const stops=t.downtime_events.filter(s => s.line_id==='L5' && s.production_date===e.E5.date);
    r.expect(stops.length===2 && stops.every(s => s.is_planned===1 && s.reason_code==='maintenance') &&
      stops.reduce((n,s) => n+s.duration_min,0)===1400,'E5 must contain two planned shifts totaling 1,400 minutes');
  });
  rule('V10','비가동 사유 코드',r => {
    for (const s of t.downtime_events) r.expect(REASONS[s.reason_code]===s.reason_category &&
      s.is_planned===Number(s.reason_category==='planned'),s.downtime_id);
  });
  rule('V11','비가동 배치와 겹침',r => {
    for (const s of t.downtime_events) {
      const start=toMinute(s.start_at),end=toMinute(s.end_at);
      r.expect(end>start && s.duration_min===end-start,s.downtime_id+' duration');
      r.expect(end-start<=1440,s.downtime_id+' exceeds a production day');
      r.expect(productionDateOf(s.start_at)===productionDateOf(fromMinute(end-1)),s.downtime_id+' crosses 08:00');
      for (let m=start;m<Math.min(end,start+1440);m++) r.expect(!inShiftChange(fromMinute(m)),s.downtime_id+' overlaps changeover');
    }
    for (const line of LINE_IDS) {
      const sorted=t.downtime_events.filter(s => s.line_id===line).sort((a,b) => a.start_at.localeCompare(b.start_at));
      for (let i=1;i<sorted.length;i++) r.expect(sorted[i-1]!.end_at<=sorted[i]!.start_at,'Overlapping stops: '+sorted[i]!.downtime_id);
    }
  });
  rule('V12','휴무일과 캘린더',r => {
    const expected=datesBetween(config.periodStart,config.periodEnd);
    r.expect(t.calendar.length===expected.length,'Calendar date count');
    for (const date of expected) {
      const day=days.get(date);
      r.expect(Boolean(day && day.is_working_day===Number(isWorkingDay(date))),date+' calendar');
    }
    for (const row of [...t.hourly_plan,...t.downtime_events,...t.defect_events]) {
      r.expect(days.get(row.production_date)?.is_working_day===1,'Non-working production date: '+row.production_date);
    }
  });
  rule('V13','교대조와 작업자 소속',r => {
    const epoch=toMinute(mondayOf(config.periodStart));
    for (const day of t.calendar.filter(d => d.is_working_day)) {
      const even=(toMinute(mondayOf(day.calendar_date))-epoch)/(7*1440)%2===0;
      r.expect(day.day_crew===(even?'A':'B') && day.night_crew===(even?'B':'A') && day.week_start===mondayOf(day.calendar_date),
        day.calendar_date+' rotation');
    }
    r.expect(t.workers.length===24,'Expected 24 workers');
    for (const row of [...t.hourly_plan,...t.defect_events,...t.downtime_events]) {
      const day=days.get(row.production_date);
      r.expect(row.crew===(row.shift==='day'?day?.day_crew:day?.night_crew),row.line_id+' '+row.production_date+' crew');
    }
    for (const d of t.defect_events) r.expect(workers.get(d.worker_id)?.crew===d.crew && workers.get(d.worker_id)?.line_id===d.line_id,d.defect_id+' worker');
    for (const s of t.downtime_events) r.expect(workers.get(s.entered_by)?.crew===s.crew && workers.get(s.entered_by)?.line_id===s.line_id,s.downtime_id+' worker');
  });
  rule('V14','생산일과 교대 경계',r => {
    for (const p of t.hourly_plan) r.expect(p.production_date===productionDateOf(p.slot_start) && p.shift===shiftOf(p.slot_start),slotKey(p.line_id,p.slot_start));
    for (const d of t.defect_events) r.expect(d.production_date===productionDateOf(d.detected_at) && d.shift===shiftOf(d.detected_at),d.defect_id);
    for (const s of t.downtime_events) r.expect(s.production_date===productionDateOf(s.start_at) && s.shift===shiftOf(s.start_at) &&
      s.shift===shiftOf(fromMinute(toMinute(s.end_at)-1)),s.downtime_id);
  });
  rule('V15','정답 사건 E1~E9 존재',r => {
    const hasStop=(line:string,start:string,end:string,reason:string) => t.downtime_events.some(s =>
      s.line_id===line && s.start_at===start && s.end_at===end && s.reason_code===reason);
    r.expect(hasStop('L2',e.E1.date+'T'+e.E1.start,e.E1.date+'T'+e.E1.end,'breakdown'),'E1 missing');
    for (const date of datesBetween(e.E2.from,e.E2.to).filter(isWorkingDay))
      for (const s of e.E2.stops) r.expect(hasStop('L3',date+'T'+s.start,date+'T'+s.end,'material_shortage'),'E2 missing '+date);
    for (const hour of e.E3.hours) {
      const slot=slotFor(e.E3.date,hour),o=outputs.get(slotKey('L1',slot));
      r.expect(Boolean(o && o.produced_qty>0 && Math.abs((o.produced_qty-o.good_qty)-Math.round(o.produced_qty*e.E3.defectRate))===0),'E3 missing '+slot);
    }
    for (const date of datesBetween(e.E4.from,e.E4.to).filter(isWorkingDay)) {
      for (const s of e.E4.stops) r.expect(hasStop('L4',date+'T'+s.start,date+'T'+s.end,'minor_stop'),'E4 missing '+date);
      const o=outputs.get(slotKey('L4',slotFor(date,9)));
      r.expect(Boolean(o && o.produced_qty>0 && (o.produced_qty-o.good_qty)===Math.round(o.produced_qty*e.E4.defectRate)),'E4 defects '+date);
    }
    r.expect(hasStop('L5',e.E5.date+'T08:20',e.E5.date+'T20:00','maintenance') &&
      hasStop('L5',e.E5.date+'T20:20',addDays(e.E5.date,1)+'T08:00','maintenance'),'E5 missing');
    const expectedMissing=new Set(e.E6.hours.map(h => slotKey('L1',slotFor(e.E6.date,h))));
    for (const p of t.hourly_plan) {
      const key=slotKey(p.line_id,p.slot_start);
      r.expect(outputs.has(key)!==expectedMissing.has(key),'Unexpected missing/present output: '+key);
    }
    r.expect(hasStop('L5',e.E7.start,e.E7.end,'breakdown') && weekday(e.E7.date)===5,'E7 missing');
    r.expect(t.downtime_events.filter(s => s.line_id==='L5' && s.production_date===e.E8.date && s.memo===e.E8.memo).length===1,'E8 missing/duplicated');
    r.expect(t.hourly_plan.some(p => p.hour_of_day===8 && p.planned_minutes===40) &&
      t.hourly_plan.some(p => p.hour_of_day===20 && p.planned_minutes===40),'E9 missing');
  });
  rule('V16','6라인 정상 기준',r => {
    const spec=config.lines.find(l => l.id==='L6')!;
    for (const date of working) {
      const stops=t.downtime_events.filter(s => s.line_id==='L6' && s.production_date===date);
      r.expect(stops.length===1 && stops.every(s => !s.is_planned && s.reason_code==='minor_stop' &&
        s.duration_min>=config.normal.minorStopMinutes[0] && s.duration_min<=config.normal.minorStopMinutes[1]),'L6 stops '+date);
    }
    for (const p of t.hourly_plan.filter(p => p.line_id==='L6')) {
      const o=outputs.get(slotKey('L6',p.slot_start));
      const capacity=(p.planned_minutes-stopMinutes('L6',p.production_date,p.slot_start))*spec.stdRatePerHour/60;
      r.expect(Boolean(o && o.produced_qty>=Math.floor(capacity*config.normal.performance[0]) &&
        o.produced_qty<=Math.floor(capacity*config.normal.performance[1])),'L6 output '+p.slot_start);
      if (o) {
        const bad=o.produced_qty-o.good_qty;
        r.expect(bad>=Math.round(o.produced_qty*spec.baseDefectRate*config.normal.defectRateMultiplier[0]) &&
          bad<=Math.round(o.produced_qty*spec.baseDefectRate*config.normal.defectRateMultiplier[1]),'L6 defects '+p.slot_start);
      }
    }
  });
  rule('V17','과거 이슈와 E4 분리',r => {
    const seed=t.issues.filter(i => i.source==='seed');
    r.expect(seed.length===25,'Expected 25 seed issues');
    for (const issue of seed) r.expect(!(issue.line_id==='L4' && issue.related_date &&
      issue.related_date>=e.E4.from && issue.related_date<=e.E4.to),'E4 already in seed issues');
    for (const expected of config.seedIssues) r.expect(seed.some(i => i.line_id===expected.lineId &&
      i.related_date===expected.date && i.title===expected.title && i.description===expected.description),'Seed issue missing: '+expected.title);
  });

  const integrityErrors: string[] = [];
  const foreignKeys=db.pragma('foreign_key_check') as object[];
  if (foreignKeys.length) integrityErrors.push('Foreign key violations: '+foreignKeys.length);
  const integrity=db.pragma('quick_check') as {quick_check:string}[];
  if (integrity.some(row => row.quick_check!=='ok')) integrityErrors.push(...integrity.map(r => r.quick_check));
  const meta=t.dataset_meta[0];
  if (t.dataset_meta.length!==1 || !meta?.dataset_version || !Number.isFinite(Date.parse(meta.generated_at))) integrityErrors.push('Invalid dataset identity');
  if (meta?.seed!==config.seed || meta.period_start!==config.periodStart || meta.period_end!==config.periodEnd ||
      meta.reference_now!==config.referenceNow) integrityErrors.push('Metadata does not match generation config');
  return {datasetVersion:meta?.dataset_version ?? '',passed:!integrityErrors.length && rules.every(r => r.passed),
    integrityErrors,rowCounts:Object.fromEntries(TABLES.map(table => [table,t[table].length])),rules};
}
