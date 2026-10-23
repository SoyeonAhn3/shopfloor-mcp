import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createApp } from './app.js';
import { parseLaunchConfig, USAGE } from './config.js';

async function main(): Promise<void> {
  if (process.argv.length === 3 && process.argv[2] === '--help') { console.error(USAGE); return; }
  const app = createApp(parseLaunchConfig(process.argv.slice(2)));
  const shutdown = () => { void app.close().catch(() => { process.exitCode = 1; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdin.once('end', shutdown);
  try { await app.server.connect(new StdioServerTransport()); }
  catch (error) { await app.close(); throw error; }
}
main().catch(error => {
  console.error('shopfloor-mcp 시작 실패:', error instanceof Error ? error.message : '설정을 확인하세요.');
  console.error(USAGE);
  process.exitCode = 1;
});
