# 설치 안내 / Installation

새 PC에서 저장소를 받아 데이터를 만들고, AI 없이 서버를 확인한 뒤 Claude 데스크톱에 연결하는 순서입니다. 1~6단계의 명령은 2026-10-27에 새로 받은 저장소에서 실행해 확인했습니다(10장). 7단계 Claude 데스크톱 연결은 아직 이 프로젝트에서 실기 확인하지 않았습니다.

From a fresh clone to a Claude Desktop connection. Steps 1–6 were run on a clean clone on 2026-10-27 (section 10). Step 7, the Claude Desktop connection, has not been checked on a real Desktop in this project yet.

## 1. 준비 / Prerequisites

| 항목 | 버전·조건 |
|---|---|
| Node.js | 24.14.0 (`package.json`의 `engines`) |
| npm | 11.x |
| Git | 저장소를 받을 때 |
| Claude 데스크톱 | 7단계에서만 필요 (선택) |
| API 키 | 필요 없음. 유료 평가 실행(`npm run eval`)에만 씀 |

외부 데이터베이스나 인터넷 서비스는 쓰지 않습니다. 데이터는 3단계에서 PC 안에 생성합니다.

No API key, external database or online service is needed; data is generated locally in step 3. Claude Desktop is needed only for step 7.

## 2. 저장소 받기와 설치 / Clone and install

```sh
git clone https://github.com/SoyeonAhn3/shopfloor-mcp.git
cd shopfloor-mcp
npm ci
```

**Windows에서 `npm ci`가 `gyp ERR! find VS`로 실패하면** 아래 명령으로 다시 설치합니다.

```sh
npm ci --ignore-scripts
```

- `better-sqlite3` 패키지에는 Windows·macOS·Linux용 미리 빌드된 파일이 들어 있습니다. 그런데 `npm ci`는 잠금 파일만 보고 이 패키지를 소스에서 다시 컴파일하려 해서, C++ 빌드 도구(Visual Studio "Desktop development with C++")가 없는 PC에서는 실패합니다.
- `--ignore-scripts`는 이 컴파일 단계를 건너뜁니다. 미리 빌드된 파일로 SQLite가 동작하고, 나머지 설치 스크립트(`esbuild`의 바이너리 확인, macOS 전용 `fsevents`)를 건너뛰어도 3~6단계가 모두 통과했습니다.
- C++ 빌드 도구가 있는 PC에서는 `npm ci`가 그대로 동작합니다.

On Windows without C++ build tools, `npm ci` tries to compile `better-sqlite3` from source and fails with `gyp ERR! find VS`, even though the package ships prebuilt binaries. `npm ci --ignore-scripts` skips that step; SQLite then loads the bundled binary and steps 3–6 pass.

## 3. 데이터 생성과 검증 / Generate and verify

```sh
npm run generate
npm run validate
npm run check
```

| 명령 | 하는 일 | 정상 결과 |
|---|---|---|
| `generate` | `data/`(Git 제외)에 가상 생산 DB, 정답표, 검증 결과, 설정 사본 생성 | V01~V12 `PASS` |
| `validate` | 생성된 데이터를 다시 검사 | V01~V12 `PASS` |
| `check` | 타입 검사 + 전체 테스트 + 빌드 (`dist/` 생성) + 결과 재생 페이지 데이터 검사 | 테스트 전체 통과, `site/data matches the evaluation records`, 종료 코드 0 |

`generate`는 기존 파일을 덮어쓰지 않습니다. 다른 생성본이 필요하면 `npm run generate -- --out-dir <새 폴더>`를 씁니다.

`generate` writes the synthetic DB, answer key, validation report and config snapshot to `data/` and never overwrites existing files. `check` runs typecheck, all tests, the build and the replay-data check; later steps need its `dist/` output.

## 4. 실행용 DB 복사본 / Runtime copy

```sh
npm run db:copy -- --from data/production.db --to data/run/phase4-production.db
```

서버는 원본 DB에 쓰지 않습니다. 감사 기록과 초안은 이 복사본에만 쌓입니다. 복사본 옆의 `.runtime.json` 표시 파일도 함께 두세요. 이미 있는 경로는 덮어쓰지 않으므로, 새 복사본이 필요하면 다른 `--to` 경로를 씁니다.

The server never writes to the source DB; audit rows and drafts go to this copy. Keep the adjacent `.runtime.json` marker. Existing paths are never overwritten.

## 5. AI 없이 서버 확인 / Check the server without AI

```sh
npm run mcp:demo -- --db data/production.db
```

빌드된 서버에 실제 MCP 연결을 만들어 도구 목록과 조회 한 건(5라인 어제 생산량)을 실행합니다. 출력 JSON에 `"toolset": "coarse"`, 도구 4개, `"ok": true`, `"evidenceId": "Q-0001"`이 보이면 정상입니다. 임시 복사본을 쓰고 정리하므로 4단계 복사본은 바뀌지 않습니다.

Opens a real MCP connection to the built server, lists the tools and runs one query. Expect `"toolset": "coarse"`, four tools, `"ok": true` and `"evidenceId": "Q-0001"`. It uses and removes its own temporary copy.

## 6. Claude 연결 설정 출력 / Print the client config

```sh
npm run --silent mcp:config -- --db data/run/phase4-production.db --role viewer --user demo
```

이 PC의 Node, 서버, DB 절대 경로가 들어 있는 JSON을 출력합니다. 설치된 프로그램은 바꾸지 않습니다.

- `--role viewer`(기본): 조회만 합니다. 이슈 초안까지 써 보려면 `--role operator`로 다시 출력합니다.
- `--toolset fine`: 비교용 도구 10개 구성. 기본은 도구 4개인 `coarse`입니다.
- 역할은 이 실행 설정으로만 정해지며 AI가 대화 중에 바꿀 수 없습니다.

Prints JSON with this PC's absolute paths and changes nothing. Default `viewer` is read-only; use `--role operator` to try issue drafts. The role is set only here, never by the AI.

## 7. Claude 데스크톱 연결 / Connect Claude Desktop

> 이 단계는 아직 실기 확인 전입니다(Phase 7 C 단계). 문제가 있으면 [MCP_SETUP](MCP_SETUP.md)과 [Phase 7](../Phase/Phase7_ConfirmationAndDemo.md)을 참고하세요.

1. Claude 데스크톱 설정의 개발자 메뉴에서 MCP 설정 파일을 엽니다. Windows의 일반적인 위치는 `%APPDATA%\Claude\claude_desktop_config.json`입니다.
2. 6단계에서 출력된 `mcpServers.shopfloor` 항목을 기존 JSON에 합칩니다. 다른 서버 항목은 지우지 않습니다.
3. 저장하고 Claude 데스크톱을 다시 시작합니다.
4. 첫 질문을 해 봅니다.

```
5라인 어제 얼마나 만들었고 양품은 얼마였는지 정리해줄래?
```

"어제"는 데이터 기준 시각 2026-10-01 08:00에서 계산한 생산일 2026-09-30입니다. 답에는 생산량, 양품, 근거 번호(`Q-…`)가 들어 있어야 합니다.

**이슈 확정 폼:** `--role operator`로 연결하면 Claude가 이슈 초안을 만든 뒤 대화 안에 "이슈 등록 확인" 폼이 뜹니다(MCP Apps). 이슈는 사람이 폼의 확정 버튼을 눌러야만 등록됩니다. 처음 표시될 때 Claude가 앱 허용을 물을 수 있습니다.

Not yet checked on a real Desktop (Phase 7 stage C). Merge the printed `mcpServers.shopfloor` entry into `claude_desktop_config.json`, keep other servers, restart, and ask the first question above. "Yesterday" means production day 2026-09-30, from the fixed reference time 2026-10-01 08:00. With `--role operator`, an issue draft opens the "이슈 등록 확인" form; only its confirm button registers the issue.

## 8. 데스크톱 없이 확정 폼 확인 (선택) / Check the form without Desktop (optional)

MCP Inspector로 폼과 확정 버튼을 확인할 수 있습니다. 단계별 입력값과 통과 기준은 [Phase 7의 B 단계](../Phase/Phase7_ConfirmationAndDemo.md)에 있습니다.

```sh
npm run db:copy -- --from data/production.db --to data/run/inspector.db
npx -y @modelcontextprotocol/inspector@2.12.0 node dist/server/index.js --db data/run/inspector.db --role operator --user demo
```

수정은 Inspector의 도구 입력 칸이 아니라 앱으로 뜬 "이슈 등록 확인" 폼에서 합니다.

MCP Inspector shows the form and its confirm button. Inputs and pass criteria are in Phase 7 stage B. Edit inside the "이슈 등록 확인" form, not in the Inspector's own input fields.

심각도 제안값은 참고용입니다. 폼에서 최종 심각도를 선택해야 확정할 수 있으며, 제안과 같은 값을 채택해도 선택이 필요합니다. 화면 전용 도구를 직접 점검할 때도 `edits.severity`는 필수입니다. 예: `{ "draftId": "P-…", "edits": { "severity": "medium" } }`.

The proposed severity is provisional. Select the final severity in the form, even when accepting the proposal. Direct checks of the app-only tool also require `edits.severity`, as in the example above.

## 9. 문제 해결 / Troubleshooting

| 증상 | 원인과 조치 |
|---|---|
| `npm ci`에서 `gyp ERR! find VS` | 2장의 `npm ci --ignore-scripts` 사용 |
| `db:copy`가 거절됨 | 대상 경로가 이미 있음. 다른 `--to` 경로 사용 |
| Claude 데스크톱에서 서버가 시작되지 않음 | `dist/server/index.js`가 없음. 3장 `npm run check`(또는 `npm run build`)를 먼저 실행하고 6장 JSON의 경로 확인 |
| `npm run mcp:start`가 아무 반응 없이 멈춤 | 정상. MCP 클라이언트 연결을 기다리는 서버이며 채팅 프로그램이 아님 |
| 이슈 초안이 거절됨 | `viewer` 역할이거나, 같은 대화에서 먼저 조회한 라인·생산일 근거가 없음. 6장에서 `--role operator`로 다시 설정 |

## 10. 확인 기록 / Verification record

| 항목 | 값 |
|---|---|
| 날짜 | 2026-10-27 |
| 환경 | Windows 10 Enterprise (19045), Node.js 24.14.0, npm 11.9.0, Visual Studio 없음 |
| 대상 | GitHub에서 새로 받은 저장소, 커밋 `ee85cde`, ASCII 경로 |
| 결과 | `npm ci` 실패(`gyp ERR! find VS`), `npm ci --ignore-scripts` 성공. 이후 `generate`, `validate`(V01~V12 PASS), `check`(21개 파일, 216개 테스트 통과), `db:copy`, `mcp:config`, `mcp:demo` 모두 종료 코드 0 |
| 미확인 | 7장 Claude 데스크톱 연결 |

All commands in steps 2–6 were run on a clean clone of commit `ee85cde`. Plain `npm ci` failed without Visual Studio; `npm ci --ignore-scripts` succeeded and every later command exited 0. Step 7 is unverified.
