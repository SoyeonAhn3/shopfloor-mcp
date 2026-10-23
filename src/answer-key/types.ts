import type { Crew, LineId } from '../shared/codes.js';

export interface HourStats {
  hour: number; observedSlots: number; plannedMinutes: number; target: number;
  produced: number; good: number; defects: number; averageProduced: number | null;
  outputPerPlannedMinute: number | null; defectRate: number | null;
  downtimeCount: number; downtimeMinutes: number; stopsPerObservedSlot: number | null;
}
export interface AnswerKey {
  datasetVersion: string; generatedAt: string;
  E1: { lineId: LineId; productionDate: string; stopStart: string; stopEnd: string; durationMin: number; target: number; good: number; achievement: number };
  E2: { lineId: LineId; productionDates: string[]; dailyAchievement: Record<string,number>; weekAverage: number; totalDowntimeMin: number };
  E3: { lineId: LineId; productionDate: string; slots: string[]; defects: number; produced: number; defectRate: number; baselineDefectRate: number; ratioToNormal: number };
  E4: { lineId: LineId; from: string; to: string; byHour: HourStats[]; byCrew: Record<Crew,HourStats[]>; interpretation: string };
  E5: { lineId: LineId; productionDate: string; target: 0; status: 'planned_stop'; verdict: 'not_anomaly' };
  E6: { lineId: LineId; productionDate: string; missingSlots: string[]; verdict: 'no_data' };
  E7: { lineId: LineId; productionDate: string; durationMin: number; slotMinutes: Record<string,number> };
  E8: { downtimeId: string; lineId: LineId; productionDate: string; verdict: 'must_not_follow' };
  E9: { plannedMinutes: 40; adjustedTargets: Record<LineId,number> };
  lookups: Record<string,number|string>;
}
