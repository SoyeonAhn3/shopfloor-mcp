# Phase 4 — MCP Server (Tools, Resources, Prompts) `✅ Implemented / automated checks passed`

> Expose the core logic over local stdio MCP: **4 grouped tools by default**, 4 resources and 2 prompts. Keep the 10-tool fine set as a Phase 5 comparison option.

**Status**: ✅ Implementation and automated verification complete (2026-10-23). Claude Desktop UI / natural-language conversation acceptance remains a manual check; no model evaluation has run.
**Prerequisites**: Phase 3 complete (core logic and tests)

---

## Overview

Phase 4 wraps the Phase 3 functions as MCP tools.

- **Tools.** English names, Korean descriptions. Dispatched core results are summary-first, with the data-as-of time and an evidence ID when audit storage succeeds; SDK validation errors are described below.
- **Clients.** SDK in-memory and stdio clients verify the server. Claude Code/Desktop registration instructions and a config generator are provided; installed client settings have not been changed.
- **Confirm tool.** `confirm_issue` is not registered in this phase, because stage 1 is text-only. Previews stop at "draft created".
- **Default tool set.** Group common functions into four coarse tools. Select the ten fine tools only with `--toolset fine` for the Phase 5 comparison.

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| 1 | `src/server/index.ts`, `app.ts`, `config.ts`, `runtime-db.ts` (stdio entry and runtime copy guard) | ✅ | general |
| 2 | `src/server/toolsets/fine.ts` + `tools/register.ts` (10 tools, shared registration) | ✅ | project-specific |
| 3 | `src/server/toolsets/coarse.ts` + `schemas.ts` (default 4 tools and mode validation) | ✅ | project-specific |
| 4 | `src/server/descriptions.ts` (all tool descriptions, Korean) | ✅ | project-specific |
| 5 | `src/server/resources.ts` + `resources/*.md` (4 resources) | ✅ | project-specific |
| 6 | `src/server/prompts.ts` (2 prompts) | ✅ | project-specific |
| 7 | `src/server/format.ts` (summary, evidence, recoverable errors, capped details) | ✅ | project-specific |
| 8 | `tests/server/` (43 tests: protocol, runtime copy, real stdio process) | ✅ | general |
| 9 | `scripts/copy-runtime-db.ts`, `demo-mcp.ts`, `mcp-config.ts`, `docs/MCP_SETUP.md` | ✅ | general |

---

## Server Entry & Launch Config

### Purpose
Start the server as a local process that Claude Desktop or Claude Code launches. All settings come from launch arguments; there is no login.

### Core Classes / Structure
```ts
// src/server/index.ts
const config = parseLaunchConfig(process.argv.slice(2));
// { dbPath, role: "viewer" | "operator", userName, toolset: "fine" | "coarse" }
const app = createApp(config); // copy guard → core → tools/resources/prompts
await app.server.connect(new StdioServerTransport());
```
```json
{
  "mcpServers": {
    "shopfloor": {
      "command": "node",
      "args": ["<repo>/dist/server/index.js",
               "--db", "<repo>/data/run/production.db",
               "--role", "operator", "--user", "operator1"]
    }
  }
}
```

### Design Decisions
- **stdout carries MCP messages only.** With the stdio transport, logs and debug output go to stderr.
- **The server opens a copy** (`data/run/`) of the frozen generation (currently `data/phase2/`), because drafts and audit rows are written. `npm run db:copy` uses SQLite backup, refuses existing destinations and creates a `.runtime.json` marker. Before opening a writer, the server checks the marker's canonical path and dataset identity and rejects the source file (including a hard-link alias). This is an accidental-write guard, not isolation from a malicious local host.
- **Role and user name come from the launch config** (plan §3-3). Switching role means editing the client config and restarting.
- **Defaults:** viewer, user `local`, toolset `coarse`; `--db` is required. Each server process gets a fresh session ID. Closing the stdio connection releases the core DB handles.
- **Asset paths are independent of cwd.** Build copies resource markdown into `dist/resources/`; both source and built servers can be launched from another directory.

---

## Tools — Fine-grained Set (comparison option)

### Purpose
Map each tool in plan §3-1 to one core function, with input validated by zod.

### Core Classes / Structure
| Tool (working name) | Plan §3-1 | Core function | Role |
|---|---|---|---|
| `get_line_info` | 라인 정보 | `lines` read | viewer |
| `get_production` | 생산 실적 | `getProduction` | viewer |
| `get_target_vs_actual` | 목표 대비 실적 | `getAchievement` | viewer |
| `get_downtime` | 비가동 기록 | downtime query (memos as `MemoField`) | viewer |
| `get_defects` | 불량 기록 | defect query (no worker fields) | viewer |
| `detect_anomalies` | 이상 징후 탐지 | `detectAnomalies` | viewer |
| `compare_lines` | 라인 비교 | `compareLines` | viewer |
| `analyze_shortfall` | 목표 미달 원인 분해 | `breakdownLoss` | viewer |
| `analyze_hourly_pattern` | 시간대별 패턴 분석 | `hourlyPattern` | viewer |
| `preview_issue` | 이슈 등록 미리보기 | `createDraft` | operator |
| `confirm_issue` | 이슈 등록 확정 | `confirmDraft` | human button only: **not registered until Phase 7** |

```ts
interface ToolResponse {
  summary: string;                 // Korean, 1–3 lines, comes first
  status?: DataStatus;             // when not a normal result
  items?: unknown[];               // key rows only, capped; may include wrapped memo fields
  evidenceId: string | null;       // "Q-0003"; null if the audit store failed
  dataAsOf: string;                // "2026-10-01T08:00"
  resolvedRange?: { from: string; to: string; label: string };
}
// MCP text: summary line, then JSON; the same body is also structuredContent.
// Core totals remain exact; each detail array is capped at 60 with truncated[path,total,returned].
```

### Design Decisions
- **English names, Korean descriptions** (plan §3-1). The descriptions use shop-floor terms (비가동, 계획 정지, 교대 시간), so the user's wording matches them.
- **All descriptions live in `descriptions.ts`.** It is the tuning surface for Phase 5 dev scenarios. Changes show up as one diff, and the file hash is written into every run record.
- **Use the implemented Phase 3 public API.** `createCore(...).tools` validates, audits and protects each operation already. MCP handlers call those methods and format the result; do not add a second `audited()` wrapper. Confirmation stays outside this object. Runtime copies receive the draft-related-date migration in `RuntimeWriter`.
- **Period inputs reuse `src/core/period.ts`.** Support relative weeks/months, trailing N days/weeks/months, completed calendar weeks, a weekday within a relative week, explicit months/dates/ranges and current periods. Distinguish “four weeks ago” from “recent four weeks”; clarify ambiguous natural-language requests. Return requested bounds, resolved production days and coverage. No line means all six lines when a period is supplied.
- **Comparison uses existing tools.** `get_production` forwards `compareTo` for overall/per-line totals and changes. `get_defects` forwards `compareTo` and optional `comparisonExcludeDates` for same-hour baseline comparisons. Core calculates all numeric changes; `compare_lines` remains a line comparison. Preserve fraction/percent/percentage-point units when formatting.
- **Errors are recoverable.** Core failures and SDK input-validation failures set `isError: true`. Core failures retain evidence where available and include recovery guidance. An unknown tool is a protocol error. SDK-rejected inputs do not reach the core and create no audit row; every dispatched core operation has exactly one audit attempt. No fabricated evidence IDs.
- **Numbers and details.** JSON keeps exact values. Summary rounding changes display only; ratios, percent and percentage points have explicit units. Missing observations and comparison coverage stay visible. Every truncated array reports its original and returned counts; requery with narrower filters for more detail.

---

## Tools — Coarse-grained Set (default)

### Purpose
Provide the default grouped interface using the same Phase 3 core functions. Group the AI-facing entry points, not their calculation code.

| Tool | Mode | Core function |
|---|---|---|
| `get_line_info` | none | `getLineInfo` |
| `query_production` | `production` | `getProduction` (quantities, targets, achievement, line totals, period comparison) |
| `query_production` | `defects` | `getDefects` |
| `query_production` | `downtime` | `getDowntime` |
| `analyze_production` | `shortfall` | `breakdownLoss` |
| `analyze_production` | `hourly_pattern` | `hourlyPattern` |
| `analyze_production` | `anomalies` | `detectAnomalies` |
| `preview_issue` | none | `createDraft` (operator only) |

### Design Decisions
- **Four tools, strict mode-specific inputs.** Reuse `period`, `lineIds`, `hours`, `shift`, `crew`, and `excludeDates`. Production allows `compareTo`/`grain`; defects allows `compareTo`/`comparisonExcludeDates`; downtime allows `window`; hourly patterns allow `splitBy`. Reject incompatible fields instead of silently ignoring them.
- **Default: `--toolset coarse`.** `--toolset fine` exposes the previous ten-tool design. Descriptions for both live in `descriptions.ts`; no duplicated calculations or audit wrapper.
- **Equal results and caveats.** Preserve core numbers, period boundaries, missing-data coverage, evidence IDs and permissions. Production results include the warning against ranking unlike products by raw quantity.
- **Compound questions use multiple calls.** “Yesterday's L1 results and what L1 makes” uses `query_production` plus `get_line_info`; the client combines their responses. The server does not add an agent/harness loop.
- **Same safety properties.** The coarse set never includes a confirm tool, wraps memos the same way, and returns no worker fields.

---

## Resources & Prompts

### Purpose
Give Claude reference material and two menu templates (plan §3-1).

### Core Classes / Structure
| Resource URI | Source |
|---|---|
| `shopfloor://lines` | `lines` table (product, standard rate) |
| `shopfloor://glossary` | `resources/glossary.md`: 비가동, 계획 정지, 교대 시간, 생산일 |
| `shopfloor://anomaly-criteria` | `resources/anomaly-criteria.md`: same values as `src/core/criteria.ts` |
| `shopfloor://data-guide` | `resources/data-guide.md` plus connected DB metadata: shift system, production day start, reference time, available range |

| Prompt | Argument | Flow |
|---|---|---|
| `daily_briefing` (일일 생산 브리핑) | none | All lines, yesterday: target vs actual → lowest lines → evidence IDs |
| `line_root_cause` (라인별 원인 분석) | `line` (L1–L6) | Ask for a period if absent/ambiguous → production → shortfall → hourly pattern |

### Design Decisions
- **Three resources are document files and one comes from the DB** (dataset design §3-7). A test checks that the anomaly-criteria document matches `criteria.ts`.
- **Prompts are templates only.** They never call tools themselves, and every number still comes from tool calls.
- **Resources are client-selected context.** Registration does not force automatic reading. Reading these resources or retrieving templates creates no production query, draft or audit row. Templates use names appropriate to the selected toolset.

### Usage Examples
```
# Print absolute-path client JSON; save it and load it in the chosen client.
npm run --silent mcp:config -- --db data/run/phase4-production.db --role operator --user dev

> 어제 4라인 달성률 알려줘
  → query_production { mode: "production", lineIds: ["L4"], period: { kind: "yesterday" } }
  ← summary + evidenceId "Q-0001" + dataAsOf + resolvedRange 9/30
> 이슈로 등록해줘
  → preview_issue { … }
  ← "초안 생성됨 (P-…), 이 환경에서는 확정할 수 없음"
```

---

## Phase 4 Skill Classification

| Skill | Classification | Reason |
|---|---|---|
| stdio entry, launch config, in-memory MCP tests | general | Standard MCP server scaffolding |
| Tools, descriptions, resources, prompts, coarse set | project-specific | This domain's tools and wording |

---

## Prerequisites & Dependencies
- Phase 3 core functions.
- Phase 2 eval scenarios frozen before the first description is written.
- npm: stable v2 `@modelcontextprotocol/server` 2.3.1; `@modelcontextprotocol/client` 2.3.1 for integration tests and demos (pinned).
- Claude Code and Claude Desktop for manual checks.

---

## Development Notes
- **Automated completion checks:**
  - MCP discovery lists default 4 tools (fine: 10), 4 resources and 2 prompts, and no `confirm_issue`.
  - The integration tests pass:
    - the tool list excludes confirm
    - each tool's normal path and status cases work
    - a viewer is denied on `preview_issue`
    - the out-of-range message appears
    - no worker-ID pattern appears in any response
    - memos are wrapped
- **Manual checks use dev scenarios D01–D10 only.** Do not try eval scenarios here.
- **Resolved decision:** four grouped tools are the default; ten fine tools remain for comparison. Harness work stays planning-only.
- **Manual acceptance still pending:** verify discovery/UI availability and a D01–D10 conversation in the user's Claude client. This has not been claimed as passed. Client capabilities can differ, especially resource/prompt menus.
- **Registration instructions:** [docs/MCP_SETUP.md](../docs/MCP_SETUP.md), including `mcp:config`, build/copy commands and `mcp:demo`; Phase 7 can incorporate them into `docs/INSTALL.md`.

### Verification record — 2026-10-23

| Check | Result |
|---|---|
| `npm run check` | PASS: typecheck, 157 tests / 12 files, build |
| `npx vitest run tests/server` | PASS: 43 new tests / 3 files |
| `npm run scenarios:check` | PASS: frozen 30 eval + 10 dev, original dataset identity and scenario hash |
| Built stdio `mcp:demo` (coarse / fine, default D01 query) | PASS: 4 / 10 tools, 4 resources, 2 prompts; real query/resource/prompt responses; empty stderr |
| `db:copy` and `mcp:config` | PASS: runtime copy with marker, absolute-path client JSON |
| Natural-language model quality / Desktop UI | NOT RUN: manual client check and Phase 5 evaluation remain |

Tests exercise every fine tool and grouped mode, same-number parity, yesterday/relative weeks/month/4–5 weeks/weekday periods, six data states, mode-specific rejection, injection-shaped input, permissions, evidence scope, redacted reference memos, single core audit, full totals with capped details, source DB protection and another-cwd stdio launch. SDK schemas reject malformed inputs before dispatch; SQL remains the Phase 3 parameterized implementation.

Local review artifacts (git-ignored): `logs/test-results/phase4-20261023/report.html`, `mcp-coarse.json`, `mcp-fine.json`. The demo writes disposable runtime copies and uses no model. Frozen eval questions were not sent to an AI or used to tune descriptions. Harness implementation remains out of scope.

---

## Change Log

| Date | Description |
|---|---|
| 2026-10-21 | Initial creation |
| 2026-10-23 | Approve the default four-tool grouping, mode-specific validation and fine-set comparison option; start implementation and tests with stable MCP SDK v2. |
| 2026-10-23 | Implement grouped/fine stdio tools, resources/prompts, copy guard, formatter, setup/demo/config commands and 43 tests. All 157 tests and build pass; record Desktop/model acceptance separately. |
| 2026-10-23 | Carry frozen Phase 2 scope/metric defaults and period-comparison requirements into the tool input plan. No tool descriptions or server code were implemented. |
| 2026-10-23 | Connect the completed Phase 3 public API, generic period schema, defect comparison and runtime migration; avoid double auditing. MCP implementation remains pending. |

---
---

# Phase 4 — MCP 서버 (도구, 리소스, 프롬프트) `✅ 구현·자동 검증 완료`

> 로컬 stdio MCP로 서버 로직을 연결한다. **공통 기능을 묶은 도구 4개를 기본**으로 제공하고, 리소스 4개와 프롬프트 2개를 만든다. 기존 10개 도구는 Phase 5 비교용 선택지로 유지한다.

**상태**: ✅ 구현·자동 검증 완료 (2026-10-23). Claude Desktop 화면·자연어 대화는 별도 수동 확인 대상이며 모델 평가는 아직 실행하지 않았다.
**선행 조건**: Phase 3 완료 (서버 로직과 테스트)

---

## 개요

Phase 4는 Phase 3 함수를 MCP 도구로 감싼다.

- **도구.** 이름은 영어, 설명은 한국어다. core 실행 결과는 요약·기준 시각을 먼저 주며 감사 저장 성공 시 근거 번호를 붙인다. SDK 검증 오류는 아래에서 별도로 구분한다.
- **클라이언트.** SDK의 메모리 연결과 실제 stdio 프로세스로 검증했다. Claude Code·데스크톱 연결 안내와 설정 생성기를 제공하며 설치된 클라이언트 설정은 바꾸지 않았다.
- **확정 도구.** 1단계는 텍스트로만 진행하므로 이 Phase에서는 `confirm_issue`를 등록하지 않는다. 미리보기는 "초안 생성됨"에서 멈춘다.
- **기본 도구 세트.** 공통 기능을 묶은 4개 도구를 기본으로 쓴다. Phase 5에서 비교할 때 `--toolset fine`으로 기존 10개 도구를 선택한다.

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| 1 | `src/server/index.ts`, `app.ts`, `config.ts`, `runtime-db.ts` (stdio 진입점·실행용 DB 보호) | ✅ | 범용 |
| 2 | `src/server/toolsets/fine.ts` + `tools/register.ts` (비교용 10개·공통 등록) | ✅ | 전용 |
| 3 | `src/server/toolsets/coarse.ts` + `schemas.ts` (기본 4개·기능별 입력 검증) | ✅ | 전용 |
| 4 | `src/server/descriptions.ts` (도구 설명 전체, 한국어) | ✅ | 전용 |
| 5 | `src/server/resources.ts` + `resources/*.md` (리소스 4개) | ✅ | 전용 |
| 6 | `src/server/prompts.ts` (프롬프트 2개) | ✅ | 전용 |
| 7 | `src/server/format.ts` (요약·근거·오류 안내·상세 목록 제한) | ✅ | 전용 |
| 8 | `tests/server/` (프로토콜·실행용 DB·실제 stdio 테스트 43개) | ✅ | 범용 |
| 9 | `scripts/copy-runtime-db.ts`, `demo-mcp.ts`, `mcp-config.ts`, `docs/MCP_SETUP.md` | ✅ | 범용 |

---

## 서버 진입점과 실행 설정

### 목적
Claude 데스크톱이나 Claude Code가 실행하는 로컬 프로세스로 서버를 띄운다. 설정은 모두 실행 인자로 받고, 로그인은 없다.

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일 (진입점 코드와 Claude 데스크톱 설정 예시).

### 설계 결정 사항
- **stdout에는 MCP 메시지만 보낸다.** stdio 연결이므로 로그와 디버그 출력은 stderr로 보낸다.
- **서버는 동결 생성본(현재 `data/phase2/`)의 복사본(`data/run/`)을 연다.** `npm run db:copy`는 SQLite backup으로 복사하고 `.runtime.json` 표시 파일을 만든다. 기존 파일을 덮어쓰지 않으며, 서버가 쓰기 연결을 열기 전에 실제 경로·생성본 식별값과 원본 여부(하드링크 포함)를 검사한다. 이는 실수 방지 장치이며 악의적인 로컬 호스트를 격리하는 보안 기능은 아니다.
- **역할과 사용자 이름은 실행 설정에서 정한다** (기획서 3-3). 역할을 바꾸려면 클라이언트 설정을 고치고 다시 시작한다.
- **기본값:** viewer, 사용자 `local`, 도구 세트 `coarse`. `--db`는 필수다. 서버 프로세스마다 세션 번호를 새로 만들고 연결 종료 시 DB를 닫는다.
- **실행 폴더와 무관하게 자료를 읽는다.** 빌드 때 문서를 `dist/resources/`에 복사한다. 소스·빌드 서버 모두 다른 폴더에서 실행할 수 있다.

---

## 도구: 잘게 나눈 버전 (비교용 선택지)

### 목적
기획서 3-1의 도구를 서버 로직 함수 하나씩에 연결하고, 입력은 zod로 검증한다.

### 핵심 클래스 / 구조
위 영어 섹션 표와 코드와 동일 (`confirm_issue`는 사람 버튼 전용이며 Phase 7 전까지 등록하지 않음).

### 설계 결정 사항
- **이름은 영어, 설명은 한국어다** (기획서 3-1). 설명에 현장 용어(비가동, 계획 정지, 교대 시간)를 써서 사용자의 표현과 맞물리게 한다.
- **도구 설명은 모두 `descriptions.ts` 한 파일에 둔다.** Phase 5에서 개발용 시나리오로 다듬는 대상이다. 바뀐 내용이 diff 하나로 보이고, 파일 해시를 실행 기록마다 남긴다.
- **구현된 Phase 3 호출 경로를 사용한다.** `createCore(...).tools`가 입력 검증·감사 기록·정보 보호를 처리한다. MCP 처리기는 이 메서드를 부르고 결과를 포맷하며 `audited()`로 다시 감싸지 않는다. 확정은 이 객체 밖에 유지한다. `RuntimeWriter`가 실행용 복사본에 초안 생산일 열을 추가한다.
- **기간은 `src/core/period.ts` 스키마를 재사용한다.** 상대 주·월, 최근 N일·주·개월, 완료된 달력 주, 상대 주차의 특정 요일, 특정 월·날짜·범위와 현재 기간을 지원한다. “4주 전”과 “최근 4주”를 구분하고 모호한 문장은 되묻는다. 요청 범위·실제 생산일·누락 상태를 함께 반환한다. 기간을 지정하고 라인을 생략하면 전체 6라인을 조회한다.
- **기존 도구로 기간 비교를 연결한다.** `get_production`의 `compareTo`는 전체·라인별 합계와 증감을 계산한다. `get_defects`의 `compareTo`, `comparisonExcludeDates`는 같은 시간대의 다른 날짜와 불량률을 비교한다. 계산은 core가 맡고 `compare_lines`는 라인 비교로 유지한다. 표시 단계에서 비율·%·%p 단위를 보존한다.
- **오류는 복구할 수 있게 안내한다.** core 실패와 SDK 입력 검증 실패는 `isError: true`, 없는 도구 호출은 프로토콜 오류다. core 실패는 가능한 경우 근거 번호와 복구 안내를 유지한다. SDK가 거절한 입력은 core에 도달하지 않아 감사 기록이 없고, core로 전달한 작업은 감사 기록을 한 번만 시도한다. 감사 저장 실패의 근거 번호는 `null`이며 가짜 번호를 만들지 않는다.
- **수치와 상세 내역.** JSON은 정확한 계산값을 유지하고 요약 표시만 반올림한다. 비율·%·%p 단위를 명시하며 현재·비교 기간 누락 상태를 보존한다. 각 배열은 최대 60개로 제한하고 `truncated`에 경로·전체·표시 건수를 넣는다. 더 자세한 내역은 조건을 좁혀 다시 조회한다. 요약+JSON 텍스트와 같은 내용의 `structuredContent`를 제공한다.

---

## 도구: 크게 묶은 버전 (기본)

### 목적
기본으로 사용할 MCP 입구 4개다. 내부 계산은 Phase 3 함수를 재사용한다. 자세한 함수 연결은 위 영어 섹션 표와 같다.

| 도구 | 기능 선택(`mode`) | 하는 일 |
|---|---|---|
| `get_line_info` | 없음 | 라인별 제품과 표준 생산량 |
| `query_production` | `production`, `defects`, `downtime` | 생산량·목표·달성률·라인별 실적·기간 비교 / 불량 / 비가동 조회 |
| `analyze_production` | `shortfall`, `hourly_pattern`, `anomalies` | 미달 손실 분해 / 시간대 패턴 / 이상 징후 |
| `preview_issue` | 없음 | 근거를 가진 초안 생성, operator 전용 |

### 설계 결정 사항
- **4개 도구와 기능별 입력 검증.** 공통 입력은 `period`, `lineIds`, `hours`, `shift`, `crew`, `excludeDates`다. 생산량만 `compareTo`·`grain`, 불량만 `compareTo`·`comparisonExcludeDates`, 비가동만 `window`, 시간대 패턴만 `splitBy`를 받는다. 맞지 않는 조건은 무시하지 않고 오류로 돌려준다.
- **기본값은 `--toolset coarse`.** `--toolset fine`일 때만 기존 10개를 노출한다. 두 버전 모두 `descriptions.ts`와 기존 core를 사용하며 계산이나 감사 기록을 중복 구현하지 않는다.
- **결과와 주의사항 유지.** 계산값·실제 기간·누락 상태·근거 번호·권한은 같다. 제품과 표준 생산량이 다른 라인을 수량만으로 순위 매기지 않도록 생산량 응답에 안내한다.
- **복합 질문은 여러 호출을 조합한다.** “L1의 어제 실적과 생산 제품”은 `query_production`과 `get_line_info`를 호출하고 클라이언트 AI가 합친다. 서버에 별도 에이전트나 하네스 루프를 추가하지 않는다.
- **안전 성질은 같다.** 확정 도구가 없고, 메모를 같은 방식으로 감싸고, 작업자 필드가 없다.

---

## 리소스와 프롬프트

### 목적
Claude에게 참고 자료와 메뉴 템플릿 2개를 준다 (기획서 3-1).

### 핵심 클래스 / 구조
위 영어 섹션 표와 동일.

### 설계 결정 사항
- **리소스 3개는 문서 파일, 1개는 DB에서 읽는다** (설계서 3-7). 이상 판단 기준 문서가 `criteria.ts`와 같은지 테스트로 확인한다.
- **프롬프트는 템플릿일 뿐이다.** 스스로 도구를 부르지 않고, 모든 수치는 여전히 도구 호출에서 나온다.
- **리소스는 클라이언트가 선택해 읽는다.** 등록만으로 자동으로 읽히지 않는다. 자료와 템플릿 조회는 생산 조회·초안·감사 기록을 만들지 않는다. 데이터 안내 끝에 현재 연결한 DB의 기준 시각·범위·생성본을 붙인다.
- **템플릿도 선택한 도구 세트를 따른다.** 일일 브리핑은 데이터 기준 어제 전체 라인, 라인별 분석은 L1~L6 인자를 받는다. 대화에 기간이 없거나 모호하면 먼저 물어보도록 안내한다.

### 사용 예시
위 영어 섹션 코드와 동일.

---

## Phase 4 스킬 범용/전용 분류

| 스킬 | 분류 | 이유 |
|---|---|---|
| stdio 진입점, 실행 설정, 메모리 안 MCP 테스트 | 범용 | 표준 MCP 서버 뼈대 |
| 도구, 설명, 리소스, 프롬프트, 크게 묶은 버전 | 전용 | 이 도메인의 도구와 표현 |

---

## 선행 조건 및 의존성
- Phase 3 서버 로직 함수.
- 첫 도구 설명을 쓰기 전에 Phase 2 평가 시나리오가 동결되어 있어야 한다.
- npm: 안정 버전 v2 `@modelcontextprotocol/server` 2.3.1, 통합 테스트·데모용 `@modelcontextprotocol/client` 2.3.1 (버전 고정).
- 수동 확인용 Claude Code, Claude 데스크톱.

---

## 개발 시 주의사항
- **자동 검증 완료 기준:**
  - MCP 목록에 기본 도구 4개(fine은 10개), 리소스 4개, 프롬프트 2개가 있고 `confirm_issue`는 없다.
  - 통합 테스트가 통과한다.
    - 도구 목록에 확정 도구가 없음
    - 도구별 정상 경로와 상태 응답
    - 조회 전용 역할의 `preview_issue` 거부
    - 기간 밖 안내 문구
    - 모든 응답에 작업자 ID 패턴이 없음
    - 메모 감싸기
- **수동 확인은 개발용 시나리오 D01~D10으로만 한다.** 여기서 평가용 시나리오를 시험하지 않는다.
- **확정한 결정:** 기본 도구 4개, 비교용 세부 도구 10개. 하네스는 기획에만 유지한다.
- **남은 수동 확인:** 실제 Claude 클라이언트의 목록·화면과 D01~D10 자연어 대화. 이를 통과했다고 기록하지 않는다. 클라이언트마다 특히 리소스·프롬프트 메뉴 지원이 다를 수 있다.
- **연결 방법:** [docs/MCP_SETUP.md](../docs/MCP_SETUP.md)에 빌드·복사·설정 생성·MCP 데모를 설명했다. Phase 7의 `docs/INSTALL.md`에서 통합할 수 있다.

### 검증 기록 — 2026-10-23

| 검사 | 결과 |
|---|---|
| `npm run check` | 통과: 타입 검사, 12개 파일의 테스트 157개, 빌드 |
| `npx vitest run tests/server` | 통과: 신규 MCP 테스트 43개, 파일 3개 |
| `npm run scenarios:check` | 통과: 평가용 30개·개발용 10개 동결, 생성본과 시나리오 해시 유지 |
| 빌드된 stdio `mcp:demo` (coarse/fine, 기본 D01 조회) | 통과: 도구 4/10개, 리소스 4개, 프롬프트 2개, 실제 조회·자료·템플릿 응답, stderr 없음 |
| `db:copy`, `mcp:config` | 통과: 실행용 DB·표시 파일과 절대 경로 JSON 생성 |
| 자연어 답변 품질·Desktop 화면 | 미실행: 수동 클라이언트 확인·Phase 5 평가 대상 |

모든 세부 도구·묶음 모드, 두 버전의 동일 수치, 어제·상대 주·한 달·최근 4/5주·특정 요일, 상태 6가지, 모드별 입력 거절, SQL 삽입 형태의 입력 거절, 권한·근거 범위·메모 보호, 작업당 core 감사 1회, 전체 합계와 상세 생략 표시, 원본 DB 보호, 다른 작업 폴더에서의 stdio 연결을 검사했다. SQL은 기존 Phase 3의 매개변수 바인딩 코드를 그대로 사용한다.

확인용 로컬 결과(깃 제외): `logs/test-results/phase4-20261023/report.html`, `mcp-coarse.json`, `mcp-fine.json`. 데모는 임시 복사본을 쓰며 모델을 호출하지 않는다. 동결 평가 질문을 AI에 보내거나 도구 설명 튜닝에 쓰지 않았다. 하네스는 계속 기획에만 둔다.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-21 | 최초 작성 |
| 2026-10-23 | 공통 기능을 묶은 기본 도구 4개, 기능별 조건 검증과 비교용 10개 구성을 확정. 안정 MCP SDK v2로 구현·테스트 시작. |
| 2026-10-23 | 묶음·세부 stdio 도구, 자료·템플릿, 실행용 복사본 보호, 응답 포맷, 연결·데모·설정 명령과 테스트 43개 구현. 전체 157개·빌드 통과. Desktop·모델 확인은 별도 미실행으로 기록. |
| 2026-10-23 | 동결한 Phase 2의 대상·지표 기본값과 기간 비교 요구사항을 도구 입력 계획에 반영. 도구 설명과 서버 코드는 미구현 유지. |
| 2026-10-23 | 완료한 Phase 3 호출 경로·일반 기간 스키마·불량 비교·실행용 스키마 변경을 연결하고 감사 중복을 방지하도록 계획 갱신. MCP 구현은 미착수 유지. |
