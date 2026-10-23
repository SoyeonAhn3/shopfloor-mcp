import type { LineId } from '../shared/codes.js';

// Normal-data rules in generator.config.json, not fitted to E1-E9 or evaluation answers.
export const NORMAL_RULES = {
  minimumPerformance: 0.96, maximumMinorStopMinutes: 5, maximumDefectMultiplier: 1.15,
  baseDefectRates: { L1: 0.018, L2: 0.020, L3: 0.022, L4: 0.017, L5: 0.015, L6: 0.019 },
} as const;
export const CRITERIA_VERSION = 'normal-rules-v1';
export function anomalyCriteria(lineId: LineId) {
  const normalDefect = NORMAL_RULES.baseDefectRates[lineId] * NORMAL_RULES.maximumDefectMultiplier;
  return {
    lowAchievement: NORMAL_RULES.minimumPerformance - 0.10,
    severeLowAchievement: NORMAL_RULES.minimumPerformance - 0.30,
    highDefectRate: normalDefect * 2, severeDefectRate: normalDefect * 4,
    longDowntimeMinutes: NORMAL_RULES.maximumMinorStopMinutes * 2,
    severeDowntimeMinutes: NORMAL_RULES.maximumMinorStopMinutes * 6,
  };
}
export function criteriaMarkdown(): string {
  return '# 이상 판단 기준 / Anomaly criteria\n\n'
    + `Version: ${CRITERIA_VERSION}\n\n`
    + '시간대별 관측 구간에 적용합니다. 미입력·계획 정지는 이상 점수에서 제외하며, 원인을 확정하는 기준이 아닙니다.\n'
    + 'Applied per observed hourly slot. Missing data and planned stops are excluded; flags are not causal diagnoses.\n\n'
    + '| Line | Achievement below | Severe below | Defect rate above | Severe above | Downtime above (min) | Severe above (min) |\n'
    + '|---|---|---|---|---|---|---|\n'
    + (Object.keys(NORMAL_RULES.baseDefectRates) as LineId[]).map(id => {
      const c = anomalyCriteria(id);
      return `| ${id} | ${c.lowAchievement.toFixed(2)} | ${c.severeLowAchievement.toFixed(2)} | ${c.highDefectRate.toFixed(5)} | ${c.severeDefectRate.toFixed(5)} | ${c.longDowntimeMinutes} | ${c.severeDowntimeMinutes} |`;
    }).join('\n') + '\n\n'
    + '정상 설정: 최소 성능 0.96, 정상 순간 정지 최대 5분, 라인별 기준 불량률 × 최대 배수 1.15. '
    + '여유 기준: 달성률 −0.10/−0.30, 불량률 ×2/×4, 정지 시간 ×2/×6. 비율은 0~1 단위이며 경계값과 같으면 상위 등급으로 올리지 않습니다.\n'
    + 'Derived from normal rules with fixed margins: achievement −0.10/−0.30, defect rate ×2/×4, downtime ×2/×6. Ratios use 0–1 units; comparisons are strict.\n';
}
