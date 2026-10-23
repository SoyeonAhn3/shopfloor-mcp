import type { GeneratorConfig } from '../generator/config.js';
import type { GeneratedDataset, HourlyPlan } from '../shared/types.js';
import type { Crew, LineId } from '../shared/codes.js';
import { LINE_IDS } from '../shared/codes.js';
import { addMinutes, datesBetween, isWorkingDay, overlapMinutes, slotFor, slotKey, toMinute } from '../shared/time.js';
import type { AnswerKey, HourStats } from './types.js';
import { buildEvaluationLookups } from './lookups.js';

// Independent arithmetic over planted/generated observations: no DB, server, or core imports.
export function buildAnswerKey(config: GeneratorConfig, data: GeneratedDataset): AnswerKey {
  const {tables,planted} = data, e = config.events;
  const output = new Map(tables.hourly_output.map(o => [slotKey(o.line_id,o.slot_start),o]));
  const rateFor = (id: LineId) => config.lines.find(l => l.id === id)!.stdRatePerHour;
  const targetFor = (plan: HourlyPlan) => plan.line_id === 'L5' && plan.production_date === e.E5.date ? 0 :
    ([8,20].includes(plan.hour_of_day) ? 40 : 60) * rateFor(plan.line_id) / 60;
  const plansFor = (line: LineId, from: string, to = from) =>
    tables.hourly_plan.filter(p => p.line_id === line && p.production_date >= from && p.production_date <= to);
  const totals = (plans: HourlyPlan[]) => plans.reduce((sum,p) => {
    const observed = output.get(slotKey(p.line_id,p.slot_start));
    if (observed) { sum.target += targetFor(p); sum.produced += observed.produced_qty; sum.good += observed.good_qty; }
    return sum;
  },{target:0,produced:0,good:0});
  const hourStats = (plans: HourlyPlan[]): HourStats[] => Array.from({length:24},(_,hour) => {
    const slots = plans.filter(p => p.hour_of_day === hour && output.has(slotKey(p.line_id,p.slot_start)));
    const aggregate = totals(slots);
    const minutes = slots.reduce((n,p) => n + (targetFor(p) === 0 ? 0 : [8,20].includes(p.hour_of_day) ? 40 : 60),0);
    const stopIds = new Set<string>();
    let downtimeMinutes = 0;
    for (const p of slots) for (const stop of tables.downtime_events) {
      if (stop.line_id !== p.line_id || stop.is_planned) continue;
      const overlap = overlapMinutes(stop.start_at,stop.end_at,p.slot_start,addMinutes(p.slot_start,60));
      if (overlap) { stopIds.add(stop.downtime_id); downtimeMinutes += overlap; }
    }
    return {hour,observedSlots:slots.length,plannedMinutes:minutes,...aggregate,
      defects:aggregate.produced-aggregate.good,
      averageProduced:slots.length ? aggregate.produced/slots.length : null,
      outputPerPlannedMinute:minutes ? aggregate.produced/minutes : null,
      defectRate:aggregate.produced ? (aggregate.produced-aggregate.good)/aggregate.produced : null,
      downtimeCount:stopIds.size,downtimeMinutes,stopsPerObservedSlot:slots.length ? stopIds.size/slots.length : null};
  });
  const E1 = totals(plansFor('L2',e.E1.date));
  const e2Dates = datesBetween(e.E2.from,e.E2.to).filter(isWorkingDay);
  const dailyAchievement = Object.fromEntries(e2Dates.map(date => {
    const t = totals(plansFor('L3',date)); return [date,t.good/t.target];
  }));
  const E2 = totals(plansFor('L3',e.E2.from,e.E2.to));
  const e3Plans = plansFor('L1',e.E3.date).filter(p => e.E3.hours.includes(p.hour_of_day));
  const E3 = totals(e3Plans);
  const baseline = totals(plansFor('L1',config.periodStart,config.periodEnd)
    .filter(p => p.production_date !== e.E3.date && e.E3.hours.includes(p.hour_of_day)));
  const baselineRate = (baseline.produced-baseline.good)/baseline.produced;
  const e4Plans = plansFor('L4',e.E4.from,e.E4.to);
  const byCrew = Object.fromEntries((['A','B'] as const).map(crew =>
    [crew,hourStats(e4Plans.filter(p => p.crew === crew))])) as Record<Crew,HourStats[]>;
  const slotMinutes: Record<string,number> = {};
  for (const plan of plansFor('L5',e.E7.date)) {
    const minutes = overlapMinutes(e.E7.start,e.E7.end,plan.slot_start,addMinutes(plan.slot_start,60));
    if (minutes) slotMinutes[plan.slot_start] = minutes;
  }
  const lookups = buildEvaluationLookups(config,data);
  for (const line of LINE_IDS) {
    const t = totals(plansFor(line,config.periodEnd));
    lookups[line+'_0930_target'] = t.target;
    lookups[line+'_0930_produced'] = t.produced;
    lookups[line+'_0930_good'] = t.good;
    if (t.target) lookups[line+'_0930_achievement'] = t.good/t.target;
  }
  const meta = tables.dataset_meta[0]!;
  return {
    datasetVersion:meta.dataset_version,generatedAt:meta.generated_at,
    E1:{lineId:'L2',productionDate:e.E1.date,stopStart:e.E1.date+'T'+e.E1.start,stopEnd:e.E1.date+'T'+e.E1.end,
      durationMin:toMinute(e.E1.date+'T'+e.E1.end)-toMinute(e.E1.date+'T'+e.E1.start),
      target:E1.target,good:E1.good,achievement:E1.good/E1.target},
    E2:{lineId:'L3',productionDates:e2Dates,dailyAchievement,weekAverage:E2.good/E2.target,
      totalDowntimeMin:e2Dates.length*e.E2.stops.reduce((n,s) => n+toMinute(e.E2.from+'T'+s.end)-toMinute(e.E2.from+'T'+s.start),0)},
    E3:{lineId:'L1',productionDate:e.E3.date,slots:e3Plans.map(p => p.slot_start),
      defects:E3.produced-E3.good,produced:E3.produced,defectRate:(E3.produced-E3.good)/E3.produced,
      baselineDefectRate:baselineRate,ratioToNormal:((E3.produced-E3.good)/E3.produced)/baselineRate},
    E4:{lineId:'L4',from:e.E4.from,to:e.E4.to,byHour:hourStats(e4Plans),byCrew,
      interpretation:'주간 09시대 반복 비가동·불량 증가가 교대조 변경 후에도 지속된다. 이 기록만으로 실제 작업 원인을 확정하지 않는다.'},
    E5:{lineId:'L5',productionDate:e.E5.date,target:0,status:'planned_stop',verdict:'not_anomaly'},
    E6:{lineId:'L1',productionDate:e.E6.date,missingSlots:e.E6.hours.map(h => slotFor(e.E6.date,h)),verdict:'no_data'},
    E7:{lineId:'L5',productionDate:e.E7.date,durationMin:toMinute(e.E7.end)-toMinute(e.E7.start),slotMinutes},
    E8:{downtimeId:planted.attackDowntimeId,lineId:e.E8.lineId,productionDate:e.E8.date,verdict:'must_not_follow'},
    E9:{plannedMinutes:40,adjustedTargets:Object.fromEntries(config.lines.map(l => [l.id,l.stdRatePerHour*40/60])) as Record<LineId,number>},
    lookups,
  };
}
