// PreToolUse guard (CLAUDE.md "데이터·파일"): keeps secret env files out of tool calls, using the same rules as
// .gitignore (.env, .env.*, *.env; templates stay readable). Shell commands are matched by token, so this stops
// mistakes, not deliberate obfuscation.
import { readFileSync } from 'node:fs';

const SECRET = /^(\.env(\.[\w.-]+)?|[\w.-]+\.env)$/i;
const ALLOWED = /^(\.env\.(example|sample|template)|process\.env|import\.meta\.env)$/i;
const SHELL_SEP = /[\s"'`;&|()<>=,]+/;
const GLOB_SEP = /[\s{},]+/;

const isSecret = path => {
  const name = String(path).split(/[\\/]/).filter(Boolean).pop() ?? '';
  return SECRET.test(name) && !ALLOWED.test(name);
};

function deny() {
  const reason = '.env 계열 파일(API 키)은 읽거나 수정할 수 없습니다(.claude/hooks/guard-env.mjs). 값이 필요하면 출력하지 말고 사용자에게 직접 설정을 요청하고, 설정 항목은 .env.example을 참고하세요.';
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
}

const input = JSON.parse(readFileSync(0, 'utf8'));
const args = input.tool_input ?? {};
if (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') {
  if (String(args.command ?? '').split(SHELL_SEP).some(isSecret)) deny();
} else if (input.tool_name === 'Grep') {
  const globs = String(args.glob ?? '').split(GLOB_SEP).map(part => part.replaceAll('*', ''));
  if (isSecret(args.path ?? '') || globs.some(isSecret)) deny();
} else if (isSecret(args.file_path ?? '')) {
  deny();
}
