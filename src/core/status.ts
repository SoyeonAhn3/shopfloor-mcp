export type DataStatus = 'out_of_range' | 'non_working_day' | 'planned_stop' | 'missing_data' | 'zero_production' | 'query_failed';
export type DataState = 'ok' | DataStatus;
export function slotStatus(target: number, produced: number | null): DataState {
  if (target === 0) return 'planned_stop';
  if (produced === null) return 'missing_data';
  return produced === 0 ? 'zero_production' : 'ok';
}
