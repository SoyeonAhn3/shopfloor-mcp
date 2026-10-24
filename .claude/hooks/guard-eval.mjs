// PreToolUse guard (CLAUDE.md "평가 무결성"): blocks paid evaluation runs and direct writes to frozen
// evaluation records. Project scripts such as scenarios:freeze and eval:freeze still write through their own checks.
import { readFileSync } from 'node:fs';

const END = String.raw`(?=$|[\\/\s"';&|)])`;
const PROTECTED = new RegExp(String.raw`(^|[\s"'=\\/])eval[\\/](scenarios[\\/]eval(?=$|[\\/.\s"';&|)])|runs${END}|description-freeze\.json|freezes${END})`, 'i');
const PAID_EVAL = /\bnpm(\.cmd)?\s+(run|run-script)\s+eval(?=$|[\s"';&|)])|\b(node|tsx)\b[^;&|]*eval[\\/]runner\.(m?js|ts)\b/i;
const WRITE_CMD = /(^|[\s;&|(])(rm|rmdir|mv|cp|truncate|tee|dd|del|erase|touch|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item|Set-Content|Add-Content|Clear-Content|Out-File)(?=$|[\s;&|)])|\bsed\s+(-\S+\s+)*-i|\bgit\s+(rm|mv|checkout|restore|clean)\b/i;
const REDIRECT = /(?:^|[^0-9&>])>>?\s*["']?([^\s"';&|]+)/g;

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
}

const input = JSON.parse(readFileSync(0, 'utf8'));
const args = input.tool_input ?? {};
const FROZEN = '동결된 평가 기록(eval/scenarios/eval, eval.lock.json, eval/runs, description-freeze.json, eval/freezes)은 직접 수정할 수 없습니다(.claude/hooks/guard-eval.mjs). 재동결은 scenarios:freeze·eval:freeze 스크립트와 --reason으로 하며, 수정이 필요하면 우회하지 말고 사용자에게 알리세요.';
if (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') {
  const command = String(args.command ?? '');
  if (PAID_EVAL.test(command)) deny('유료 API를 호출하는 평가 실행은 차단되어 있습니다(.claude/hooks/guard-eval.mjs). 실행할 명령을 사용자에게 알려 주고, 사용자가 터미널에서 직접 실행하게 하세요.');
  const redirected = [...command.matchAll(REDIRECT)].some(match => PROTECTED.test(match[1] ?? ''));
  if (redirected || (WRITE_CMD.test(command) && PROTECTED.test(command))) deny(FROZEN);
} else if (PROTECTED.test(String(args.file_path ?? args.notebook_path ?? '').replaceAll('\\', '/'))) {
  deny(FROZEN);
}
