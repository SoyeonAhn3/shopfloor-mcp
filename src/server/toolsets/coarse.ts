import { z } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';
import { draftSchema } from '../../core/issues.js';
import { groupedQuerySchema, groupedAnalysisSchema } from '../schemas.js';
import { register, type Core, type UiState } from '../tools/register.js';

export function registerCoarse(server: McpServer, core: Core, ui: UiState): RegisteredTool {
  const t = core.tools;
  register(server, 'get_line_info', z.strictObject({}), input => t.getLineInfo(input));
  register(server, 'query_production', groupedQuerySchema, ({ mode, ...args }) => {
    switch (mode) {
      case 'production': return t.getProduction(args);
      case 'defects': return t.getDefects(args);
      case 'downtime': return t.getDowntime(args);
    }
  }, { grouped: true });
  register(server, 'analyze_production', groupedAnalysisSchema, ({ mode, ...args }) => {
    switch (mode) {
      case 'shortfall': return t.breakdownLoss(args);
      case 'hourly_pattern': return t.hourlyPattern(args);
      case 'anomalies': return t.detectAnomalies(args);
    }
  }, { grouped: true });
  return register(server, 'preview_issue', draftSchema, input => t.createDraft(input), { ui });
}
