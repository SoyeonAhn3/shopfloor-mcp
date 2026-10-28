# MCP 실행과 확인 / MCP setup

Phase 4의 기본 구성은 도구 4개, 참고자료 4개, 질문 템플릿 2개입니다. 계산은 Phase 3 core를 사용합니다. 서버는 로컬 stdio 프로세스이며 AI 모델이나 API 키를 포함하지 않습니다. MCP Apps를 선언한 클라이언트에는 Phase 7 이슈 확정 폼(`ui://shopfloor/issue-preview`)과 폼 전용 `confirm_issue`도 등록되며, 다른 클라이언트의 도구 목록은 그대로입니다.

The default interface exposes four tools, four resources and two prompt templates. Claude or another MCP client supplies the model and tool-use loop. The server reuses Phase 3 calculations. Clients that declare MCP Apps also get the Phase 7 issue confirmation form (`ui://shopfloor/issue-preview`) and its app-only `confirm_issue`; other clients see the same text-only surface.

## 1. 빌드와 실행용 DB / Build and runtime copy

프로젝트 폴더에서 실행합니다. 동결 데이터가 있는 개발 환경:

```powershell
npm ci
npm run build
npm run db:copy -- --to data/run/phase4-production.db
```

새 체크아웃에는 DB가 없으므로 먼저 생성한 뒤 복사합니다:

```powershell
npm run generate
npm run db:copy -- --from data/production.db --to data/run/phase4-production.db
```

이미 존재하는 경로는 덮어쓰지 않습니다. 기존 실행용 DB를 그대로 재사용하거나, 새 복사본이 필요하면 다른 `--to` 경로를 정하세요. DB 옆의 `.runtime.json` 파일도 함께 유지하세요. 서버는 이 표시 파일의 경로와 생성본 식별값을 검사한 뒤 감사 기록·초안을 씁니다. 원본 생성본과 동결 시나리오는 수정하지 않습니다. 표시 파일은 실수 방지용이며 호스트 사용자를 격리하는 보안 장치는 아닙니다.

Run from the repository directory. A fresh checkout first needs `generate`; an existing frozen workspace can copy `data/phase2/production.db`. Copies preserve dataset identity and use SQLite backup. Existing files are never overwritten. Keep the adjacent runtime marker; it protects against accidental source writes, not a malicious local host.

## 2. Claude 연결 설정 / Client configuration

실제 PC의 Node·서버·DB 절대 경로가 들어 있는 JSON을 출력합니다:

```powershell
npm run --silent mcp:config -- --db data/run/phase4-production.db --role viewer --user demo
```

- Claude Desktop: 설정의 개발자 메뉴에서 MCP 설정 파일을 열고, 출력된 `mcpServers.shopfloor` 항목을 기존 JSON에 합칩니다. 다른 서버 항목은 유지합니다. 저장 후 클라이언트를 다시 시작합니다. Windows의 일반적인 파일 위치는 `%APPDATA%/Claude/claude_desktop_config.json`입니다.
- Claude Code: 위 JSON을 로컬 파일에 저장한 후 `claude --mcp-config <설정파일.json> --strict-mcp-config`로 해당 세션에서 사용합니다. 이 옵션은 해당 파일의 MCP 서버만 사용합니다.
- 기본 `viewer`는 조회만 합니다. 초안 테스트에는 출력 명령의 `--role operator`를 사용하고 재시작하세요. AI 도구 입력으로 역할을 바꿀 수 없습니다.
- 기본 `--toolset coarse`는 도구 4개입니다. 비교용 `--toolset fine`은 10개입니다.
- 서버를 터미널에서 직접 실행하려면 `npm run mcp:start -- --db data/run/phase4-production.db`를 사용합니다. 텍스트 질문을 직접 입력하는 채팅 프로그램이 아니므로 MCP 클라이언트 연결을 기다리는 것이 정상입니다.

The config command prints JSON with absolute paths and makes no changes to installed clients. Merge its entry into Claude Desktop's configuration, or load a saved JSON file with Claude Code's session-level `--mcp-config`. Use `operator` only for draft creation; default `viewer` is read-only at the business-operation level. Tool queries still write audit rows.

## 3. 기본 도구와 예시 / Tools and example

| Tool | mode | 기능 / Function |
|---|---|---|
| `get_line_info` | 없음 / none | 라인별 제품·표준 생산량 / line metadata |
| `query_production` | `production`, `defects`, `downtime` | 실적·목표·라인/기간 비교, 불량, 비가동 / queries |
| `analyze_production` | `shortfall`, `hourly_pattern`, `anomalies` | 손실 분해, 패턴, 이상 / analyses |
| `preview_issue` | 없음 / none | 근거 있는 초안 / evidenced draft |

```json
{
  "name": "query_production",
  "arguments": {
    "mode": "production",
    "lineIds": ["L1"],
    "period": {"kind": "last_week"},
    "compareTo": {"kind": "weeks_ago", "weeks": 2}
  }
}
```

기준 시각 2026-10-01 08:00에서 위 요청은 생산일 9/21~25와 9/14~18을 비교합니다. `last_month`, 최근 4·5주, 상대 주의 특정 요일, 직접 지정한 날짜도 지원합니다. “L1이 무엇을 생산하나?”를 함께 물으면 AI가 `get_line_info`도 호출해 결과를 합칩니다.

The example compares two periods; it does not hard-code those dates. All period forms reuse the core schema. A compound metadata-and-production question needs both tools. Natural-language selection and final answer quality belong to the client and Phase 5 evaluation.

## 4. 결과를 직접 확인 / Inspect real protocol results

API 키나 AI 없이 빌드된 서버에 실제 MCP 연결을 만듭니다. 기본 요청은 개발용 D01(L5 어제 생산량·양품)입니다.

```powershell
npm run mcp:demo
npm run mcp:demo -- --toolset fine
npm run mcp:demo -- --out logs/my-mcp-demo.json
```

`--db`는 원본 선택, `--lines L1,L2`는 라인 선택, `--period`·`--compare-to`는 기간 JSON입니다. 매번 임시 실행용 복사본을 만들고 정리합니다. JSON에는 도구 목록·입력 스키마·리소스·프롬프트, 호출 입력과 결과, 실제 기간, 근거 번호, 대응하는 감사 기록이 담깁니다. 기존 결과 파일은 덮어쓰지 않습니다.

This demo uses the compiled server over stdio from a different working directory. It records discovery, calls, data-guide resource, briefing template and audit evidence. It is a deterministic protocol check, not an LLM answer-quality evaluation.

## 5. 검증 범위 / Validation scope

- `npm run check`: 타입 검사 + 전체 224개 테스트(파일 22개) + 빌드.
- `npx vitest run tests/server`: MCP 테스트 61개(Phase 4 43개, Phase 7 15개, Phase 5 후속 3개). 도구 선택별 동일 결과, 여러 기간, 상태 구분, 권한, 정보 보호, 입력 거절, 실행용 DB 보호, 실제 stdio 연결, MCP Apps 감지와 확정 폼 연결, 폼 전용 확정(공개 범위, 이슈 1건과 감사 기록, 두 번 클릭·만료·중복 거절), 비가동 사유 한국어 이름, 최종 심각도 선택 필수.
- `npm run scenarios:check`: 동결 시나리오 무결성. 동결 생성본이 없는 새 체크아웃에서는 Phase 2 안내를 따릅니다.
- 리소스와 프롬프트는 클라이언트 지원과 사용자의 선택에 따라 노출됩니다. 등록만으로 매 응답에 자동 삽입되지 않습니다.
- 자동 프로토콜 검증과 빌드 데모는 통과했습니다. Claude Desktop 화면에서의 표시·자연어 대화는 수동 확인 대상입니다. 실제 모델 평가는 Phase 5([eval/summary.md](../eval/summary.md))에 있습니다. Phase 7 확정 폼은 MCP Inspector에서 폼 확정 → 이슈 1건 등록 → 재확정 거절까지 확인했습니다(방법은 [Phase 7](../Phase/Phase7_ConfirmationAndDemo.md)). `confirm_issue`는 화면 전용이라 Claude의 도구 목록에 없고, MCP Apps를 선언하지 않은 클라이언트에는 등록되지 않습니다. Claude 데스크톱 확인은 남아 있습니다.

Automated checks pass; Desktop UI and natural-language conversation checks remain manual. Use only dev scenarios D01–D10 for these checks. Prompt retrieval never executes tools. Live model evaluation results are in [eval/summary.md](../eval/summary.md). The Phase 7 form was checked in MCP Inspector: form confirm → one issue → second confirm rejected (see [Phase 7](../Phase/Phase7_ConfirmationAndDemo.md)). `confirm_issue` is app-only, so it is absent from Claude's tool list, and it is not registered for clients that do not declare MCP Apps. The Claude Desktop check is pending.

SDK/프로토콜 참고: [공식 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [공식 서버 개발 안내](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server).
