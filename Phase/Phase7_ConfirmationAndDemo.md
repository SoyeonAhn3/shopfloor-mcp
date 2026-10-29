# Phase 7 — Confirmation Screen & Demo `🚧 In Progress`

> Add the human confirm button inside the Claude conversation (MCP Apps first), then record the demo and finish the docs. This is development stage 2.

**Status**: 🚧 In Progress
**Prerequisites**: Phases 1–6 complete (development stage 1)
**Progress (2026-10-28)**: item 1 decided conditionally (MCP Apps); items 2–4 implemented and checked in MCP Inspector (stage B): form → `confirm_issue` → one issue and a human audit. The required final severity choice (Phase 5 follow-up #4) passed stage B on 2026-10-28. Items 5–7 done; the README video closes 5 and 7. Remaining: Claude Desktop check (stage C).

---

## Overview

The confirm logic already exists in Phase 3. This phase adds only the entry point, the button.

- **Preview.** `preview_issue` points to a `ui://` form resource. The form shows the draft, lets the user edit it, and calls `confirm_issue`.
- **Confirm tool.** `confirm_issue` is declared app-only, so it is absent from Claude's tool list. Clients without UI support never get it registered.
- **Finishing work.** After the form: the demo video (the 90-second video in the README), the install guide and the evaluation report.

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| 1 | Method check: MCP Apps in the current Claude Desktop (decision recorded) | 🚧 conditional (Desktop check pending) | project-specific |
| 2 | `src/server/ui/issue-preview.html` + `issue-preview.ts` (`ui://shopfloor/issue-preview`) | ✅ rendered in Inspector (stage B); Claude Desktop (stage C) pending | project-specific |
| 3 | `confirm_issue` registration (app-only, UI-capable clients only) + `HumanContext` entry | ✅ checked in Inspector (stage B); Claude Desktop (stage C) pending | project-specific |
| 4 | `tests/server/confirm.test.ts` (visibility, registration, form → confirm → audit) | ✅ 10 tests | general |
| 5 | Demo video: the 90-second video in the README | ✅ | project-specific |
| 6 | `docs/INSTALL.md`, `docs/EVALUATION.md`, README / README_ko update | ✅ (Desktop step in INSTALL unverified) | general |
| 7 | Replay page: demo video section | ✅ closed by the README video | project-specific |

**Priority scope (2026-10-26):** items 1–4. Items 5–7 follow after them. Items 2–4 done 2026-10-27; item 1 waits for stage C.

---

## Method Check (item 1): conditional decision

### Decision (2026-10-26)
Adopt MCP Apps for the confirm entry. The decision is conditional because Claude Desktop is not available for a live check yet. If the live check fails, only the entry changes. The confirm logic, tests and form HTML are kept (plan §3-2).

### Evidence
| Check | Result | Source |
|---|---|---|
| Package fits the SDK | `@modelcontextprotocol/ext-apps` 2.0.3 (2026-09-25) takes `@modelcontextprotocol/server`/`client`/`core` `^2.0.0` as peers; the project pins 2.3.1. Server: `registerAppTool`, `registerAppResource`, `getUiCapability`, `RESOURCE_MIME_TYPE`. View: `App` (`connect`, `ontoolresult`, `callServerTool`) | npm registry, package types |
| Local servers in Claude Desktop | Documented with a local server in `claude_desktop_config.json`. Claude asks to allow the app on first display. Plan, Windows and minimum version are not stated | Claude docs: MCP Apps getting started, troubleshooting |
| App-only visibility | Spec MUST: the host leaves tools without `"model"` out of the agent's tool list and rejects app calls to tools without `"app"`. App-only calls stay on the same server | ext-apps spec 2026-01-26 |
| Capability check | Spec SHOULD: servers check `extensions["io.modelcontextprotocol/ui"].mimeTypes` before registering UI tools and keep a text fallback | same |
| Form transport | The host sends the tool input and result to the View. The View calls server tools with `tools/call`. The default CSP blocks outside connections (`connect-src 'none'`); an inline form needs none | same |
| Human click | The spec has display consent only, no per-call approval, and visibility is not authorization. The Phase 3 server checks (one-time draft, role, session) stay necessary | same |

### Verification stages
| Stage | Tool | Covers | Does not cover | When |
|---|---|---|---|---|
| A | Automated tests, SDK client as host (item 4) | Registration by capability, `_meta.ui`, `ui://` resource and MIME, form → confirm → one issue → audit, double click / expiry / duplicate | Rendering | During items 2–4 |
| B | MCP Inspector (`@modelcontextprotocol/inspector`, stdio) | The form rendered in a sandboxed iframe, button → `confirm_issue` | Hiding from a model (no model) | After the form exists |
| C | Claude Desktop | Local-server rendering on this PC, absence from Claude's tool list, protocol era in use | — | When Desktop is available; part of the definition of done |

- 2026-10-26: Inspector 2.12.0 CLI connected over stdio to the built server and listed the 4 tools (`--method tools/list`, runtime copy `data/run/phase7-inspector.db`).
- 2026-10-26, stage B before item 3: the Inspector 2.12.0 web client declared MCP Apps and rendered the form after `preview_issue` (draft `P-4733…`, L4, 2026-09-24, evidence Q-0002). Clicking 확정 sent `tools/call confirm_issue` through the host to the server, which answered `Tool confirm_issue not found`, as expected before item 3. No issue was inserted, the draft stayed `pending`, and the audit log holds Q-0001–Q-0003 only. So the Inspector declares the UI capability by default and relays the View's `tools/call`.
- 2026-10-27, stage B after items 3–4 (runtime copy `data/run/phase7-stageb-confirm.db`, operator `demo`): in the form, severity 보통 → 높음 showed `수정: 심각도 보통 → 높음`, and 확정 registered one issue with severity high. The audit holds `edits: {"severity":"high"}` and `human_changes` before/after under `actor: human` (Q-0014). A duplicate title was rejected in the form with the server's message, and the draft stayed `pending` (Q-0007). Calling `confirm_issue` again with a used draft ID was rejected as `already_used` (Q-0012). The four test issues exist in this runtime copy only.
- The Inspector Apps tab shows its own tool input fields next to the app. Edits belong in the form titled 이슈 등록 확인; the `수정:` text next to the button shows them. Two early attempts changed severity in the input fields instead, so the draft itself was high and `edits` was empty.
- 2026-10-28, stage B after Phase 5 follow-up #4 (runtime copy `data/run/phase5-severity.db`, operator `demo`, user-run): the final-severity select started empty and showed the proposal separately. 확정 without a choice was refused in the form, and nothing was written. Keeping the proposal 보통 showed `심각도 확인: 보통 · 수정 없음` and registered medium with `edits: {"severity":"medium"}` (Q-0004). A second draft with a new title, changed to 높음, registered high with `human_changes` medium → high (Q-0006). Details: Phase 5 "Follow-up #1–#4 verification".

Stage B command (the web UI opens with a per-launch token; Tools tab `query_production` → Apps tab `preview_issue` with the returned `Q-…` → open the app → edit in the 이슈 등록 확인 form → 확정; use a new runtime copy per check):

```powershell
npm run build
npm run db:copy -- --from data/production.db --to data/run/phase7-inspector.db
npx -y @modelcontextprotocol/inspector@2.12.0 node dist/server/index.js --db data/run/phase7-inspector.db --role operator --user demo
```

### Impact on item 3
- **Two protocol eras.** SDK v2 serves 2025-era clients (capabilities once at `initialize`) and 2026-07-28 clients (capabilities per request, no `initialize`). The ext-apps example checks the capability in `oninitialized`, which covers the 2025 era only.
- **Fail closed.** The UI surface is registered disabled and enabled only when `initialize` declares the UI capability. A client that cannot be judged gets no form and no confirm tool. Item 2 built this gate for the form; item 3 adds `confirm_issue` to the same `enable()`. Claude Desktop's era is read from its `mcp-server-<name>.log` at stage C.
- **Package added:** `@modelcontextprotocol/ext-apps` 2.0.3, exact pin (2026-10-26).

---

## Issue Preview Form

### Purpose
Let a human see Claude's draft, change it, and confirm it with a button. The request goes from the form to the server without passing through Claude (plan §3-2 ③–⑥).

### Core Classes / Structure
```
preview_issue                      _meta.ui.resourceUri = "ui://shopfloor/issue-preview"
  → server: createDraft            draft P-… (10 min, single use), issues untouched
  → host renders form              Claude Desktop (stage C); verified in MCP Inspector (stage B)
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

### Implementation (item 2, 2026-10-26)
| File | Content |
|---|---|
| `src/server/ui/issue-preview.html` | Self-contained View. The MCP Apps View protocol (spec 2026-01-26) is written inline over `postMessage` with the host window only: `ui/initialize` → `ui/notifications/initialized`, the draft from `ui/notifications/tool-result`, `ui/notifications/size-changed`, and replies to `ping` / `ui/resource-teardown`. Line, production date, evidence IDs and expiry are read-only. The proposed severity is displayed separately; the person must select the final severity. `edits` always carries that severity plus changed title/description fields. Only the 확정 click sends `tools/call confirm_issue {draftId, edits}`. Server text reaches the DOM only through `textContent` |
| `src/server/ui/issue-preview.ts` | `ISSUE_PREVIEW_URI`, `supportsMcpApps()` (declared `io.modelcontextprotocol/ui` MIME type), `registerIssuePreview()`: registers the resource disabled (`registerAppResource`, `text/html;profile=mcp-app`) and returns `enable()`, which turns it on and sets `preview_issue._meta.ui.resourceUri` plus the legacy `ui/resourceUri` key |
| `src/server/app.ts` | `server.server.oninitialized` calls `enable()` only when `initialize` declared MCP Apps |
| `src/server/format.ts`, `tools/register.ts`, `toolsets/*` | For MCP Apps clients only, the draft summary and `message` say the person confirms in the form (`FORM_DRAFT_MESSAGE`). `register()` returns the `RegisteredTool`; the tool sets return the `preview_issue` handle |
| `scripts/copy-assets.mjs` | Copies the HTML to `dist/server/ui/` |
| `tests/server/issue-preview.test.ts` | 5 tests: capability detection, unchanged text surface (4 resources, no `_meta`, text-only messages), linkage in coarse and fine, self-contained HTML, form-client draft message with no issue inserted |

### Design Decisions (item 2)
- **The View protocol is written inline instead of bundling the SDK `App` class.** `App` pulls the MCP client, core and zod into a bundle of about 400 KB and needs a bundler, which the project does not have. `review-sheet.html` already sets the inline-HTML pattern, and the message set is small and fixed by the stable spec. `ext-apps` is used on the server (`registerAppResource`, `getUiCapability`, MIME type and meta key constants).
- **Text clients keep the same tool/resource counts.** The eval runner, Claude Code and the Inspector CLI declare no MCP Apps capability, so the form and confirmation tool are absent. Phase 5 follow-ups #1/#2/#4 now change descriptions/policy and add a provisional-severity notice; the old evaluation freeze remains historical.
- **Resolved by Phase 5 follow-up #4:** `preview_issue` now says clients without a form stop at a draft, while a person chooses severity in supported forms. This description change is not frozen; any later eval run needs new dev runs and a new freeze first (Phase 5 closed on v1, 2026-10-29).
- **No `<form>` submit.** A sandboxed iframe without `allow-forms` can block form submission, so the button is `type="button"` with a click handler.
- 2026-10-26: the Inspector 2.12.0 CLI (declares no MCP Apps) against the built server listed 4 resources and no `_meta` on `preview_issue`. The Inspector web client declares MCP Apps by default (`defaultAdvertised: true` in its bundle), so stage B uses the web UI.

### Implementation (items 3–4, 2026-10-27)
| File | Content |
|---|---|
| `src/core/service.ts` | `createCore()` returns `human.confirmDraft(draftId, edits)` next to `tools`. It builds a `HumanContext` with `createHumanContext()` on the core's own session, writer and clocks. `tools` still has no confirm operation |
| `src/server/ui/issue-preview.ts` | `confirmSchema` (strict: required `draftId` and `edits.severity`, optional title/description edits). `registerIssuePreview(server, preview, human)`: `enable()` runs once, turns on the form resource, links `preview_issue`, and registers `confirm_issue` with `registerAppTool`, `_meta.ui.visibility: ["app"]` and `readOnlyHint: false` |
| `src/server/app.ts` | Passes `core.human` only to `registerIssuePreview()` |
| `src/server/format.ts` | Summary `이슈 등록됨 (I-…)` for a confirm result. `confirm_issue` results carry no `recovery` hint, since those hints address the model |
| `tests/server/confirm.test.ts` | 10 tests: absent (`not found`) for text and other-MIME clients; app-only with a strict schema in coarse and fine; no confirm operation in `core.tools`; form-equivalent call → one issue with the edits, draft `confirmed`, one `human` success audit with `human_changes`; reject a missing severity choice and accept an explicit choice matching the proposal; double click, expiry, duplicate (the draft stays usable with a new title); edits to line, date or evidence and unknown keys rejected; another session's draft and a viewer denied and audited |
| `tests/server/issue-preview-form.test.ts` | Executes the actual inline form script with a minimal DOM/host fixture: no confirmation request before severity selection; retaining or changing the proposal sends the chosen value |
| `tests/server/issue-preview.test.ts` | Form clients list 5 / 11 tools with `confirm_issue` app-only; text clients list no confirm tool |

### Design Decisions (items 3–4)
- **Registered in `enable()`, not registered disabled.** A disabled tool answers `Tool confirm_issue disabled`, which tells a text client the tool exists. Registering it only after `initialize` declared MCP Apps gives `not found`, as plan §3-2 asks ("not registered at all"). The form resource is still registered disabled.
- **The entry accepts only what the form can edit.** Line, production date and evidence stay as Claude's draft cited them. Core re-checks evidence anyway, but the entry refuses these fields first.
- **Schema rejections are not audited.** Invalid arguments are refused by the SDK's input validation before the handler, as for every other tool. Rejections by draft state (used, expired, duplicate, other session, role) reach core and are audited.
- **A rejected confirm's audit row has no `draft_id`.** The failure result carries no draft ID, so the ID is only in `params`. This is existing core behaviour and stays unchanged; the tests read `params`.
- **Severity belongs to the person.** Phase 5 follow-up #4 marks the draft as `proposed`, shows the proposed severity separately, and requires `edits.severity` at the app-only entry. The trusted core human API retains its existing contract. No automatic issue-severity thresholds are defined. The `confirm_issue` description lives in `issue-preview.ts`, because the model never sees it.
- Follow-up verification (2026-10-27): `npm run check` passes (221 tests / 22 files); `scenarios:check` passes. This checks the script and server contract locally. The updated severity interaction passed the Inspector check on 2026-10-28; the Desktop check stays with stage C. Descriptions/policy changed under Phase 5 and are not frozen; a later eval run needs full D01–D10 dev runs and a new freeze first (Phase 5 closed on v1, 2026-10-29).
- Verification: `npm run check` passed with 21 test files and 216 tests.

---

## Demo & Docs

### Purpose
Show it working (plan §6): a short video and setup docs that work when followed step by step.

### Core Classes / Structure
| Item | Content |
|---|---|
| Demo video | 90 s silent video in the README (GitHub user-attachments URL, c208756), 1920×1080 · 30 fps, English on screen with Korean subtitles. Chapters WHY → HOW → DEMO → FEATURES → SAFEGUARDS → RESULTS. Made with Remotion 4.0.515 in `promo-video/` |
| `docs/INSTALL.md` | Clone → `npm install` → `npm run generate` → build → Claude Desktop config → first question |
| `docs/EVALUATION.md` | Run conditions, results per type, tool-set comparison, tuning before/after, limits |
| README / README_ko | Quick Start with verified commands, status, links to the replay page and video |

### Design Decisions
- **Record the demo on a fresh DB copy**, so the audit log shows only the demo's calls.
- **Every command in the docs is run on a clean clone before publishing.** No unverified commands.
- **Item 6 (2026-10-27).** `docs/INSTALL.md` was checked on a clean clone of `ee85cde` (Windows 10, Node 24.14.0, npm 11.9.0, no Visual Studio). Plain `npm ci` failed: the lockfile carries no `gypfile: false` for `better-sqlite3`, so npm compiles it from source despite its bundled prebuilds. `npm ci --ignore-scripts` succeeded, and `generate`, `validate`, `check`, `db:copy`, `mcp:config` and `mcp:demo` all exited 0. The README Quick Start notes this. `docs/EVALUATION.md` reports the frozen v1 results and links Phase 5 for follow-ups.
- **The README video is the demo video** (user decision, 2026-10-28). It closes items 5 and 7: no separate ~6 minute demo, no README GIFs, no video on the replay page. Its DEMO chapter uses two real records with source labels: eval run S10 (answer) and MCP Inspector stage B (form and audit log).

### Usage Examples (planned)
```
User:   이걸 이슈로 등록해줘
Claude: 초안을 만들었습니다. 아래 폼에서 확인하고 확정해 주세요.   (preview form appears)
Human:  severity medium → high, clicks 확정
Server: I-… registered; audit: confirm_issue, actor human, edits {"severity":"high"}, human_changes before/after
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
- Claude Desktop with MCP Apps support (version recorded at stage C).
- MCP Apps package: `@modelcontextprotocol/ext-apps` 2.0.3, pinned exactly.
- MCP Inspector for stage B, run with `npx` and not added as a project dependency (Node ≥ 22.19).

---

## Development Notes
- **Definition of done:**
  - In Claude Desktop, the form appears after `preview_issue`, and confirming registers exactly one issue.
  - Double click, expiry and duplicate are each rejected with a message.
  - `confirm_issue` is absent from the model's tool list.
  - The demo video and docs are published.
- **Preview screen method** (plan §10): MCP Apps, adopted conditionally on 2026-10-26 (see Method Check). If the Claude Desktop check fails, choose another entry. The server's confirm logic stays the same.
- **The server cannot see who pressed the button.** The guarantee comes from three things together: host-side app-only visibility, not registering the tool for clients without UI, and one-time draft IDs. Write this down honestly in the docs.
- **The Phase 5 runner has no UI,** so the confirm path is covered by unit tests and the manual demo, not by the eval runs.
- **Glossary ranges render as strikethrough.** `resources/glossary.md` writes ranges such as `08:00~08:20`; Markdown viewers (Inspector, GitHub) treat paired `~` as strikethrough. The model receives the raw text, so answers are unaffected. The eval runner puts this resource into the system prompt, so it is left unchanged until the user decides.
- **The paste-in comparison** (plan §3-5) runs after development as a separate test. It is not part of this phase.

---

## Change Log

| Date | Description |
|---|---|
| 2026-10-21 | Initial creation |
| 2026-10-26 | Status In Progress; priority scope items 1–4; item 1 conditional decision (MCP Apps), verification stages A/B/C |
| 2026-10-26 | Item 2 implemented: form View, gated resource, `preview_issue` UI meta, form-client draft text, 5 tests (206 total) |
| 2026-10-26 | Stage B before item 3: form rendered in the Inspector web client; 확정 reached the server (`confirm_issue` not yet registered) |
| 2026-10-26 | Progress summary, implemented form section, items 3–4 plan; README sync |
| 2026-10-27 | Items 3–4 implemented: human entry `core.human`, app-only `confirm_issue` registered in `enable()`, 10 confirm tests (216 total); stage B re-run passed |
| 2026-10-27 | Item 5: demo video changed to about 6 minutes, made by the user |
| 2026-10-27 | Item 6: `docs/INSTALL.md` (clean-clone check, `npm ci --ignore-scripts` on Windows without build tools), `docs/EVALUATION.md`, README links |
| 2026-10-27 | Phase 5 follow-up #4: display proposed severity separately, require an explicit final choice in the form and `edits.severity` in the app schema, retain the chosen value in the issue/audit. Add actual-script tests; `npm run check` passes (221 tests / 22 files). Updated visual interaction awaits Inspector/Desktop verification. |
| 2026-10-28 | Promo video recorded: 90 s Remotion teaser (`promo-video/`) embedded in the README (c208756); separate from item 5, which stays open |
| 2026-10-28 | Items 5 and 7 closed by the README video (user decision); ~6 minute demo, README GIFs and replay-page video dropped |
| 2026-10-28 | Stage B recheck of Phase 5 follow-up #4 passed: empty initial selection, refusal without a choice, kept proposal registered medium, changed proposal registered high with before/after audit |

---
---

# Phase 7 — 확정 화면과 데모 `🚧 진행 중`

> Claude 대화 안에 사람의 확정 버튼을 붙이고(MCP Apps 우선), 데모를 녹화하고 문서를 마무리한다. 개발 2단계다.

**상태**: 🚧 진행 중
**선행 조건**: Phase 1~6 완료 (개발 1단계)
**진행 상황 (2026-10-28)**: 1번은 조건부 결정(MCP Apps), 2~4번은 구현하고 MCP Inspector에서 확인했다(B 단계). 폼 → `confirm_issue` → 이슈 1건과 사람의 감사 기록까지 확인했다. 최종 심각도 선택 필수(Phase 5 후속 4번)도 2026-10-28에 B 단계를 통과했다. 5~7번도 완료했다. 5번과 7번은 README 영상으로 마무리했다. 남은 것은 Claude 데스크톱 확인(C 단계)이다.

---

## 개요

확정 로직은 이미 Phase 3에 있다. 이 Phase는 입구인 버튼만 붙인다.

- **미리보기.** `preview_issue`가 `ui://` 폼 리소스를 가리킨다. 폼은 초안을 보여주고, 사용자가 고칠 수 있게 하고, `confirm_issue`를 부른다.
- **확정 도구.** `confirm_issue`는 화면 전용으로 선언해서 Claude의 도구 목록에 없다. 화면을 지원하지 않는 클라이언트에는 아예 등록하지 않는다.
- **마무리.** 폼 다음에는 데모 영상(README의 90초 영상), 설치 안내, 평가 기록 문서를 만든다.

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| 1 | 방식 확인: 현재 Claude 데스크톱의 MCP Apps 지원 (결정 기록) | 🚧 조건부 (데스크톱 확인 전) | 전용 |
| 2 | `src/server/ui/issue-preview.html` + `issue-preview.ts` (`ui://shopfloor/issue-preview`) | ✅ Inspector 렌더링 확인(B 단계), Claude 데스크톱(C 단계) 전 | 전용 |
| 3 | `confirm_issue` 등록 (화면 전용, 화면 지원 클라이언트만) + `HumanContext` 입구 | ✅ Inspector 확인(B 단계), Claude 데스크톱(C 단계) 전 | 전용 |
| 4 | `tests/server/confirm.test.ts` (공개 범위, 등록 조건, 폼 → 확정 → 감사 기록) | ✅ 테스트 10개 | 범용 |
| 5 | 데모 영상: README의 90초 영상 | ✅ | 전용 |
| 6 | `docs/INSTALL.md`, `docs/EVALUATION.md`, README / README_ko 갱신 | ✅ (INSTALL의 데스크톱 단계는 확인 전) | 범용 |
| 7 | 결과 재생 페이지: 데모 영상 칸 | ✅ README 영상으로 마무리 | 전용 |

**우선 범위 (2026-10-26):** 1~4번. 5~7번은 그다음에 진행한다. 2~4번은 2026-10-27에 완료했고, 1번은 C 단계를 기다린다.

---

## 방식 확인 (1번): 조건부 결정

### 결정 (2026-10-26)
확정 입구는 MCP Apps로 한다. 아직 Claude 데스크톱으로 실기 확인을 할 수 없어서 조건부 결정이다. 실기 확인이 실패하면 입구만 바꾸고 확정 로직, 테스트, 폼 HTML은 그대로 쓴다 (기획서 3-2).

### 근거
| 확인 항목 | 결과 | 출처 |
|---|---|---|
| SDK와 맞는 패키지 | `@modelcontextprotocol/ext-apps` 2.0.3(2026-09-25)은 `@modelcontextprotocol/server`/`client`/`core` `^2.0.0`을 peer로 받는다. 프로젝트는 2.3.1로 고정되어 있다. 서버: `registerAppTool`, `registerAppResource`, `getUiCapability`, `RESOURCE_MIME_TYPE`. 화면: `App` (`connect`, `ontoolresult`, `callServerTool`) | npm 레지스트리, 패키지 타입 정의 |
| Claude 데스크톱의 로컬 서버 | `claude_desktop_config.json`에 로컬 서버를 넣는 방법이 문서에 있다. 처음 표시할 때 앱 허용을 묻는다. 플랜, Windows, 최소 버전 조건은 문서에 없다 | Claude 문서: MCP Apps getting started, troubleshooting |
| 화면 전용 공개 범위 | 스펙 MUST: 호스트는 `"model"`이 없는 도구를 에이전트 도구 목록에서 빼고, `"app"`이 없는 도구를 화면에서 부르면 거절한다. 화면 전용 호출은 같은 서버 안에서만 된다 | ext-apps 스펙 2026-01-26 |
| capability 확인 | 스펙 SHOULD: 서버는 `extensions["io.modelcontextprotocol/ui"].mimeTypes`를 확인한 뒤 UI 도구를 등록하고 텍스트 대체 동작을 둔다 | 같음 |
| 폼과 서버의 통신 | 호스트가 도구 입력과 결과를 화면에 전달한다. 화면은 `tools/call`로 서버 도구를 부른다. 기본 CSP는 외부 연결을 막는다(`connect-src 'none'`). 인라인 폼에는 외부 연결이 필요 없다 | 같음 |
| 사람의 클릭 | 스펙에는 표시 허용만 있고 호출마다 승인하는 절차는 없다. 공개 범위는 권한 확인이 아니다. Phase 3의 서버 검증(일회용 초안, 역할, 세션)은 계속 필요하다 | 같음 |

### 검증 단계
| 단계 | 도구 | 확인하는 것 | 확인하지 못하는 것 | 시점 |
|---|---|---|---|---|
| A | SDK 클라이언트가 호스트 역할을 하는 자동 테스트 (4번) | capability에 따른 등록, `_meta.ui`, `ui://` 리소스와 MIME, 폼 → 확정 → 이슈 1건 → 감사 기록, 두 번 클릭·만료·중복 | 화면 렌더링 | 2~4번 개발 중 |
| B | MCP Inspector (`@modelcontextprotocol/inspector`, stdio) | sandbox iframe에 뜬 폼, 버튼 → `confirm_issue` | 모델에게 숨겨지는지 (모델 없음) | 폼 완성 후 |
| C | Claude 데스크톱 | 이 PC에서 로컬 서버 폼 표시, Claude 도구 목록에 없음, 사용하는 프로토콜 세대 | — | 데스크톱 사용 가능 시. 완료 기준에 포함 |

- 2026-10-26: Inspector 2.12.0 CLI가 stdio로 빌드된 서버에 연결해 도구 4개를 가져왔다 (`--method tools/list`, 실행용 복사본 `data/run/phase7-inspector.db`).
- 2026-10-26, 3번 전 B 단계: Inspector 2.12.0 웹 화면이 MCP Apps를 선언했고, `preview_issue` 다음에 폼이 떴다 (초안 `P-4733…`, L4, 2026-09-24, 근거 Q-0002). 확정을 누르자 `tools/call confirm_issue`가 호스트를 거쳐 서버까지 갔고, 서버는 `Tool confirm_issue not found`로 답했다. 3번 전이므로 예상한 결과다. 이슈는 등록되지 않았고, 초안은 `pending`으로 남았으며, 감사 기록은 Q-0001~Q-0003뿐이다. Inspector는 UI capability를 기본으로 선언하고, 화면의 `tools/call`을 서버로 전달한다.
- 2026-10-27, 3~4번 후 B 단계 (실행용 복사본 `data/run/phase7-stageb-confirm.db`, operator `demo`): 폼에서 심각도를 보통 → 높음으로 바꾸자 `수정: 심각도 보통 → 높음`이 표시됐고, 확정하니 심각도 high로 이슈 1건이 등록됐다. 감사 기록에는 `actor: human`으로 `edits: {"severity":"high"}`와 수정 전후 `human_changes`가 남았다(Q-0014). 중복 제목은 폼에서 서버 안내와 함께 거절됐고 초안은 `pending`으로 남았다(Q-0007). 이미 사용한 초안 번호로 `confirm_issue`를 다시 부르자 `already_used`로 거절됐다(Q-0012). 확인용 이슈 4건은 이 실행용 복사본에만 있다.
- Inspector Apps 탭에는 앱 옆에 Inspector 자체의 도구 입력 칸이 있다. 수정은 "이슈 등록 확인" 폼에서 해야 하고, 버튼 옆 `수정:` 문구로 확인한다. 처음 두 번은 입력 칸에서 심각도를 바꿔서 초안 자체가 high였고 `edits`는 비어 있었다.
- 2026-10-28, Phase 5 후속 4번 후 B 단계 (실행용 복사본 `data/run/phase5-severity.db`, operator `demo`, 사용자 실행): 최종 심각도 선택 칸이 빈 값으로 시작했고 제안값이 따로 보였다. 선택 없이 확정하자 폼에서 거절됐고 기록은 없었다. 제안값 보통을 유지하자 `심각도 확인: 보통 · 수정 없음`이 표시됐고 `edits: {"severity":"medium"}`로 medium 이슈가 등록됐다(Q-0004). 새 제목의 두 번째 초안을 높음으로 바꾸자 high로 등록됐고 `human_changes`에 medium → high가 남았다(Q-0006). 자세한 내용은 Phase 5 "후속 1~4번 검증"에 있다.

B 단계 실행 명령 (웹 화면은 실행마다 새 토큰으로 열린다. Tools 탭 `query_production` → 받은 `Q-…`로 Apps 탭 `preview_issue` → 앱 열기 → "이슈 등록 확인" 폼에서 수정 → 확정. 확인마다 새 실행용 복사본을 쓴다):

```powershell
npm run build
npm run db:copy -- --from data/production.db --to data/run/phase7-inspector.db
npx -y @modelcontextprotocol/inspector@2.12.0 node dist/server/index.js --db data/run/phase7-inspector.db --role operator --user demo
```

### 3번 설계에 주는 영향
- **프로토콜 세대가 두 가지다.** SDK v2는 2025 계열(`initialize` 때 capability를 한 번 받음)과 2026-07-28 계열(`initialize` 없이 요청마다 받음)을 모두 처리한다. ext-apps 예제는 `oninitialized`에서 capability를 확인하므로 2025 계열에서만 동작한다.
- **안전한 쪽으로 실패.** 화면 관련 항목은 꺼진 상태로 등록하고, `initialize`에서 UI capability를 선언한 경우에만 켠다. 판단할 수 없는 클라이언트에는 폼도 확정 도구도 생기지 않는다. 2번에서 폼에 대한 이 관문을 만들었고, 3번은 같은 `enable()`에 `confirm_issue`를 더한다. Claude 데스크톱의 세대는 C 단계에서 `mcp-server-<이름>.log`로 확인한다.
- **패키지 추가:** `@modelcontextprotocol/ext-apps` 2.0.3, 정확한 버전 고정 (2026-10-26).

---

## 이슈 등록 미리보기 폼

### 목적
사람이 Claude의 초안을 보고, 고치고, 버튼으로 확정한다. 요청은 Claude를 거치지 않고 폼에서 서버로 간다 (기획서 3-2 ③~⑥).

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 설계 결정 사항
- **서버 쪽은 Phase 3 그대로다.** 새로 붙는 것은 입구뿐이다. 입구 방식이 바뀌어도 확정 로직은 다시 만들지 않는다 (기획서 3-2).
- **두 겹으로 확정 도구를 Claude에게서 떼어 놓는다.** `confirm_issue`는 화면 전용 공개 범위로 모델에게 숨긴다. 또 화면을 지원하지 않는 클라이언트에는 아예 등록하지 않는다. "Claude에게는 확정 도구가 없다"는 보장이 플래그 하나에 기대지 않게 한다.
- **화면은 미리보기 폼 하나뿐이다** (기획서 3-2). 원인 분해 차트, 조회 근거 패널은 MVP 이후다.
- **폼은 서버의 안내를 그대로 보여준다.** 10분 만료, 두 번 클릭(이미 사용됨), 중복은 서버가 거절한다. 폼은 서버의 안내를 표시하고, 필요하면 다시 미리보기를 요청하게 한다.

### 구현 내용 (2번, 2026-10-26)
| 파일 | 내용 |
|---|---|
| `src/server/ui/issue-preview.html` | 혼자 동작하는 화면(View). MCP Apps 화면 프로토콜(스펙 2026-01-26)을 인라인으로 구현하고, 호스트 창과만 `postMessage`로 통신한다: `ui/initialize` → `ui/notifications/initialized`, `ui/notifications/tool-result`로 받은 초안 표시, `ui/notifications/size-changed`, `ping`·`ui/resource-teardown` 응답. 라인, 생산일, 근거 번호, 유효 시간은 읽기 전용이다. 심각도 제안값은 따로 표시하고 사람이 최종 심각도를 선택해야 한다. `edits`에는 선택한 심각도와 변경한 제목·설명을 보낸다. `tools/call confirm_issue {draftId, edits}`는 확정 버튼을 눌렀을 때만 보낸다. 서버 문자열은 `textContent`로만 화면에 넣는다 |
| `src/server/ui/issue-preview.ts` | `ISSUE_PREVIEW_URI`, `supportsMcpApps()`(`io.modelcontextprotocol/ui`의 MIME 타입 선언 확인), `registerIssuePreview()`: 리소스를 꺼진 상태로 등록하고(`registerAppResource`, `text/html;profile=mcp-app`) `enable()`을 돌려준다. `enable()`은 리소스를 켜고 `preview_issue._meta.ui.resourceUri`와 이전 형식 키 `ui/resourceUri`를 넣는다 |
| `src/server/app.ts` | `server.server.oninitialized`에서 `initialize`가 MCP Apps를 선언한 경우에만 `enable()`을 부른다 |
| `src/server/format.ts`, `tools/register.ts`, `toolsets/*` | MCP Apps 클라이언트에만 초안 요약과 `message`가 "사람이 폼에서 확정"으로 바뀐다(`FORM_DRAFT_MESSAGE`). `register()`는 `RegisteredTool`을 돌려주고, 도구 묶음은 `preview_issue` 핸들을 돌려준다 |
| `scripts/copy-assets.mjs` | HTML을 `dist/server/ui/`로 복사한다 |
| `tests/server/issue-preview.test.ts` | 테스트 5개: capability 판단, 텍스트 화면 유지(리소스 4개, `_meta` 없음, 기존 문구), coarse·fine 연결, 혼자 동작하는 HTML, 폼 클라이언트의 초안 문구와 이슈 미등록 |

### 설계 결정 사항 (2번)
- **SDK의 `App` 클래스를 번들링하지 않고 화면 프로토콜을 인라인으로 썼다.** `App`을 쓰면 MCP client, core, zod가 약 400KB 번들로 들어가고 번들러가 필요한데, 프로젝트에는 번들러가 없다. `review-sheet.html`이 이미 인라인 HTML 방식의 선례이고, 메시지 종류는 적고 안정 스펙으로 고정되어 있다. `ext-apps`는 서버 쪽에서 쓴다(`registerAppResource`, `getUiCapability`, MIME 타입과 메타 키 상수).
- **텍스트 클라이언트의 도구·리소스 수는 그대로다.** 평가 실행기, Claude Code, Inspector CLI는 MCP Apps를 선언하지 않으므로 폼과 확정 도구가 없다. Phase 5 후속 1·2·4번에서 설명·정책을 바꾸고 심각도의 잠정 안내를 추가했으며, 기존 평가 동결은 과거 버전의 기록으로 보존한다.
- **Phase 5 후속 4번에서 해결:** `preview_issue`는 폼 미지원 환경에서는 초안까지만 제공하고, 지원 환경에서는 사람이 폼에서 심각도를 선택한다고 설명한다. 이 설명 변경은 동결되지 않았으며, 나중에 평가를 실행하려면 먼저 개발용 실행과 재동결이 필요하다(Phase 5는 2026-10-29 v1으로 마감).
- **`<form>` 제출을 쓰지 않는다.** `allow-forms`가 없는 sandbox iframe에서는 폼 제출이 막힐 수 있으므로 `type="button"` 버튼의 클릭 처리로 확정한다.
- 2026-10-26: MCP Apps를 선언하지 않는 Inspector 2.12.0 CLI로 빌드된 서버에 연결하니 리소스 4개, `preview_issue`의 `_meta` 없음으로 나왔다. Inspector 웹 화면은 MCP Apps를 기본으로 선언하므로(번들의 `defaultAdvertised: true`) B 단계는 웹 화면으로 한다.

### 구현 내용 (3~4번, 2026-10-27)
| 파일 | 내용 |
|---|---|
| `src/core/service.ts` | `createCore()`가 `tools` 옆에 `human.confirmDraft(draftId, edits)`를 돌려준다. core 자신의 세션, writer, clocks로 `createHumanContext()`를 써서 `HumanContext`를 만든다. `tools`에는 계속 확정 연산이 없다 |
| `src/server/ui/issue-preview.ts` | `confirmSchema`(strict: `draftId`와 `edits.severity` 필수, 제목·설명 수정은 선택). `registerIssuePreview(server, preview, human)`: `enable()`은 한 번만 실행되며 폼 리소스를 켜고, `preview_issue`를 연결하고, `registerAppTool`로 `confirm_issue`를 `_meta.ui.visibility: ["app"]`, `readOnlyHint: false`로 등록한다 |
| `src/server/app.ts` | `core.human`은 `registerIssuePreview()`에만 넘긴다 |
| `src/server/format.ts` | 확정 결과 요약 `이슈 등록됨 (I-…)`. `recovery` 안내는 모델용이므로 `confirm_issue` 결과에는 붙이지 않는다 |
| `tests/server/confirm.test.ts` | 테스트 10개: 텍스트·다른 MIME 클라이언트에는 없음(`not found`), coarse·fine에서 strict 스키마의 화면 전용 도구, `core.tools`에 확정 연산 없음, 폼과 같은 호출 → 수정 반영된 이슈 1건·초안 `confirmed`·`human_changes`가 담긴 `human` 성공 감사 기록 1건, 심각도 선택 누락 거절과 제안값을 명시적으로 선택한 확정, 두 번 클릭·만료·중복(제목을 바꾸면 같은 초안으로 재확정 가능), 라인·생산일·근거 수정과 알 수 없는 칸 거절, 다른 세션 초안과 viewer 거절 및 감사 기록 |
| `tests/server/issue-preview-form.test.ts` | 최소 DOM·호스트 테스트 환경에서 실제 인라인 스크립트 실행: 심각도 선택 전 확정 요청 없음, 제안 유지·변경 모두 선택값 전송 |
| `tests/server/issue-preview.test.ts` | 폼 클라이언트는 도구 5개 / 11개이고 `confirm_issue`는 화면 전용, 텍스트 클라이언트에는 확정 도구 없음 |

### 설계 결정 사항 (3~4번)
- **꺼진 상태로 등록하지 않고 `enable()`에서 처음 등록한다.** 꺼진 도구는 `Tool confirm_issue disabled`로 답해서 텍스트 클라이언트에 도구가 있다는 사실을 드러낸다. `initialize`에서 MCP Apps를 선언한 뒤에만 등록하면 `not found`로 답하므로 기획서 3-2의 "아예 등록하지 않는다"와 맞는다. 폼 리소스는 계속 꺼진 상태로 등록한다.
- **입구는 폼이 고칠 수 있는 항목만 받는다.** 라인, 생산일, 근거는 Claude 초안이 인용한 그대로 둔다. core도 근거를 다시 확인하지만, 입구에서 먼저 거절한다.
- **스키마에서 거절된 요청은 감사 기록에 남지 않는다.** 다른 도구와 마찬가지로 잘못된 인자는 처리기 전에 SDK 입력 검증에서 거절된다. 초안 상태에 따른 거절(사용됨, 만료, 중복, 다른 세션, 역할)은 core까지 가서 기록된다.
- **거절된 확정의 감사 기록에는 `draft_id`가 비어 있다.** 실패 결과에 초안 번호가 없어서 번호는 `params`에만 남는다. 기존 core 동작이며 바꾸지 않았고, 테스트는 `params`를 읽는다.
- **심각도는 사람이 결정한다.** Phase 5 후속 4번에 따라 초안을 `proposed`로 표시하고 제안값을 따로 보여주며 화면 전용 입구에서 `edits.severity`를 요구한다. 신뢰된 core 사람 API의 기존 규약은 유지한다. 이슈 심각도의 자동 산정 임계값은 정의하지 않는다. `confirm_issue` 설명은 모델이 보지 않으므로 `issue-preview.ts`에 둔다.
- 후속 검증(2026-10-27): `npm run check` 통과(테스트 221개/파일 22개), `scenarios:check` 통과. 스크립트와 서버 규약을 로컬에서 확인했다. 변경한 심각도 선택 동작은 2026-10-28 Inspector 확인을 통과했고, 데스크톱 확인은 C 단계에 남아 있다. Phase 5에서 바뀐 설명·정책은 동결되지 않았으며, 나중에 평가를 실행하려면 먼저 D01~D10 전체 개발용 실행과 재동결이 필요하다(Phase 5는 2026-10-29 v1으로 마감).
- 확인: `npm run check` 통과 (테스트 파일 21개, 테스트 216개).

---

## 데모와 문서

### 목적
실제로 동작하는 모습을 보여준다 (기획서 6장). 짧은 영상과 따라 하면 바로 실행되는 설치 문서를 만든다.

### 핵심 클래스 / 구조
위 영어 섹션 표와 동일.

### 설계 결정 사항
- **데모는 새 DB 복사본으로 녹화한다.** 그래야 감사 기록에 데모의 호출만 남는다.
- **문서의 모든 명령은 게시 전에 새로 받은 저장소에서 실행해 본다.** 확인하지 않은 명령은 쓰지 않는다.
- **6번 (2026-10-27).** `docs/INSTALL.md`는 `ee85cde`를 새로 받은 저장소에서 확인했다(Windows 10, Node 24.14.0, npm 11.9.0, Visual Studio 없음). 그냥 `npm ci`는 실패했다. 잠금 파일에 `better-sqlite3`의 `gypfile: false`가 없어서, 미리 빌드된 파일이 있는데도 npm이 소스 컴파일을 시도한다. `npm ci --ignore-scripts`는 성공했고 `generate`, `validate`, `check`, `db:copy`, `mcp:config`, `mcp:demo`가 모두 종료 코드 0이었다. README 빠른 시작에 이 내용을 적었다. `docs/EVALUATION.md`는 동결된 v1 결과를 정리하고 후속 항목은 Phase 5로 연결한다.
- **README 영상을 데모 영상으로 한다** (사용자 결정, 2026-10-28). 5번과 7번을 이것으로 마무리한다. 약 6분 데모, README GIF, 재생 페이지 영상은 만들지 않는다. 90초 무음 영상(1920×1080 · 30fps, 화면은 영어, 한국어 자막)이고, 장 구성은 WHY → HOW → DEMO → FEATURES → SAFEGUARDS → RESULTS다. `promo-video/`에서 Remotion 4.0.515로 만들었고, README에는 GitHub user-attachments 주소로 넣었다(c208756). DEMO 장은 출처 표시를 단 실제 기록 두 개를 쓴다. 평가 실행 S10(답변)과 MCP Inspector B 단계(폼, 감사 기록)다.

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
- MCP Apps를 지원하는 Claude 데스크톱 (C 단계에서 버전 기록).
- MCP Apps 패키지: `@modelcontextprotocol/ext-apps` 2.0.3, 정확한 버전 고정.
- B 단계용 MCP Inspector. `npx`로 실행하며 프로젝트 의존성에 넣지 않음 (Node 22.19 이상).

---

## 개발 시 주의사항
- **완료 기준:**
  - Claude 데스크톱에서 `preview_issue` 다음에 폼이 뜨고, 확정하면 이슈가 정확히 1건 등록된다.
  - 두 번 클릭, 만료, 중복은 각각 안내와 함께 거절된다.
  - 모델의 도구 목록에 `confirm_issue`가 없다.
  - 데모 영상과 문서가 게시되어 있다.
- **미리보기 화면 방식** (기획서 10장): 2026-10-26에 MCP Apps로 조건부 채택했다 (방식 확인 참고). Claude 데스크톱 확인이 실패하면 다른 입구를 정한다. 서버의 확정 로직은 그대로다.
- **서버는 누가 버튼을 눌렀는지 직접 볼 수 없다.** 보장은 세 가지가 함께 만든다: 호스트의 화면 전용 공개 범위, 화면 미지원 클라이언트에 등록하지 않기, 일회용 초안 번호. 이 점을 문서에 솔직하게 적는다.
- **Phase 5 실행기는 화면이 없다.** 그래서 확정 경로는 평가 실행이 아니라 단위 테스트와 수동 데모로 확인한다.
- **용어집의 범위 표기가 취소선으로 보인다.** `resources/glossary.md`는 `08:00~08:20`처럼 범위를 쓰는데, Markdown 화면(Inspector, GitHub)은 짝을 이룬 `~`를 취소선으로 처리한다. 모델은 원문을 받으므로 답변에는 영향이 없다. 평가 실행기가 이 리소스를 시스템 프롬프트에 넣으므로, 사용자가 결정할 때까지 바꾸지 않는다.
- **붙여넣기 방식 비교**(기획서 3-5)는 개발 완료 후 별도 테스트로 진행하며, 이 Phase에 포함하지 않는다.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-21 | 최초 작성 |
| 2026-10-26 | 상태 진행 중, 우선 범위 1~4번, 1번 조건부 결정(MCP Apps)과 검증 단계 A/B/C 기록 |
| 2026-10-26 | 2번 구현: 폼 화면, 조건부 리소스, `preview_issue` UI 메타, 폼 클라이언트용 초안 문구, 테스트 5개 (전체 206개) |
| 2026-10-26 | 3번 전 B 단계: Inspector 웹 화면에서 폼 렌더링 확인, 확정 요청이 서버까지 도달 (`confirm_issue`는 아직 미등록) |
| 2026-10-26 | 진행 상황 요약, 구현된 폼 섹션 정리, 3~4번 계획 기록, README 동기화 |
| 2026-10-27 | 3~4번 구현: 사람 입구 `core.human`, `enable()`에서 등록하는 화면 전용 `confirm_issue`, 확정 테스트 10개 (전체 216개), B 단계 재확인 통과 |
| 2026-10-27 | 5번: 데모 영상을 약 6분, 사용자 제작으로 변경 |
| 2026-10-27 | 6번: `docs/INSTALL.md`(새 클론 확인, 빌드 도구 없는 Windows의 `npm ci --ignore-scripts`), `docs/EVALUATION.md`, README 연결 |
| 2026-10-27 | Phase 5 후속 4번: 심각도 제안을 따로 표시하고 폼의 최종 선택 및 화면 전용 스키마의 `edits.severity`를 필수로 했다. 선택값을 이슈·감사 기록에 반영한다. 실제 스크립트 테스트 추가, `npm run check` 통과(221개/파일 22개). 변경 동작의 Inspector/Desktop 화면 확인은 대기 중이다. |
| 2026-10-28 | 홍보 영상 기록: 90초 Remotion 티저(`promo-video/`)를 README에 넣음(c208756). 5번과 별개이며 5번은 그대로 남음 |
| 2026-10-28 | 5번·7번을 README 영상으로 마무리(사용자 결정). 약 6분 데모, README GIF, 재생 페이지 영상은 만들지 않음 |
| 2026-10-28 | Phase 5 후속 4번 B 단계 재확인 통과: 빈 값으로 시작, 선택 없는 확정 거절, 제안 유지 시 medium 등록, 제안 변경 시 high 등록과 전후 감사 기록 |
