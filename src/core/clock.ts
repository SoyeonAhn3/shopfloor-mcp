import type { DatasetMeta } from '../shared/types.js';

export interface Clocks { reference(): string; system(): Date }
export function createClocks(meta: DatasetMeta, system: () => Date = () => new Date()): Clocks {
  return { reference: () => meta.reference_now, system };
}
