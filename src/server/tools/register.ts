import type { McpServer, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import type { createCore } from '../../core/service.js';
import { descriptions } from '../descriptions.js';
import { formatResult } from '../format.js';

export type Core = ReturnType<typeof createCore>;
export function register<S extends z.ZodType>(
  server: McpServer, name: keyof typeof descriptions, schema: S,
  run: (input: z.output<S>) => object,
  options: { production?: boolean; grouped?: boolean } = {},
): void {
  const inputSchema: StandardSchemaWithJSON<z.input<S>, z.output<S>> = schema;
  server.registerTool(name, {
    description: descriptions[name], inputSchema,
    annotations: { readOnlyHint: name !== 'preview_issue', destructiveHint: false,
      idempotentHint: false, openWorldHint: false },
  }, (input) => {
    const mode = options.grouped ? (input as { mode: string }).mode : undefined;
    return formatResult(run(input), {
      tool: name, ...(mode ? { mode } : {}),
      production: options.production === true || (name === 'query_production' && mode === 'production'),
    });
  });
}
