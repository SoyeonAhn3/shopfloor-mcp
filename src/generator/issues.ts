import type { GeneratorConfig } from './config.js';
import type { Issue } from '../shared/types.js';

export function buildIssues(config: GeneratorConfig): Issue[] {
  return config.seedIssues.map((item,index) => ({
    issue_id: 'ISS-' + String(index+1).padStart(3,'0'), line_id: item.lineId,
    title: item.title, severity: item.severity, description: item.description, status: item.status,
    related_date: item.date, evidence_refs: '[]', source: 'seed', draft_id: null,
    created_by: 'seed-import', created_at: item.date+'T14:00', closed_at: item.status === 'closed' ? item.date+'T18:00' : null,
  }));
}
