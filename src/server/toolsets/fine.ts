import { z } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';
import { draftSchema } from '../../core/issues.js';
import { productionSchema, querySchema } from '../../core/query.js';
import { defectsSchema, downtimeSchema, hourlySchema } from '../schemas.js';
import { register, type Core, type UiState } from '../tools/register.js';

export function registerFine(server: McpServer, core: Core, ui: UiState): RegisteredTool {
  const t = core.tools;
  register(server, 'get_line_info', z.strictObject({}), input => t.getLineInfo(input));
  register(server, 'get_production', productionSchema, input => t.getProduction(input), { production: true });
  register(server, 'get_target_vs_actual', querySchema, input => t.getAchievement(input), { production: true });
  register(server, 'compare_lines', querySchema, input => t.compareLines(input), { production: true });
  register(server, 'get_defects', defectsSchema, input => t.getDefects(input));
  register(server, 'get_downtime', downtimeSchema, input => t.getDowntime(input));
  register(server, 'analyze_shortfall', querySchema, input => t.breakdownLoss(input));
  register(server, 'analyze_hourly_pattern', hourlySchema, input => t.hourlyPattern(input));
  register(server, 'detect_anomalies', querySchema, input => t.detectAnomalies(input));
  return register(server, 'preview_issue', draftSchema, input => t.createDraft(input), { ui });
}
