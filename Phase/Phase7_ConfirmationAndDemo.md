# Phase 7 — Confirmation Screen & Demo `🔲 Not Started`

> Add the human confirm button inside the Claude conversation (MCP Apps first), then record the demo and finish the docs. This is development stage 2.

**Status**: 🔲 Not Started
**Prerequisites**: Phases 1–6 complete (development stage 1)

---

## Overview

The confirm logic already exists in Phase 3. This phase adds only the entry point, the button.

- **Preview.** `preview_issue` points to a `ui://` form resource. The form shows the draft, lets the user edit it, and calls `confirm_issue`.
- **Confirm tool.** `confirm_issue` is declared app-only, so it is absent from Claude's tool list. Clients without UI support never get it registered.
- **Finishing work.** After the form: the 2-minute demo video, the README GIFs, the install guide and the evaluation report.

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| 1 | Method check: MCP Apps in the current Claude Desktop (decision recorded) | 🔲 | project-specific |
| 2 | `src/server/ui/issue-preview.html` + `issue-preview.ts` (`ui://shopfloor/issue-preview`) | 🔲 | project-specific |
| 3 | `confirm_issue` registration (app-only, UI-capable clients only) + `HumanContext` entry | 🔲 | project-specific |
| 4 | `tests/server/confirm.test.ts` (visibility, registration, form → confirm → audit) | 🔲 | general |
| 5 | Demo video (2 min, plan §5 scenes 1–9) + README GIFs (2–3) | 🔲 | project-specific |
| 6 | `docs/INSTALL.md`, `docs/EVALUATION.md`, README / README_ko update | 🔲 | general |
| 7 | Replay page: demo video section | 🔲 | project-specific |

---

## Issue Preview Form (planned)

### Purpose
Let a human see Claude's draft, change it, and confirm it with a button. The request goes from the form to the server without passing through Claude (plan §3-2 ③–⑥).

### Core Classes / Structure
```
preview_issue                      _meta.ui.resourceUri = "ui://shopfloor/issue-preview"
  → server: createDraft            draft P-… (10 min, single use), issues untouched
  → Claude Desktop renders form    line, title, severity, description, evidence IDs (read-only)
  → human edits, clicks 확정
  → form calls confirm_issue(draftId, edits)       _meta.ui.visibility: ["app"]
  → server: confirmDraft(HumanContext, …)          exists → not expired → not used → not duplicate
  → issues + issue_drafts + audit_log              Claude's draft → human_changes → human confirm
```

### Design Decisions
- **The server side is unchanged from Phase 3.** Only the entry is new. If the entry method changes, the confirm logic is not rebuilt (plan §3-2).
- **Two layers keep the confirm tool away from Claude.** `confirm_issue` is hidden from the model by app-only visibility. It is also not registered at all for clients without UI support. The guarantee "Claude has no confirm tool" does not rest on one flag.
- **One screen only** (plan §3-2): the preview form. Loss charts and evidence panels are post-MVP.
- **The form shows the server's messages.** Expiry after 10 minutes, a double click (already used) and duplicates are rejected by the server. The form displays the server's message and asks for a new preview when needed.

---

## Demo & Docs (planned)

### Purpose
Show it working (plan §6): a short video from Claude Desktop, GIFs for the README, and setup docs that work when followed step by step.

### Core Classes / Structure
| Item | Content |
|---|---|
| Demo video | Plan §5 scenes 1–9: daily briefing → L4 low → shortfall breakdown → 09시대 pattern → preview form → severity edit + confirm → audit log |
| README GIFs | Question and answer with evidence IDs; preview form; audit log entry |
| `docs/INSTALL.md` | Clone → `npm install` → `npm run generate` → build → Claude Desktop config → first question |
| `docs/EVALUATION.md` | Run conditions, results per type, tool-set comparison, tuning before/after, limits |
| README / README_ko | Quick Start with verified commands, status, links to the replay page and video |

### Design Decisions
- **Record the demo on a fresh DB copy**, so the audit log shows only the demo's calls.
- **Every command in the docs is run on a clean clone before publishing.** No unverified commands.

### Usage Examples (planned)
```
User:   이걸 이슈로 등록해줘
Claude: 초안을 만들었습니다. 아래 폼에서 확인하고 확정해 주세요.   (preview form appears)
Human:  severity medium → high, clicks 확정
Server: ISS-026 registered; audit: draft P-… → human_changes {"severity":["medium","high"]} → confirm
```

---

## Phase 7 Skill Classification

| Skill | Classification | Reason |
|---|---|---|
| App-only tool + UI-capability registration pattern | general | Reusable for any MCP server that needs human confirmation |
| Issue form, demo, docs | project-specific | This project's flow and content |

---

## Prerequisites & Dependencies
- Phases 1–6 complete; Phase 3 `confirmDraft` and its tests.
- Claude Desktop with MCP Apps support (version recorded at the method check).
- MCP Apps SDK/extension package, chosen and pinned at the method check.
- Screen recording tool for the video and GIFs.

---

## Development Notes
- **Definition of done:**
  - In Claude Desktop, the form appears after `preview_issue`, and confirming registers exactly one issue.
  - Double click, expiry and duplicate are each rejected with a message.
  - `confirm_issue` is absent from the model's tool list.
  - The demo video and docs are published.
- **Open decision at the start of this phase** (plan §10): the preview screen method. Try MCP Apps first. If it does not work in the current Claude Desktop, choose another entry here. The server's confirm logic stays the same.
- **The server cannot see who pressed the button.** The guarantee comes from three things together: host-side app-only visibility, not registering the tool for clients without UI, and one-time draft IDs. Write this down honestly in the docs.
- **The Phase 5 runner has no UI,** so the confirm path is covered by unit tests and the manual demo, not by the eval runs.
- **The paste-in comparison** (plan §3-5) runs after development as a separate test. It is not part of this phase.

---

## Change Log

| Date | Description |
|---|---|
| 2026-10-21 | Initial creation |

---
---

# Phase 7 — 확정 화면과 데모 `🔲 미시작`

> Claude 대화 안에 사람의 확정 버튼을 붙이고(MCP Apps 우선), 데모를 녹화하고 문서를 마무리한다. 개발 2단계다.

**상태**: 🔲 미시작
**선행 조건**: Phase 1~6 완료 (개발 1단계)

---

## 개요

확정 로직은 이미 Phase 3에 있다. 이 Phase는 입구인 버튼만 붙인다.

- **미리보기.** `preview_issue`가 `ui://` 폼 리소스를 가리킨다. 폼은 초안을 보여주고, 사용자가 고칠 수 있게 하고, `confirm_issue`를 부른다.
- **확정 도구.** `confirm_issue`는 화면 전용으로 선언해서 Claude의 도구 목록에 없다. 화면을 지원하지 않는 클라이언트에는 아예 등록하지 않는다.
- **마무리.** 폼 다음에는 2분 데모 영상, README GIF, 설치 안내, 평가 기록 문서를 만든다.

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| 1 | 방식 확인: 현재 Claude 데스크톱의 MCP Apps 지원 (결정 기록) | 🔲 | 전용 |
| 2 | `src/server/ui/issue-preview.html` + `issue-preview.ts` (`ui://shopfloor/issue-preview`) | 🔲 | 전용 |
| 3 | `confirm_issue` 등록 (화면 전용, 화면 지원 클라이언트만) + `HumanContext` 입구 | 🔲 | 전용 |
| 4 | `tests/server/confirm.test.ts` (공개 범위, 등록 조건, 폼 → 확정 → 감사 기록) | 🔲 | 범용 |
| 5 | 데모 영상 (2분, 기획서 5장 장면 1~9) + README GIF (2~3개) | 🔲 | 전용 |
| 6 | `docs/INSTALL.md`, `docs/EVALUATION.md`, README / README_ko 갱신 | 🔲 | 범용 |
| 7 | 결과 재생 페이지: 데모 영상 칸 | 🔲 | 전용 |

---

## 이슈 등록 미리보기 폼 (예정)

### 목적
사람이 Claude의 초안을 보고, 고치고, 버튼으로 확정한다. 요청은 Claude를 거치지 않고 폼에서 서버로 간다 (기획서 3-2 ③~⑥).

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 설계 결정 사항
- **서버 쪽은 Phase 3 그대로다.** 새로 붙는 것은 입구뿐이다. 입구 방식이 바뀌어도 확정 로직은 다시 만들지 않는다 (기획서 3-2).
- **두 겹으로 확정 도구를 Claude에게서 떼어 놓는다.** `confirm_issue`는 화면 전용 공개 범위로 모델에게 숨긴다. 또 화면을 지원하지 않는 클라이언트에는 아예 등록하지 않는다. "Claude에게는 확정 도구가 없다"는 보장이 플래그 하나에 기대지 않게 한다.
- **화면은 미리보기 폼 하나뿐이다** (기획서 3-2). 원인 분해 차트, 조회 근거 패널은 MVP 이후다.
- **폼은 서버의 안내를 그대로 보여준다.** 10분 만료, 두 번 클릭(이미 사용됨), 중복은 서버가 거절한다. 폼은 서버의 안내를 표시하고, 필요하면 다시 미리보기를 요청하게 한다.

---

## 데모와 문서 (예정)

### 목적
실제로 동작하는 모습을 보여준다 (기획서 6장). Claude 데스크톱의 짧은 영상, README용 GIF, 따라 하면 바로 실행되는 설치 문서를 만든다.

### 핵심 클래스 / 구조
위 영어 섹션 표와 동일.

### 설계 결정 사항
- **데모는 새 DB 복사본으로 녹화한다.** 그래야 감사 기록에 데모의 호출만 남는다.
- **문서의 모든 명령은 게시 전에 새로 받은 저장소에서 실행해 본다.** 확인하지 않은 명령은 쓰지 않는다.

### 사용 예시 (예정)
위 영어 섹션 코드와 동일.

---

## Phase 7 스킬 범용/전용 분류

| 스킬 | 분류 | 이유 |
|---|---|---|
| 화면 전용 도구 + 화면 지원 여부에 따른 등록 방식 | 범용 | 사람 확인이 필요한 MCP 서버 어디에나 재사용 가능 |
| 이슈 폼, 데모, 문서 | 전용 | 이 프로젝트의 흐름과 내용 |

---

## 선행 조건 및 의존성
- Phase 1~6 완료, Phase 3 `confirmDraft`와 테스트.
- MCP Apps를 지원하는 Claude 데스크톱 (방식 확인 때 버전 기록).
- MCP Apps SDK/확장 패키지 (방식 확인 때 고르고 버전 고정).
- 영상과 GIF를 위한 화면 녹화 도구.

---

## 개발 시 주의사항
- **완료 기준:**
  - Claude 데스크톱에서 `preview_issue` 다음에 폼이 뜨고, 확정하면 이슈가 정확히 1건 등록된다.
  - 두 번 클릭, 만료, 중복은 각각 안내와 함께 거절된다.
  - 모델의 도구 목록에 `confirm_issue`가 없다.
  - 데모 영상과 문서가 게시되어 있다.
- **이 Phase 시작 때 정할 것** (기획서 10장): 미리보기 화면 방식. MCP Apps를 먼저 시도하고, 현재 Claude 데스크톱에서 동작하지 않으면 여기서 다른 입구를 정한다. 서버의 확정 로직은 그대로다.
- **서버는 누가 버튼을 눌렀는지 직접 볼 수 없다.** 보장은 세 가지가 함께 만든다: 호스트의 화면 전용 공개 범위, 화면 미지원 클라이언트에 등록하지 않기, 일회용 초안 번호. 이 점을 문서에 솔직하게 적는다.
- **Phase 5 실행기는 화면이 없다.** 그래서 확정 경로는 평가 실행이 아니라 단위 테스트와 수동 데모로 확인한다.
- **붙여넣기 방식 비교**(기획서 3-5)는 개발 완료 후 별도 테스트로 진행하며, 이 Phase에 포함하지 않는다.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-21 | 최초 작성 |
