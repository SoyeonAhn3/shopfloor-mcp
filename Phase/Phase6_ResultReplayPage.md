# Phase 6 — Result Replay Page `🔲 Not Started`

> Build a static page that reads the evaluation records and shows, for each scenario, the question, tool calls, server responses, answer and grading. It can be shared by link and makes no AI calls.

**Status**: 🔲 Not Started
**Prerequisites**: Phase 5 complete (run records, `eval/summary.json`)

---

## Overview

The replay page is the default way to show results (plan §6). It turns the Phase 5 JSON records into three views:

- a results table for the 30 eval scenarios
- a step-by-step detail view per scenario
- the tool-set comparison

The page is published on GitHub Pages. It calls no AI, needs no API key, has no backend, and needs no login. The demo video section is filled in Phase 7.

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| 1 | `site/index.html` + `site/src/*.ts` → `site/dist/` (three views) | 🔲 | project-specific |
| 2 | `scripts/build-site-data.ts` (`npm run site:data`: eval records → `site/data/*.json`) | 🔲 | project-specific |
| 3 | GitHub Pages publishing (method decided at publish time) | 🔲 | general |
| 4 | `tests/site/` (data build, safe text rendering) | 🔲 | general |

---

## Replay Page (planned)

### Purpose
Let a visitor check, without running anything, that Claude's numbers came from the server and that forbidden actions did not happen.

### Implementation Files
| File | Role |
|---|---|
| `site/index.html` | Page shell, navigation |
| `site/src/results.ts` | Results table: S01–S30 × tool set, pass/fail, forbidden actions, tool calls |
| `site/src/scenario.ts` | Detail view: question → tool sequence → response summary → final answer → answer-key comparison → review note |
| `site/src/compare.ts` | Fine vs coarse comparison per scenario type |
| `site/src/render.ts` | DOM helpers (text-only rendering) |
| `site/style.css` | Layout, works at phone width |

### Core Classes / Structure
```
index
  header: dataset version · model · scenario set hash · descriptions hash
  ├─ Results table   S01–S30 × {fine, coarse}: verdict, forbidden action, tool calls, tokens
  ├─ Scenario detail question → tool calls (name, input, response summary, evidence ID)
  │                  → final answer → answer-key values side by side → review note
  ├─ Comparison      pass rate per type, forbidden actions, tool calls / tokens per scenario
  └─ Demo video      (Phase 7)
```
```ts
// site data is built from the Phase 5 type, so a record-format change fails compilation
import type { RunRecord } from "../../src/eval/record";
```

### Design Decisions
- **Plain TypeScript + HTML/CSS, compiled with `tsc`, no framework.** The page only reads JSON and renders tables.
- **All record text is rendered with `textContent`, never `innerHTML`.** The records contain model output and the E8 memo with a hidden instruction. Both must stay inert data on the page too.
- **Data is trimmed at build time.** Long tool outputs are cut to the summary and key rows, with the full record linked. `site/data/` is committed, so the page works without running anything.
- **Relative paths only.** The same build works from a local static server and from GitHub Pages.
- **Run conditions are shown first.** The header shows the model, dataset version and hashes, so readers know exactly what was evaluated.

### Usage Examples (planned)
```
npm run site:data     # eval/runs + eval/summary.json → site/data/
npm run site:build    # tsc → site/dist/
npx serve site        # local check (any static server)
```

---

## Phase 6 Skill Classification

| Skill | Classification | Reason |
|---|---|---|
| Static JSON-to-page build, safe text rendering | general | Reusable for any eval-record viewer |
| Views and comparison layout | project-specific | Built around this project's scenario types and tool sets |

---

## Prerequisites & Dependencies
- Phase 5 `RunRecord` type, run records and summary.
- No new runtime dependency (TypeScript compiler from Phase 1).
- A GitHub Pages target on the `shopfloor-mcp` repo: a `docs/` folder or a Pages workflow, decided at publish time.

---

## Development Notes
- **Definition of done:**
  - The page shows all 30 scenarios for both tool sets from committed data.
  - The detail view shows every tool call with its evidence ID.
  - Opening it from GitHub Pages works without errors.
- **Development data.** Dev-scenario records can be used to build the page before the final eval runs. Do not publish them as results.
- **No worker IDs on the page.** The records contain none (checked in Phase 5). The data build checks again.
- **Publishing goes through the separate `shopfloor-mcp` checkout.** Never push from this working folder.

---

## Change Log

| Date | Description |
|---|---|
| 2026-10-21 | Initial creation |

---
---

# Phase 6 — 결과 재생 페이지 `🔲 미시작`

> 평가 기록을 읽어 시나리오마다 질문, 도구 호출, 서버 응답, 답변, 채점을 보여주는 정적 페이지를 만든다. 링크로 공유할 수 있고 AI를 호출하지 않는다.

**상태**: 🔲 미시작
**선행 조건**: Phase 5 완료 (실행 기록, `eval/summary.json`)

---

## 개요

결과 재생 페이지는 결과를 보여주는 기본 방식이다 (기획서 6장). Phase 5의 JSON 기록을 세 화면으로 보여준다.

- 평가용 30개 결과표
- 시나리오별 단계 상세
- 도구 세트 비교

GitHub Pages에 게시한다. AI 호출, API 키, 백엔드, 로그인이 모두 없다. 데모 영상 칸은 Phase 7에서 채운다.

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| 1 | `site/index.html` + `site/src/*.ts` → `site/dist/` (화면 3개) | 🔲 | 전용 |
| 2 | `scripts/build-site-data.ts` (`npm run site:data`: 평가 기록 → `site/data/*.json`) | 🔲 | 전용 |
| 3 | GitHub Pages 게시 (방식은 게시할 때 결정) | 🔲 | 범용 |
| 4 | `tests/site/` (데이터 생성, 안전한 텍스트 표시) | 🔲 | 범용 |

---

## 결과 재생 페이지 (예정)

### 목적
방문자가 아무것도 실행하지 않고도, Claude의 수치가 서버에서 나왔고 금지된 행동이 없었다는 것을 확인할 수 있게 한다.

### 구현 파일
| 파일 | 역할 |
|---|---|
| `site/index.html` | 페이지 뼈대, 이동 메뉴 |
| `site/src/results.ts` | 결과표: S01~S30 × 도구 세트, 정답 여부, 금지된 행동, 도구 호출 수 |
| `site/src/scenario.ts` | 상세: 질문 → 도구 순서 → 응답 요약 → 최종 답변 → 정답표 대조 → 검수 메모 |
| `site/src/compare.ts` | 시나리오 유형별 잘게 나눈 버전 vs 크게 묶은 버전 |
| `site/src/render.ts` | DOM 함수 (텍스트로만 표시) |
| `site/style.css` | 배치, 휴대폰 너비 대응 |

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 설계 결정 사항
- **프레임워크 없이 TypeScript + HTML/CSS를 `tsc`로 컴파일한다.** 페이지는 JSON을 읽어 표를 그리기만 한다.
- **기록의 모든 텍스트는 `innerHTML`이 아니라 `textContent`로 표시한다.** 기록에는 모델 출력과 숨은 지시가 든 E8 메모가 있다. 페이지에서도 둘 다 동작하지 않는 데이터로 남아야 한다.
- **데이터는 빌드할 때 줄인다.** 긴 도구 응답은 요약과 주요 행만 남기고 전체 기록은 링크로 둔다. `site/data/`는 커밋해서 실행 없이도 페이지가 동작하게 한다.
- **상대 경로만 쓴다.** 같은 빌드가 로컬 정적 서버와 GitHub Pages에서 모두 동작한다.
- **실행 조건을 맨 위에 보여준다.** 머리말에 모델, 데이터 버전, 해시를 보여줘서 무엇을 평가했는지 알 수 있게 한다.

### 사용 예시 (예정)
위 영어 섹션 코드와 동일.

---

## Phase 6 스킬 범용/전용 분류

| 스킬 | 분류 | 이유 |
|---|---|---|
| JSON → 정적 페이지 빌드, 안전한 텍스트 표시 | 범용 | 다른 평가 기록 뷰어에도 재사용 가능 |
| 화면 구성과 비교 배치 | 전용 | 이 프로젝트의 시나리오 유형과 도구 세트에 맞춤 |

---

## 선행 조건 및 의존성
- Phase 5 `RunRecord` 타입, 실행 기록, 요약.
- 새 런타임 의존성 없음 (Phase 1의 TypeScript 컴파일러 사용).
- `shopfloor-mcp` 저장소의 GitHub Pages 게시 대상: `docs/` 폴더 또는 Pages 워크플로. 게시할 때 정한다.

---

## 개발 시 주의사항
- **완료 기준:**
  - 커밋된 데이터만으로 두 도구 세트의 30개 시나리오가 보인다.
  - 상세 화면에 모든 도구 호출과 근거 번호가 보인다.
  - GitHub Pages에서 오류 없이 열린다.
- **개발용 데이터.** 최종 평가 전에는 개발용 시나리오 기록으로 페이지를 만들어 볼 수 있다. 다만 그것을 결과로 게시하지 않는다.
- **페이지에 작업자 ID는 없다.** 기록에 없고(Phase 5에서 확인), 데이터 빌드에서 한 번 더 확인한다.
- **게시는 별도의 `shopfloor-mcp` 체크아웃에서 한다.** 이 작업 폴더에서 push하지 않는다.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-21 | 최초 작성 |
