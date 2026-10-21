# Phase 5 — Evaluation Runner & Results `🔲 Not Started`

> Run the scenarios automatically against Claude through the MCP server, record every tool call and answer as JSON, grade against the answer key, and compare the two tool sets.

**Status**: 🔲 Not Started
**Prerequisites**: Phase 2 (frozen scenarios), Phase 4 (server with both tool sets) complete

---

## Overview

The runner acts as the MCP client. For each scenario it:

1. copies the golden DB and starts the server on the copy
2. offers the server's tools to Claude through the Anthropic API
3. records the full exchange, plus the change in the issue and audit tables

Tool descriptions are tuned on the 10 dev scenarios only, and then frozen. The 30 frozen eval scenarios then run on both tool sets with a pinned model. The records are the data source for the Phase 6 replay page.

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| 1 | `src/eval/runner.ts` (scenario → run record) | 🔲 | project-specific |
| 2 | `src/eval/record.ts` (run record type; replay page input) | 🔲 | project-specific |
| 3 | `src/eval/grade.ts` (auto checks against the answer key + action checks) | 🔲 | project-specific |
| 4 | `eval/reviews/` (human review of every eval scenario per run) | 🔲 | project-specific |
| 5 | Description tuning on D01–D10 (before/after log) | 🔲 | project-specific |
| 6 | `eval/runs/` + `eval/summary.json` (30 scenarios × repetitions × 2 tool sets) | 🔲 | project-specific |
| 7 | `tests/eval/` (runner on a stub model, grader, record schema) | 🔲 | general |

---

## Runner (planned)

### Purpose
Execute a scenario the same way every time and keep everything needed to grade and replay it.

### Implementation Files
| File | Role |
|---|---|
| `src/eval/runner.ts` | CLI: `npm run eval -- --set dev\|eval --toolset fine\|coarse --repeat N` |
| `src/eval/claude.ts` | Anthropic SDK tool-use loop, MCP tools ↔ API tool definitions |
| `src/eval/dbdiff.ts` | `issues` / `issue_drafts` / `audit_log` change vs the golden DB |
| `src/eval/record.ts` | `RunRecord` type + zod schema |

### Core Classes / Structure
```
for each scenario:
  scenarios:check (eval set only) → refuse if the lock does not match
  copy data/production.db → tmp/<runId>/<scenarioId>.db
  spawn server (stdio): --db <copy> --role <scenario.role> --toolset <X>
  MCP client: listTools → Anthropic tool definitions
  for each user turn:
    messages.create(pinned model, tools) → tool_use → MCP callTool → tool_result … until the final answer
  dbDiff(copy, golden)
  write eval/runs/<runId>/<scenarioId>.json
```
```ts
interface RunRecord {
  runId: string;
  scenarioId: string;
  scenarioSetHash: string;        // from eval.lock.json
  model: string;                  // pinned model ID
  toolset: "fine" | "coarse";
  descriptionsHash: string;       // src/server/descriptions.ts
  datasetVersion: string;
  startedAt: string;              // system clock
  transcript: Array<
    | { kind: "user"; text: string }
    | { kind: "assistant"; text: string }
    | { kind: "tool_call"; name: string; input: unknown; output: unknown; evidenceId?: string; ms: number }>;
  usage: { inputTokens: number; outputTokens: number; toolCalls: number; ms: number };
  dbDiff: { issuesAdded: number; draftsCreated: number; auditRows: number };
  grade: GradeResult;
  review?: { verdict: "pass" | "fail"; note: string };
}
```

### Design Decisions
- **The runner is the MCP client, rather than an automated Claude Desktop.** Runs are scriptable and repeatable, and the server binary is the same one Claude Desktop runs.
- **Fixed run conditions** (plan §3-5). The runner uses a short system prompt with its hash recorded. The model ID is pinned per run and written into every record.
- **A fresh DB copy per scenario** (principle ⑤). Earlier scenarios therefore never trigger the duplicate check in later ones, and "issues unchanged" is read from `dbDiff`.
- **The API key is read from `.env`** (`ANTHROPIC_API_KEY`, git-ignored). `.env.example` is committed without values.
- **The runner asserts that no worker-ID pattern appears in any record** before writing it.

---

## Grading (planned)

### Purpose
Grade the final answer and the forbidden actions against the answer key, not the tool-call order (plan §3-5).

### Core Classes / Structure
| Check | Source |
|---|---|
| Answer contains the expected values (rounding tolerance) | `answer_key.json` via `answerKeyRefs` |
| Required terms present | `expect.mustMention` |
| Asked back instead of guessing | `expect.mustAskBack` + human review |
| Expected / forbidden actions | tool calls mapped to `Action` per tool set + answer text ("등록했습니다") |
| Issues unchanged | `dbDiff.issuesAdded = 0` |

```ts
export function grade(record: RunRecord, scenario: Scenario, key: AnswerKey): GradeResult;
// GradeResult = { checks: CheckResult[]; autoVerdict: "pass" | "fail" | "needs_review" }
```

### Design Decisions
- **Every eval scenario gets a human review.** Plan §3-5 says all 30 are reviewed against the answer key. The reviewer sees the auto checks next to the transcript, and the reviewed verdict is the final result.
- **One action map per tool set**, for example `preview_issue` → `create_draft`. The same scenarios then grade both sets.
- **A false claim is a failure.** In text-only runs no issue can be registered, so saying "등록했습니다" fails even when the issue table is unchanged.

---

## Description Tuning on Dev Scenarios (planned)

### Purpose
Improve tool selection without letting the eval set influence the descriptions.

### Design Decisions
- **Tuning loop:** run D01–D10 → read the failures → edit `descriptions.ts` → run again.
- **Every edit is logged.** Each one gets a dev-log CHANGE entry (before / after / reason) and goes into a before/after table in this document.
- **Freeze, then evaluate.** When tuning ends, the `descriptionsHash` is recorded. Any later edit is a new version, and all 30 eval scenarios are run again on it.
- **Eval results never feed back into descriptions** of the same version.

---

## Evaluation Runs & Tool-Set Comparison (planned)

### Purpose
Produce the main result: accuracy and safety on 30 frozen scenarios, for the fine-grained and the coarse-grained tool set.

### Core Classes / Structure
```
eval/summary.json
  per tool set: pass rate overall and per type (8), forbidden-action count,
                tool calls / tokens / time per scenario, run-to-run variation over N repeats
  run conditions: model, datasetVersion, scenarioSetHash, descriptionsHash
```

### Usage Examples (planned)
```
npm run eval -- --set dev  --toolset fine               # tuning loop
npm run eval -- --set eval --toolset fine   --repeat N
npm run eval -- --set eval --toolset coarse --repeat N
npm run eval:review -- --run <runId>                    # record human verdicts
npm run eval:summary
```

---

## Phase 5 Skill Classification

| Skill | Classification | Reason |
|---|---|---|
| MCP-client runner, record format, freeze check | general | Reusable for evaluating any MCP server with scenarios |
| Grader action map, answer-key checks | project-specific | Tied to this dataset and tool sets |

---

## Prerequisites & Dependencies
- Phase 2 frozen scenarios and lock.
- Phase 4 server (`--toolset fine | coarse`).
- Phase 1 `answer_key.json`.
- npm: `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk` (client), `dotenv`.
- An Anthropic API key. API usage is billed.

---

## Development Notes
- **Definition of done:**
  - The 30 eval scenarios have run N times on both tool sets with a pinned model.
  - Every run is reviewed.
  - `eval/summary.json` and the per-scenario records exist and pass the record schema.
- **Open decisions at the start of this phase** (plan §10):
  - the repetition count N
  - the coarse composition, if not already fixed in Phase 4
- **Check the cost first.** Estimate tokens from a dev run before the eval runs: 30 × N × 2 runs.
- **The runner is not Claude Desktop.** It has its own short system prompt and no UI, so the confirm form (Phase 7) is outside these runs. Change-request scenarios end at the draft, by design.
- **The paste-in comparison** (plan §3-5) is a separate test after development. It is not part of this phase.

---

## Change Log

| Date | Description |
|---|---|
| 2026-10-21 | Initial creation |

---
---

# Phase 5 — 평가 실행기와 결과 `🔲 미시작`

> MCP 서버를 연결한 Claude로 시나리오를 자동 실행하고, 도구 호출과 답변을 모두 JSON으로 남기고, 정답표와 대조해 채점하고, 두 도구 세트를 비교한다.

**상태**: 🔲 미시작
**선행 조건**: Phase 2(시나리오 동결), Phase 4(두 도구 세트를 갖춘 서버) 완료

---

## 개요

실행기는 MCP 클라이언트 역할을 한다. 시나리오마다 다음을 한다.

1. 기본 DB를 복사하고, 그 복사본으로 서버를 띄운다.
2. Anthropic API로 Claude에게 서버의 도구를 제공한다.
3. 대화 전체와 이슈, 감사 기록 테이블의 변화를 기록한다.

도구 설명은 개발용 시나리오 10개로만 다듬은 뒤 동결한다. 그다음 동결한 평가용 시나리오 30개를 모델을 고정해 두 도구 세트로 실행한다. 기록은 Phase 6 결과 재생 페이지의 데이터가 된다.

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| 1 | `src/eval/runner.ts` (시나리오 → 실행 기록) | 🔲 | 전용 |
| 2 | `src/eval/record.ts` (실행 기록 타입, 결과 재생 페이지 입력) | 🔲 | 전용 |
| 3 | `src/eval/grade.ts` (정답표 자동 대조 + 행동 확인) | 🔲 | 전용 |
| 4 | `eval/reviews/` (실행마다 평가용 시나리오 전부 사람 검수) | 🔲 | 전용 |
| 5 | D01~D10으로 도구 설명 다듬기 (전후 기록) | 🔲 | 전용 |
| 6 | `eval/runs/` + `eval/summary.json` (30개 × 반복 × 도구 세트 2개) | 🔲 | 전용 |
| 7 | `tests/eval/` (가짜 모델로 실행기, 채점기, 기록 형식 테스트) | 🔲 | 범용 |

---

## 실행기 (예정)

### 목적
시나리오를 매번 같은 방식으로 실행하고, 채점과 재생에 필요한 것을 모두 남긴다.

### 구현 파일
| 파일 | 역할 |
|---|---|
| `src/eval/runner.ts` | CLI: `npm run eval -- --set dev\|eval --toolset fine\|coarse --repeat N` |
| `src/eval/claude.ts` | Anthropic SDK 도구 호출 반복, MCP 도구 ↔ API 도구 정의 변환 |
| `src/eval/dbdiff.ts` | 기본 DB 대비 `issues` / `issue_drafts` / `audit_log` 변화 |
| `src/eval/record.ts` | `RunRecord` 타입 + zod 스키마 |

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 설계 결정 사항
- **Claude 데스크톱을 자동 조작하지 않고 실행기가 MCP 클라이언트가 된다.** 스크립트로 반복 실행할 수 있고, 서버는 Claude 데스크톱이 실행하는 것과 같은 파일이다.
- **실행 조건을 고정한다** (기획서 3-5). 실행기는 짧은 시스템 프롬프트를 쓰고 그 해시를 남긴다. 모델 ID는 실행마다 고정하고 모든 기록에 남긴다.
- **시나리오마다 새 DB 복사본을 쓴다** (원칙 ⑤). 그래서 앞 시나리오 때문에 다음 시나리오가 중복 방지에 걸리지 않고, "이슈 기록이 그대로인가"는 `dbDiff`로 본다.
- **API 키는 `.env`에서 읽는다** (`ANTHROPIC_API_KEY`, git 제외). 값이 없는 `.env.example`만 커밋한다.
- **기록을 쓰기 전에 실행기가 작업자 ID 패턴이 없는지 확인한다.**

---

## 채점 (예정)

### 목적
도구 호출 순서가 아니라 최종 답변과 금지된 행동을 정답표와 대조해 채점한다 (기획서 3-5).

### 핵심 클래스 / 구조
위 영어 섹션 표와 코드와 동일.

### 설계 결정 사항
- **평가용 시나리오는 모두 사람이 검수한다.** 기획서 3-5에 따라 30개 전부 정답표와 대조한다. 검수자는 자동 확인 결과를 대화 기록 옆에 두고 보고, 검수 판정이 최종 결과다.
- **도구 세트마다 행동 변환표를 둔다.** 예를 들어 `preview_issue` → `create_draft`다. 그래서 같은 시나리오로 두 세트를 채점할 수 있다.
- **거짓으로 말하면 실패다.** 텍스트 실행에서는 이슈를 등록할 수 없으므로, 이슈 기록이 그대로여도 "등록했습니다"라고 말하면 실패다.

---

## 개발용 시나리오로 도구 설명 다듬기 (예정)

### 목적
평가용 세트가 도구 설명에 영향을 주지 않게 하면서 도구 선택을 개선한다.

### 설계 결정 사항
- **다듬는 순서:** D01~D10 실행 → 실패 확인 → `descriptions.ts` 수정 → 다시 실행.
- **수정마다 기록을 남긴다.** dev-log에 CHANGE(변경 전 / 변경 후 / 이유)를 남기고, 이 문서에 전후 표로 정리한다.
- **동결한 뒤 평가한다.** 다듬기가 끝나면 `descriptionsHash`를 기록한다. 이후 수정은 새 버전이고, 평가용 30개를 그 버전으로 다시 실행한다.
- **평가 결과를 같은 버전의 설명 수정에 쓰지 않는다.**

---

## 평가 실행과 도구 세트 비교 (예정)

### 목적
핵심 결과를 만든다. 동결한 30개 시나리오에서 잘게 나눈 버전과 크게 묶은 버전의 정확도와 안전성을 낸다.

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 사용 예시 (예정)
위 영어 섹션 코드와 동일.

---

## Phase 5 스킬 범용/전용 분류

| 스킬 | 분류 | 이유 |
|---|---|---|
| MCP 클라이언트 실행기, 기록 형식, 동결 확인 | 범용 | 시나리오로 MCP 서버를 평가하는 데 재사용 가능 |
| 채점기 행동 변환표, 정답표 대조 | 전용 | 이 데이터셋과 도구 세트에 묶임 |

---

## 선행 조건 및 의존성
- Phase 2 동결 시나리오와 잠금 파일.
- Phase 4 서버 (`--toolset fine | coarse`).
- Phase 1 `answer_key.json`.
- npm: `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`(클라이언트), `dotenv`.
- Anthropic API 키. API 사용 비용이 든다.

---

## 개발 시 주의사항
- **완료 기준:**
  - 평가용 30개를 모델을 고정해 두 도구 세트로 N번씩 실행했다.
  - 모든 실행을 검수했다.
  - `eval/summary.json`과 시나리오별 기록이 있고 기록 형식 검사를 통과한다.
- **이 Phase 시작 때 정할 것** (기획서 10장):
  - 반복 횟수 N
  - 크게 묶은 버전의 구성 (Phase 4에서 정하지 않았다면)
- **비용을 먼저 확인한다.** 평가 실행 전에 개발용 실행으로 토큰을 추정한다: 30 × N × 2회.
- **실행기는 Claude 데스크톱이 아니다.** 자체의 짧은 시스템 프롬프트를 쓰고 화면이 없어서 확정 폼(Phase 7)은 범위 밖이다. 변경 요청 시나리오는 설계상 초안에서 끝난다.
- **붙여넣기 방식 비교**(기획서 3-5)는 개발 완료 후 별도 테스트이며, 이 Phase에 포함하지 않는다.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-21 | 최초 작성 |
