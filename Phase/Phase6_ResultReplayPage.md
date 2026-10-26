# Phase 6 — Result Replay Page `✅ Built / Pages deployment pending`

> Build a static page that reads the evaluation records and shows, for each scenario, the question, tool calls, server responses, answer and grading. It can be shared by link and makes no AI calls.

**Status**: ✅ Built and checked locally (2026-10-26). The GitHub Pages workflow is written; the first deployment runs after a push to `main` with Pages set to "GitHub Actions" in the repository settings.
**Prerequisites**: Phase 5 complete (run records, human reviews, `eval/summary.json`)

---

## Overview

The replay page is the default way to show results (plan §6). It turns the Phase 5 JSON records into three views:

- a results table for the 30 eval scenarios
- a step-by-step detail view per scenario
- the tool-set comparison

The page is published on GitHub Pages. It calls no AI, needs no API key, has no backend, and needs no login. The demo video tab is a placeholder filled in Phase 7.

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| 1 | `site/index.html` + `site/src/*.ts` → `site/dist/` (three views + demo placeholder) | ✅ | project-specific |
| 2 | `scripts/build-site-data.ts` (`npm run site:data`: eval records + reviews → `site/data/*.json`, `--check` drift test) | ✅ | project-specific |
| 3 | GitHub Pages publishing: `.github/workflows/pages.yml` (GitHub Actions) | ✅ written / first run pending | general |
| 4 | `tests/site/` (7 tests: data build, safe text rendering) | ✅ | general |

---

## Replay Page (implemented)

### Purpose
Let a visitor check, without running anything, that Claude's numbers came from the server and that forbidden actions did not happen.

### Implementation Files
| File | Role |
|---|---|
| `site/index.html`, `site/style.css` | Page shell with a CSP (`default-src 'self'`), light/dark tokens, phone-width layout |
| `site/src/types.ts` | Data contract shared by the builder and the page |
| `site/src/main.ts` | Loads `data/index.json`, run-conditions header, tabs, hash routes (`#/results`, `#/scenario/Sxx`, `#/compare`, `#/demo`) |
| `site/src/results.ts` | Results table: S01–S30 × tool set: verdict, tool calls, forbidden actions, tokens; filter (all / with a failure / verdicts differ) |
| `site/src/scenario.ts` | Detail view: question → tool calls (name, mode, evidence ID, summary, input/response) → final answer → answer-key checks → reviewer note → DB changes and usage |
| `site/src/compare.ts` | Accuracy tiles, passes per scenario type, differing scenarios, mean usage, tool definitions |
| `site/src/markdown.ts` | Markdown subset parser (bold, code, lists, tables, quotes) into plain data, highlight splitting, link filter |
| `site/src/render.ts` | DOM helpers; record text only enters as Text nodes |
| `site/src/i18n.ts` | Korean/English interface text |
| `scripts/build-site-data.ts` | Builds `site/data/index.json` + `site/data/scenarios/Sxx.json`; `--check` compares with the committed files |
| `scripts/serve-site.mjs` | Local static server (`npm run site:serve`, 127.0.0.1:4173) |
| `tsconfig.site.json` | Browser build (DOM lib, no Node types) into `site/dist/` |

### Core Classes / Structure
```
index
  header: model · dataset version · scenario set / descriptions / policy / grader hashes · N · limits · reviewers
  ├─ Results table   S01–S30 × {coarse, fine}: verdict, tool calls, forbidden actions, tokens
  ├─ Scenario detail question → tool calls (name, input, response summary, evidence ID)
  │                  → final answer (answer-key matches highlighted) → checks with expected values → review note
  ├─ Comparison      pass rate per type, forbidden actions, tool calls / tokens / time / cost, tool definitions
  └─ Demo video      placeholder (Phase 7)
```
```ts
// scripts/build-site-data.ts reads Phase 5 records (RunRecord) and writes the site/src/types.ts contract,
// so a record-format change fails compilation in the builder instead of breaking the page.
import type { ScenarioDetail, SiteIndex } from '../site/src/types.js';
```

### Design Decisions
- **Plain TypeScript + HTML/CSS, compiled with `tsc`, no framework and no new dependency.** `npm run typecheck` checks the server and page projects.
- **All record text is rendered as Text nodes, never `innerHTML`.** The records contain model output and the E8 memo with a hidden instruction. Answers are parsed into a small Markdown subset as plain data, and `render.ts` builds elements only from fixed tags. Links are limited to relative and `https:` URLs. A test scans `site/src` for HTML-injection APIs.
- **Only reviewed, comparable results are published.** The builder takes the pair from `eval:summary` comparisons (full eval set, matching conditions) with every human review complete, and validates each review against its exact record. Dev runs and repeated runs (`--repeat > 1`) are refused with a message.
- **Reuse, not re-implementation.** Value-match highlights, expected-value text and memo detection come from the Phase 5 review sheet (`sheetRecord`, `memoShown`); pass rates and per-type counts come from `buildSummary`. Forbidden-action counts use the human verdict of each forbidden check.
- **Data is trimmed at build time.** Arrays longer than 12 items and strings longer than 4,000 characters are cut, with the omitted count shown and the full record linked on GitHub. `site/data/` (1.4 MB, 31 files) is committed, so the page works without running anything.
- **Deterministic data with a drift check.** No timestamps are written; `sourceHash` binds the data to the record hashes and reviews. `npm run site:data -- --check` fails when the committed files differ from the records (CRLF checkouts are not treated as stale). The Pages workflow runs this check before deploying.
- **Relative paths only.** The same build works from a local static server and from the `/shopfloor-mcp/` path on GitHub Pages.
- **Run conditions are shown first.** The header shows the model, dataset version, hashes, limits and review completion. The system prompts given to the model are expandable.
- **Interface language: Korean/English toggle** (user decision 2026-10-26). Questions, answers and tool output stay as recorded (Korean).
- **Reviewer notes are shown verbatim** (user decision 2026-10-26), including notes edited on the reviewer's instruction and their tag. Basic run/privacy/answer-presence checks that passed are folded.
- **Answers render a Markdown subset** (user decision 2026-10-26): bold, inline code, lists, tables, quotes. Numbers that matched an answer-key value in the automatic check are highlighted on the original answer offsets, so coincidental matches (for example S11 fine "9/14") stay visible.

### Usage Examples
```
npm run site:data             # eval/runs + eval/reviews → site/data/
npm run site:data -- --check  # fail if site/data/ differs from the records
npm run site:build            # tsc → site/dist/
npm run site:serve            # http://127.0.0.1:4173/
```

### Verification (2026-10-26)
- `npm run check`: PASS, 201 tests / 19 files (7 new), typecheck for both projects and build. `npm run site:data -- --check`: PASS (31 files).
- Published pair: `20261023T073705712Z-eval-coarse-845d6c72` / `20261023T073937732Z-eval-fine-23f3d69f`; 28/30 and 26/30, per-type counts identical to Phase 5.
- All 107 tool calls in the page data carry an evidence ID; no worker-ID pattern in `site/data/`.
- Headless Chrome: results, scenario, comparison and demo views render from `/` and from a `/shopfloor-mcp/` subpath; an unknown scenario shows a message. At an emulated 390 px phone width no view scrolls horizontally (wide tables scroll inside their container). Light and dark modes checked by screenshot. The two series colors pass the palette validator in both modes.
- Not yet verified: the first run of the Pages workflow (action versions `checkout@v5`, `setup-node@v5`, `configure-pages@v5`, `upload-pages-artifact@v4`, `deploy-pages@v4`) and the page at its public URL.

---

## Phase 6 Skill Classification

| Skill | Classification | Reason |
|---|---|---|
| Static JSON-to-page build with drift check, safe text rendering, Markdown subset with offset highlights | general | Reusable for any eval-record viewer |
| Views and comparison layout | project-specific | Built around this project's scenario types and tool sets |

---

## Prerequisites & Dependencies
- Phase 5 `RunRecord` type, run records, human reviews and summary.
- No new runtime or dev dependency (TypeScript compiler from Phase 1).
- GitHub Pages on the `shopfloor-mcp` repo with source "GitHub Actions" (repository setting). GitHub Pages on a private repository needs a paid plan.

---

## Development Notes
- **Definition of done:**
  - The page shows all 30 scenarios for both tool sets from committed data. ✅
  - The detail view shows every tool call with its evidence ID. ✅
  - Opening it from GitHub Pages works without errors. ⏳ after the first deployment
- **Development data.** Dev-scenario records can be used to build the page before the final eval runs. Do not publish them as results. The builder refuses dev runs.
- **No worker IDs on the page.** The records contain none (checked in Phase 5). The data build runs `assertPublishable` on every file.
- **After new reviews or runs**, run `npm run site:data` and commit `site/data/`; otherwise the workflow's `--check` step fails.

---

## Change Log

| Date | Description |
|---|---|
| 2026-10-21 | Initial creation |
| 2026-10-26 | Implement the page (three views + demo placeholder, Korean/English), data build with `--check`, local server, Pages workflow and 7 tests; record user decisions (Actions publishing, language toggle, verbatim notes, Markdown subset). `npm run check` passes with 201 tests / 19 files. First Pages deployment pending. |

---
---

# Phase 6 — 결과 재생 페이지 `✅ 구현 / Pages 배포 대기`

> 평가 기록을 읽어 시나리오마다 질문, 도구 호출, 서버 응답, 답변, 채점을 보여주는 정적 페이지를 만든다. 링크로 공유할 수 있고 AI를 호출하지 않는다.

**상태**: ✅ 구현하고 로컬에서 확인했다(2026-10-26). GitHub Pages 워크플로는 작성했고, 저장소 설정에서 Pages 소스를 "GitHub Actions"로 지정한 뒤 `main`에 push하면 첫 배포가 실행된다.
**선행 조건**: Phase 5 완료 (실행 기록, 사람 검수, `eval/summary.json`)

---

## 개요

결과 재생 페이지는 결과를 보여주는 기본 방식이다 (기획서 6장). Phase 5의 JSON 기록을 세 화면으로 보여준다.

- 평가용 30개 결과표
- 시나리오별 단계 상세
- 도구 세트 비교

GitHub Pages에 게시한다. AI 호출, API 키, 백엔드, 로그인이 모두 없다. 데모 영상 탭은 자리만 두고 Phase 7에서 채운다.

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| 1 | `site/index.html` + `site/src/*.ts` → `site/dist/` (화면 3개 + 데모 자리) | ✅ | 전용 |
| 2 | `scripts/build-site-data.ts` (`npm run site:data`: 평가 기록 + 검수 → `site/data/*.json`, `--check` 불일치 검사) | ✅ | 전용 |
| 3 | GitHub Pages 게시: `.github/workflows/pages.yml` (GitHub Actions) | ✅ 작성 / 첫 실행 대기 | 범용 |
| 4 | `tests/site/` (테스트 7개: 데이터 생성, 안전한 텍스트 표시) | ✅ | 범용 |

---

## 결과 재생 페이지 (구현)

### 목적
방문자가 아무것도 실행하지 않고도, Claude의 수치가 서버에서 나왔고 금지된 행동이 없었다는 것을 확인할 수 있게 한다.

### 구현 파일
| 파일 | 역할 |
|---|---|
| `site/index.html`, `site/style.css` | 페이지 뼈대와 CSP(`default-src 'self'`), 밝은·어두운 색, 휴대폰 너비 배치 |
| `site/src/types.ts` | 데이터 생성기와 페이지가 함께 쓰는 데이터 형식 |
| `site/src/main.ts` | `data/index.json` 읽기, 실행 조건 머리말, 탭, 주소 해시 이동(`#/results`, `#/scenario/Sxx`, `#/compare`, `#/demo`) |
| `site/src/results.ts` | 결과표: S01~S30 × 도구 세트의 판정, 도구 호출 수, 금지 행동, 토큰. 보기 선택(전체 / 실패가 있는 것 / 판정이 다른 것) |
| `site/src/scenario.ts` | 상세: 질문 → 도구 호출(이름, mode, 근거 번호, 요약, 입력·응답) → 최종 답변 → 정답 대조 → 검수 메모 → DB 변화와 사용량 |
| `site/src/compare.ts` | 정답률 타일, 유형별 통과 수, 판정이 다른 시나리오, 평균 사용량, 도구 정의 |
| `site/src/markdown.ts` | 마크다운 일부(굵게, 코드, 목록, 표, 인용)를 데이터로 해석, 강조 위치 분할, 링크 제한 |
| `site/src/render.ts` | DOM 함수. 기록 문자열은 Text 노드로만 들어간다 |
| `site/src/i18n.ts` | 한국어·영어 화면 문구 |
| `scripts/build-site-data.ts` | `site/data/index.json` + `site/data/scenarios/Sxx.json` 생성. `--check`는 커밋된 파일과 비교 |
| `scripts/serve-site.mjs` | 로컬 정적 서버 (`npm run site:serve`, 127.0.0.1:4173) |
| `tsconfig.site.json` | 브라우저용 빌드(DOM, Node 타입 없음) → `site/dist/` |

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 설계 결정 사항
- **프레임워크와 새 의존성 없이 TypeScript + HTML/CSS를 `tsc`로 컴파일한다.** `npm run typecheck`가 서버와 페이지 두 프로젝트를 검사한다.
- **기록의 모든 텍스트는 `innerHTML`이 아니라 Text 노드로 표시한다.** 기록에는 모델 출력과 숨은 지시가 든 E8 메모가 있다. 답변은 마크다운 일부만 데이터로 해석하고, `render.ts`는 정해진 태그로만 요소를 만든다. 링크는 상대 경로와 `https:`만 허용한다. 테스트가 `site/src`에서 HTML 삽입 API 사용을 검사한다.
- **검수를 마친 비교 가능한 결과만 게시한다.** 생성기는 `eval:summary`의 비교 쌍(전체 평가 세트, 같은 조건) 중 사람 검수가 모두 끝난 것만 쓰고, 각 검수를 해당 기록과 대조해 검증한다. 개발용 실행과 반복 실행(`--repeat > 1`)은 안내와 함께 거절한다.
- **다시 구현하지 않고 재사용한다.** 정답값 일치 강조, 정답 표기, 메모 감지는 Phase 5 검수 화면(`sheetRecord`, `memoShown`)에서, 정답률과 유형별 수는 `buildSummary`에서 가져온다. 금지 행동 수는 금지 검사마다 사람 판정을 따른다.
- **데이터는 빌드할 때 줄인다.** 12개를 넘는 배열과 4,000자를 넘는 문자열은 잘라서 생략 수를 표시하고, 전체 기록은 GitHub 링크로 둔다. `site/data/`(1.4MB, 파일 31개)는 커밋해서 실행 없이도 페이지가 동작한다.
- **같은 입력이면 같은 데이터, 불일치 검사.** 생성 시각을 기록하지 않고 `sourceHash`로 기록 해시와 검수 내용에 묶는다. `npm run site:data -- --check`는 커밋된 파일이 기록과 다르면 실패한다(CRLF 체크아웃은 불일치로 보지 않음). Pages 워크플로가 배포 전에 이 검사를 실행한다.
- **상대 경로만 쓴다.** 같은 빌드가 로컬 정적 서버와 GitHub Pages의 `/shopfloor-mcp/` 경로에서 모두 동작한다.
- **실행 조건을 맨 위에 보여준다.** 머리말에 모델, 데이터 버전, 해시, 실행 한도, 검수 완료 수를 보여주고, 모델에 준 시스템 프롬프트를 펼쳐 볼 수 있다.
- **화면 문구는 한국어·영어 전환** (사용자 결정 2026-10-26). 질문·답변·도구 응답은 기록된 그대로(한국어) 보여준다.
- **검수 메모는 원문 그대로 보여준다** (사용자 결정 2026-10-26). 검수자 지시로 고친 메모와 그 표시도 포함한다. 통과한 실행·개인정보·답변 유무 기본 검사는 접어 둔다.
- **답변은 마크다운 일부를 표시한다** (사용자 결정 2026-10-26): 굵게, 코드, 목록, 표, 인용. 자동 검사에서 정답값과 일치한 숫자는 원래 답변의 위치 기준으로 강조해서, 우연한 일치(예: S11 fine의 "9/14")도 보이게 한다.

### 사용 예시
위 영어 섹션 코드와 동일.

### 검증 (2026-10-26)
- `npm run check`: 통과, 테스트 201개 / 파일 19개(신규 7개), 두 프로젝트 타입 검사와 빌드. `npm run site:data -- --check`: 통과(파일 31개).
- 게시 대상: `20261023T073705712Z-eval-coarse-845d6c72` / `20261023T073937732Z-eval-fine-23f3d69f`. 28/30, 26/30이며 유형별 수가 Phase 5와 같다.
- 페이지 데이터의 도구 호출 107개 모두 근거 번호가 있고, `site/data/`에 작업자 ID 패턴이 없다.
- 헤드리스 Chrome: 결과표·상세·비교·데모 화면이 `/`와 `/shopfloor-mcp/` 하위 경로에서 열리고, 없는 시나리오는 안내를 보여준다. 390px 휴대폰 너비 에뮬레이션에서 가로 스크롤이 생기지 않는다(넓은 표는 표 안에서 스크롤). 밝은·어두운 모드를 화면으로 확인했다. 두 계열 색은 두 모드 모두 팔레트 검사를 통과했다.
- 아직 확인하지 않은 것: Pages 워크플로 첫 실행(액션 버전 `checkout@v5`, `setup-node@v5`, `configure-pages@v5`, `upload-pages-artifact@v4`, `deploy-pages@v4`)과 공개 주소에서의 페이지.

---

## Phase 6 스킬 범용/전용 분류

| 스킬 | 분류 | 이유 |
|---|---|---|
| 불일치 검사가 있는 JSON → 정적 페이지 빌드, 안전한 텍스트 표시, 위치를 유지하는 마크다운 강조 | 범용 | 다른 평가 기록 뷰어에도 재사용 가능 |
| 화면 구성과 비교 배치 | 전용 | 이 프로젝트의 시나리오 유형과 도구 세트에 맞춤 |

---

## 선행 조건 및 의존성
- Phase 5 `RunRecord` 타입, 실행 기록, 사람 검수, 요약.
- 새 런타임·개발 의존성 없음 (Phase 1의 TypeScript 컴파일러 사용).
- `shopfloor-mcp` 저장소의 GitHub Pages 소스를 "GitHub Actions"로 설정 (저장소 설정). 비공개 저장소의 GitHub Pages는 유료 플랜이 필요하다.

---

## 개발 시 주의사항
- **완료 기준:**
  - 커밋된 데이터만으로 두 도구 세트의 30개 시나리오가 보인다. ✅
  - 상세 화면에 모든 도구 호출과 근거 번호가 보인다. ✅
  - GitHub Pages에서 오류 없이 열린다. ⏳ 첫 배포 후 확인
- **개발용 데이터.** 최종 평가 전에는 개발용 시나리오 기록으로 페이지를 만들어 볼 수 있다. 다만 그것을 결과로 게시하지 않는다. 생성기는 개발용 실행을 거절한다.
- **페이지에 작업자 ID는 없다.** 기록에 없고(Phase 5에서 확인), 데이터 생성 시 모든 파일에 `assertPublishable`을 실행한다.
- **검수나 실행이 새로 생기면** `npm run site:data`를 실행하고 `site/data/`를 커밋한다. 그러지 않으면 워크플로의 `--check` 단계가 실패한다.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-21 | 최초 작성 |
| 2026-10-26 | 페이지(화면 3개 + 데모 자리, 한·영 전환), `--check`가 있는 데이터 생성, 로컬 서버, Pages 워크플로, 테스트 7개 구현. 사용자 결정(Actions 게시, 문구 전환, 메모 원문, 마크다운 일부) 기록. `npm run check` 통과(테스트 201개 / 파일 19개). Pages 첫 배포 대기. |
