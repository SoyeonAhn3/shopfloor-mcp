import type { Range } from './period.js';
export interface Evidence {
  evidenceId: string | null;
  dataAsOf: string;
  datasetVersion: string;
  resolvedRange?: Range & { label?: string };
}
