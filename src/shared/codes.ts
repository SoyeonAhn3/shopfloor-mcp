export const LINE_IDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const;
export type LineId = typeof LINE_IDS[number];
export type Crew = 'A' | 'B';
export type Shift = 'day' | 'night';
export const DEFECT_TYPES = ['dimension', 'appearance', 'function'] as const;
export type DefectType = typeof DEFECT_TYPES[number];
export const REASONS = {
  breakdown: 'equipment', minor_stop: 'equipment',
  material_shortage: 'material', quality_issue: 'quality', maintenance: 'planned',
} as const;
export type ReasonCode = keyof typeof REASONS;
export const LABELS = {
  day: '주간', night: '야간', dimension: '치수 불량', appearance: '외관 불량', function: '기능 불량',
  breakdown: '설비 고장', minor_stop: '순간 정지', material_shortage: '자재 부족',
  quality_issue: '품질 문제', maintenance: '설비 점검', shift_change: '교대 시간',
} as const;
