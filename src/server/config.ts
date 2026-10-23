import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { z } from 'zod';
import { roleSchema } from '../core/guards.js';

export const launchSchema = z.strictObject({
  dbPath: z.string().min(1), userName: z.string().trim().min(1).max(200),
  role: roleSchema, toolset: z.enum(['coarse', 'fine']),
});
export type LaunchConfig = z.infer<typeof launchSchema>;
export const USAGE = 'node dist/server/index.js --db <runtime.db> [--role viewer|operator] [--user local] [--toolset coarse|fine]';
export function parseLaunchConfig(args: string[]): LaunchConfig {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    db: { type: 'string' }, role: { type: 'string', default: 'viewer' },
    user: { type: 'string', default: 'local' }, toolset: { type: 'string', default: 'coarse' },
  } });
  const config = launchSchema.parse({ dbPath: values.db, role: values.role, userName: values.user, toolset: values.toolset });
  return { ...config, dbPath: resolve(config.dbPath) };
}
