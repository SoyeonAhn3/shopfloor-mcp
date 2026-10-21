# Phase 4 — MCP Server (Tools, Resources, Prompts) `🔲 Not Started`

> Expose the core logic to Claude over local stdio MCP: 10 Claude-callable tools, 4 resources and 2 prompts, in a fine-grained and a coarse-grained tool set.

**Status**: 🔲 Not Started
**Prerequisites**: Phase 3 complete (core logic and tests)

---

## Overview

Phase 4 wraps the Phase 3 functions as MCP tools.

- **Tools.** English names, Korean descriptions. Every response is summary-first, with an evidence ID and the data-as-of time.
- **Clients.** The server is registered in Claude Code (quick text checks) and Claude Desktop.
- **Confirm tool.** `confirm_issue` is not registered in this phase, because stage 1 is text-only. Previews stop at "draft created".
- **Coarse tool set.** A coarse-grained set is built alongside for the Phase 5 comparison.

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| 1 | `src/server/index.ts` (stdio entry, launch config) | 🔲 | general |
| 2 | `src/server/tools/` (10 tools, fine-grained set) | 🔲 | project-specific |
| 3 | `src/server/toolsets/coarse.ts` (coarse-grained set) | 🔲 | project-specific |
| 4 | `src/server/descriptions.ts` (all tool descriptions, Korean) | 🔲 | project-specific |
| 5 | `src/server/resources.ts` + `resources/*.md` (4 resources) | 🔲 | project-specific |
| 6 | `src/server/prompts.ts` (2 prompts) | 🔲 | project-specific |
| 7 | `src/server/format.ts` (summary-first response, Korean labels, recoverable errors) | 🔲 | project-specific |
| 8 | `tests/server/` (in-memory MCP client integration tests) | 🔲 | general |

---

## Server Entry & Launch Config (planned)

### Purpose
Start the server as a local process that Claude Desktop or Claude Code launches. All settings come from launch arguments; there is no login.

### Core Classes / Structure
```ts
// src/server/index.ts
const config = parseLaunchConfig(process.argv);
// { dbPath, role: "viewer" | "operator", userName, toolset: "fine" | "coarse" }
const server = new McpServer({ name: "shopfloor-mcp", version });
registerTools(server, config, core);
registerResources(server, core);
registerPrompts(server);
await server.connect(new StdioServerTransport());
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
- **The server opens a copy** (`data/run/`), never `data/production.db` itself, because drafts and audit rows are written. `npm run db:copy` makes a fresh copy.
- **Role and user name come from the launch config** (plan §3-3). Switching role means editing the client config and restarting.

---

## Tools — Fine-grained Set (planned)

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
  items: unknown[];                // key rows only, capped
  evidenceId: string;              // "Q-0003"
  dataAsOf: string;                // "2026-10-01T08:00"
  resolvedRange?: { from: string; to: string; label: string };
  referenceData?: MemoField[];     // wrapped memos
}
// returned as an MCP text content block: summary line, then the JSON body
```

### Design Decisions
- **English names, Korean descriptions** (plan §3-1). The descriptions use shop-floor terms (비가동, 계획 정지, 교대 시간), so the user's wording matches them.
- **All descriptions live in `descriptions.ts`.** It is the tuning surface for Phase 5 dev scenarios. Changes show up as one diff, and the file hash is written into every run record.
- **The tool layer holds no business logic.** It validates input, calls core inside `audited()`, and formats the result.
- **Errors are recoverable.** Errors set `isError: true` and say what failed and what is possible: valid line IDs, the available range, or which role is required.

---

## Tools — Coarse-grained Set (planned)

### Purpose
Provide the second design for the plan §3-5 comparison, built from the same core functions.

### Design Decisions
- **Fewer tools with a mode or metric parameter**, for example one query tool, one analysis tool, and `preview_issue`. The final composition is decided at the start of this phase (plan §10, open item) and recorded in the change log.
- **Selected with `--toolset coarse`.** Its descriptions also live in `descriptions.ts`.
- **Same safety properties.** The coarse set never includes a confirm tool, wraps memos the same way, and returns no worker fields.

---

## Resources & Prompts (planned)

### Purpose
Give Claude reference material and two menu templates (plan §3-1).

### Core Classes / Structure
| Resource URI | Source |
|---|---|
| `shopfloor://lines` | `lines` table (product, standard rate) |
| `shopfloor://glossary` | `resources/glossary.md`: 비가동, 계획 정지, 교대 시간, 생산일 |
| `shopfloor://anomaly-criteria` | `resources/anomaly-criteria.md`: same values as `src/core/criteria.ts` |
| `shopfloor://data-guide` | `resources/data-guide.md`: shift system, production day start, reference time, available range |

| Prompt | Argument | Flow |
|---|---|---|
| `daily_briefing` (일일 생산 브리핑) | none | All lines, yesterday: target vs actual → lowest lines → evidence IDs |
| `line_root_cause` (라인별 원인 분석) | `line` | Shortfall breakdown → hourly pattern → recurring cause |

### Design Decisions
- **Three resources are document files and one comes from the DB** (dataset design §3-7). A test checks that the anomaly-criteria document matches `criteria.ts`.
- **Prompts are templates only.** They never call tools themselves, and every number still comes from tool calls.

### Usage Examples (planned)
```
# Claude Code: quick text check
claude mcp add shopfloor -- node dist/server/index.js --db data/run/production.db --role operator --user dev

> 어제 4라인 달성률 알려줘
  → get_target_vs_actual { lineIds: ["L4"], period: { kind: "yesterday" } }
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
- npm: `@modelcontextprotocol/sdk` (version pinned).
- Claude Code and Claude Desktop for manual checks.

---

## Development Notes
- **Definition of done:**
  - Claude Desktop lists 10 tools, 4 resources and 2 prompts, and no `confirm_issue`.
  - The integration tests pass:
    - the tool list excludes confirm
    - each tool's normal path and status cases work
    - a viewer is denied on `preview_issue`
    - the out-of-range message appears
    - no worker-ID pattern appears in any response
    - memos are wrapped
- **Manual checks use dev scenarios D01–D10 only.** Do not try eval scenarios here.
- **Open decision at the start of this phase:** the composition of the coarse-grained set.
- **The registration steps** for Claude Desktop and Claude Code written here are the draft for `docs/INSTALL.md` in Phase 7.

---

## Change Log

| Date | Description |
|---|---|
| 2026-10-21 | Initial creation |

---
---

# Phase 4 — MCP 서버 (도구, 리소스, 프롬프트) `🔲 미시작`

> 로컬 stdio MCP로 서버 로직을 Claude에게 연결한다. Claude가 부르는 도구 10개, 리소스 4개, 프롬프트 2개를 잘게 나눈 버전과 크게 묶은 버전으로 만든다.

**상태**: 🔲 미시작
**선행 조건**: Phase 3 완료 (서버 로직과 테스트)

---

## 개요

Phase 4는 Phase 3 함수를 MCP 도구로 감싼다.

- **도구.** 이름은 영어, 설명은 한국어다. 모든 응답은 요약을 먼저 주고 근거 번호와 데이터 기준 시각을 붙인다.
- **클라이언트.** Claude Code(빠른 텍스트 확인)와 Claude 데스크톱에 서버를 등록한다.
- **확정 도구.** 1단계는 텍스트로만 진행하므로 이 Phase에서는 `confirm_issue`를 등록하지 않는다. 미리보기는 "초안 생성됨"에서 멈춘다.
- **크게 묶은 버전.** Phase 5 비교를 위해 크게 묶은 도구 세트를 함께 만든다.

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| 1 | `src/server/index.ts` (stdio 진입점, 실행 설정) | 🔲 | 범용 |
| 2 | `src/server/tools/` (도구 10개, 잘게 나눈 버전) | 🔲 | 전용 |
| 3 | `src/server/toolsets/coarse.ts` (크게 묶은 버전) | 🔲 | 전용 |
| 4 | `src/server/descriptions.ts` (도구 설명 전체, 한국어) | 🔲 | 전용 |
| 5 | `src/server/resources.ts` + `resources/*.md` (리소스 4개) | 🔲 | 전용 |
| 6 | `src/server/prompts.ts` (프롬프트 2개) | 🔲 | 전용 |
| 7 | `src/server/format.ts` (요약 우선 응답, 한국어 표시, 복구 가능한 오류) | 🔲 | 전용 |
| 8 | `tests/server/` (메모리 안 MCP 클라이언트 통합 테스트) | 🔲 | 범용 |

---

## 서버 진입점과 실행 설정 (예정)

### 목적
Claude 데스크톱이나 Claude Code가 실행하는 로컬 프로세스로 서버를 띄운다. 설정은 모두 실행 인자로 받고, 로그인은 없다.

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일 (진입점 코드와 Claude 데스크톱 설정 예시).

### 설계 결정 사항
- **stdout에는 MCP 메시지만 보낸다.** stdio 연결이므로 로그와 디버그 출력은 stderr로 보낸다.
- **서버는 복사본(`data/run/`)을 연다.** 초안과 감사 기록을 쓰므로 `data/production.db` 원본은 열지 않는다. `npm run db:copy`로 새 복사본을 만든다.
- **역할과 사용자 이름은 실행 설정에서 정한다** (기획서 3-3). 역할을 바꾸려면 클라이언트 설정을 고치고 다시 시작한다.

---

## 도구: 잘게 나눈 버전 (예정)

### 목적
기획서 3-1의 도구를 서버 로직 함수 하나씩에 연결하고, 입력은 zod로 검증한다.

### 핵심 클래스 / 구조
위 영어 섹션 표와 코드와 동일 (`confirm_issue`는 사람 버튼 전용이며 Phase 7 전까지 등록하지 않음).

### 설계 결정 사항
- **이름은 영어, 설명은 한국어다** (기획서 3-1). 설명에 현장 용어(비가동, 계획 정지, 교대 시간)를 써서 사용자의 표현과 맞물리게 한다.
- **도구 설명은 모두 `descriptions.ts` 한 파일에 둔다.** Phase 5에서 개발용 시나리오로 다듬는 대상이다. 바뀐 내용이 diff 하나로 보이고, 파일 해시를 실행 기록마다 남긴다.
- **도구 계층에는 업무 규칙이 없다.** 입력을 검증하고, `audited()` 안에서 core를 부르고, 결과를 포맷하기만 한다.
- **오류는 복구할 수 있게 안내한다.** `isError: true`와 함께 무엇이 잘못됐는지, 무엇이 가능한지(올바른 라인 ID, 조회 가능 범위, 필요한 역할)를 알려준다.

---

## 도구: 크게 묶은 버전 (예정)

### 목적
기획서 3-5 비교를 위한 두 번째 설계다. 같은 서버 로직 함수로 만든다.

### 설계 결정 사항
- **도구 수를 줄이고 모드나 지표 인자를 둔다.** 예를 들면 조회 도구 하나, 분석 도구 하나, `preview_issue`다. 최종 구성은 이 Phase를 시작할 때 정하고(기획서 10장 남은 것) 변경 이력에 남긴다.
- **`--toolset coarse`로 고른다.** 설명은 이 버전도 `descriptions.ts`에 둔다.
- **안전 성질은 같다.** 확정 도구가 없고, 메모를 같은 방식으로 감싸고, 작업자 필드가 없다.

---

## 리소스와 프롬프트 (예정)

### 목적
Claude에게 참고 자료와 메뉴 템플릿 2개를 준다 (기획서 3-1).

### 핵심 클래스 / 구조
위 영어 섹션 표와 동일.

### 설계 결정 사항
- **리소스 3개는 문서 파일, 1개는 DB에서 읽는다** (설계서 3-7). 이상 판단 기준 문서가 `criteria.ts`와 같은지 테스트로 확인한다.
- **프롬프트는 템플릿일 뿐이다.** 스스로 도구를 부르지 않고, 모든 수치는 여전히 도구 호출에서 나온다.

### 사용 예시 (예정)
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
- npm: `@modelcontextprotocol/sdk` (버전 고정).
- 수동 확인용 Claude Code, Claude 데스크톱.

---

## 개발 시 주의사항
- **완료 기준:**
  - Claude 데스크톱에 도구 10개, 리소스 4개, 프롬프트 2개가 보이고 `confirm_issue`는 보이지 않는다.
  - 통합 테스트가 통과한다.
    - 도구 목록에 확정 도구가 없음
    - 도구별 정상 경로와 상태 응답
    - 조회 전용 역할의 `preview_issue` 거부
    - 기간 밖 안내 문구
    - 모든 응답에 작업자 ID 패턴이 없음
    - 메모 감싸기
- **수동 확인은 개발용 시나리오 D01~D10으로만 한다.** 여기서 평가용 시나리오를 시험하지 않는다.
- **이 Phase 시작 때 정할 것:** 크게 묶은 버전의 도구 구성.
- **Claude 데스크톱과 Claude Code 등록 방법**은 여기서 쓰고, Phase 7 `docs/INSTALL.md`의 초안으로 쓴다.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-21 | 최초 작성 |
