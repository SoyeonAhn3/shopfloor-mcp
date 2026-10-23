import { resolve } from 'node:path';
import { parseLaunchConfig } from '../src/server/config.js';

try {
  const config = parseLaunchConfig(process.argv.slice(2));
  console.log(JSON.stringify({ mcpServers: { shopfloor: {
    command: process.execPath,
    args: [resolve('dist/server/index.js'), '--db', config.dbPath, '--role', config.role,
      '--user', config.userName, '--toolset', config.toolset],
  } } }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'MCP 설정 생성 실패');
  process.exitCode = 1;
}
