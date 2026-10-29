🌐 [한국어](./README_ko.md) | [English](./README.md)

# shopfloor-mcp

> MCP server that lets Claude answer shop-floor production questions with server-computed numbers and traceable evidence — and register issues only after a human confirms.

<p align="center">
  <a href="https://soyeonahn3.github.io/shopfloor-mcp/">
    <img src="https://img.shields.io/badge/Evaluation_Replay-View_on_GitHub_Pages-2ea44f?style=for-the-badge&logo=githubpages&logoColor=white" alt="Evaluation replay page">
  </a>
</p>

<p align="center">
  🔎 <b>See how Claude answered all 30 eval questions</b><br>
  question → tool calls → server responses → final answer → answer key · coarse vs fine tool sets
</p>

https://github.com/user-attachments/assets/1206e12b-e5bd-408a-937a-4151fa7e9af9

## Overview

Checking production results on the shop floor means opening sheets or dashboards, applying filters and comparing periods by hand. Scheduled reports answer only predefined questions, so ad-hoc questions such as "Why did Line 2 miss its target yesterday?" still require someone to dig through the data, and registering an issue happens in yet another screen.

This project builds an MCP server for Claude Desktop. Claude picks the server's tools from a natural-language question; the server performs every calculation and returns numbers with an evidence ID; Claude only interprets. The only data-changing action, issue registration, stops at a draft that a human confirms with a button.

Built as a portfolio project focused on designing the tools an AI uses, rather than embedding AI in an app. It runs on a synthetic dataset (6 lines, 3 months, 11 tables, 69,835 rows) with planted events and traps, plus an independent answer key used to grade Claude's answers.

## Table of Contents

- [Operation Flow](#operation-flow)
- [Technology Stack](#technology-stack)
- [AI Components](#ai-components)
- [Quick Start](#quick-start)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Current Status](#current-status)
- [Documents](#documents)
- [Limitations](#limitations)
- [Future Plans](#future-plans)

## Operation Flow

```
User asks in Claude Desktop ("Why is Line 4 below target?")
  → Claude selects a server tool via MCP
    → Server resolves the period by production day (fixed reference time: 2026-10-01 08:00 KST)
      → Server computes from a SQLite runtime copy: achievement, loss breakdown, hourly patterns
        → Response: summary + evidence ID + data-as-of time
          → Claude interprets and answers, citing evidence IDs
            → Issue request: Claude creates a draft only → confirmation form → human confirms → audit log
```

The last step works in MCP Inspector: the form's button calls the human-only `confirm_issue`, which registers one issue and writes a human audit entry. The Claude Desktop check is next (Phase 7).

## Technology Stack

| Technology | Role | Why |
|---|---|---|
| Node.js 24.14.0 + TypeScript | Data generator, validator, core, MCP server, eval runner, replay page | One language for the dataset tools, server and browser code; versions pinned in `package.json` and `.node-version` |
| SQLite (`better-sqlite3`) | Production data, issues, audit log | Single file with no DB server; the server writes only to a runtime copy, never the generated source |
| zod | Validation of tool inputs, settings and scenario JSON | Strict schemas reject unknown fields, so a tool input cannot change role or bypass checks |
| MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `client`) | Server tools/resources/prompts over stdio; client for demo and eval | Claude Desktop handles chat and the tool-call loop; the eval runner connects to the built server the same way a real client does |
| MCP Apps (`@modelcontextprotocol/ext-apps`) | Issue confirmation form inside the conversation | The server provides the screen, so no separate frontend is needed; only clients that declare MCP Apps get it |
| Claude Desktop | Client (chat, tool selection, answers) | No custom chat frontend to build or API cost for everyday use |
| Anthropic SDK (`@anthropic-ai/sdk`) | Eval runner only | Runs frozen questions against a pinned model with token counting and a cost ceiling; the server itself never calls an AI service |
| Vitest | Test runner | Runs TypeScript ESM tests directly, with real SQLite and stdio fixtures |
| Static page + GitHub Pages | Evaluation replay page | No AI calls and no login, so results can be shared by link at no cost |

## AI Components

### Who does what

| Handled by Claude | Handled by the server (rule-based) |
|---|---|
| Understanding the question | Resolving "yesterday" and "this week" into production days |
| Choosing which tools to call | Shift changes and planned stops (removed from targets and losses) |
| Interpreting results and writing the answer | Every number: totals, achievement, loss breakdown (downtime / speed / defects), hourly patterns |
| Drafting an issue | Distinguishing out-of-range, non-working day, planned stop, missing data, zero production and query failure |
| | Permissions, duplicate prevention, evidence IDs, audit log |

### Nature of AI output

Claude interprets; it does not calculate. Every number in an answer comes from a server response and can be traced through its evidence ID in the audit log. Issue drafts are proposals; only a human confirmation registers an issue.

### Model selection

- **Everyday use:** the server does not choose or call a model. The model is whatever the user selects in Claude Desktop (or another MCP client).
- **Evaluation:** the runner defaults to `claude-sonnet-5-5`, overridable with `ANTHROPIC_MODEL` or `--model`. The model, settings hashes and estimated cost are recorded with every run.

### Safety by structure, not by prompt

- **Issue registration:** Claude can only create a draft. The confirm tool is not in Claude's tool list; the server accepts a confirmation only with a one-time draft ID (10-minute expiry, single use).
- **Free-text memos:** memo fields are wrapped as reference data so instructions hidden in them are not followed. Even if Claude is fooled, the result stops at a draft.
- **Worker data:** worker IDs are never returned, so per-worker rankings cannot be produced. Aggregation stops at line and shift crew.
- **Roles:** viewer/operator is set only in the server launch settings; no tool input can change it.

### Failure handling

Errors tell Claude what went wrong and what is possible, so it can recover. Example: "October production days have not started yet. Available range: 7/1–9/30. Use September?"

### How AI behavior is verified

- 30 frozen eval scenarios across 8 types (simple lookup, multi-step analysis, recurring pattern, ambiguous question, missing data and traps, out-of-permission request, change request, attack attempt), plus 10 dev scenarios used only for tuning tool descriptions
- Grading against an answer key computed from the planted events, independent of the server's calculation code, followed by human review of every record
- Two tool sets compared on `claude-sonnet-5-5`, N=1, all 60 records human-reviewed. Both run the same calculations and return the same results; only the tools Claude sees differ. **coarse** (default) groups related functions into 4 tools selected by `mode`; **fine** gives each function its own tool, 10 in total. A score gap therefore reflects tool design, not calculation. Tool map: [Phase 4](Phase/Phase4_McpServer.md#tool-sets-coarse-vs-fine).

| Tool set | Final accuracy | Avg. tool calls | Avg. time (s) |
|---|---:|---:|---:|
| coarse (default) | 28/30 (93.3%) | 1.60 | 9.88 |
| fine | 26/30 (86.7%) | 1.97 | 10.32 |

Every step can be replayed at [soyeonahn3.github.io/shopfloor-mcp](https://soyeonahn3.github.io/shopfloor-mcp/). Conditions, per-type results and limits: [docs/EVALUATION.md](docs/EVALUATION.md).

## Quick Start

### Prerequisites

- Node.js 24.14.0 and npm 11.x
- Claude Desktop (optional) to ask questions in natural language
- An Anthropic API key only for the paid evaluation runner; nothing else needs a key or external database

### Install, generate data, verify

Run from the repository root:

```sh
npm ci
npm run generate
npm run validate
npm run check
```

`generate` writes `production.db`, `answer_key.json`, `validation.json` and a config snapshot to `data/` (git-ignored). Existing generation files are never overwritten; use `npm run generate -- --out-dir <new-dir>` for another bundle. `check` runs type checking, all tests and the build.

On Windows without C++ build tools, `npm ci` fails with `gyp ERR! find VS`; use `npm ci --ignore-scripts` instead. Step-by-step setup with expected results: [docs/INSTALL.md](docs/INSTALL.md).

### Connect to Claude

```sh
npm run db:copy -- --from data/production.db --to data/run/phase4-production.db
npm run --silent mcp:config -- --db data/run/phase4-production.db --role viewer --user demo
```

Merge the printed `mcpServers.shopfloor` entry into the Claude Desktop config and restart. Use `--role operator` to try issue drafts. See [docs/MCP_SETUP.md](docs/MCP_SETUP.md) for Claude Desktop/Code details.

To check the server without a model:

```sh
npm run mcp:demo -- --db data/production.db
```

### Environment variables

Needed only for `npm run eval`. Copy `.env.example` to `.env`:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | API key for the eval runner |
| `ANTHROPIC_MODEL` | Eval model (default `claude-sonnet-5-5`) |
| `EVAL_MAX_COST_USD` | Estimated cost ceiling per eval command (default 5) |

### Other commands

| Command | Purpose | Details |
|---|---|---|
| `npm run core:demo` | Run core calculations on a temporary DB copy without MCP or AI | [Phase 3](Phase/Phase3_CoreLogic.md) |
| `npm run scenarios:check` | Verify frozen scenarios against the bound dataset | [Phase 2](Phase/Phase2_EvaluationScenarios.md) |
| `npm run eval -- --set dev --toolset coarse --ids D01` | Live evaluation (**billed**) | [Phase 5](Phase/Phase5_Evaluation.md) |
| `npm run eval:review` / `eval:sheet` / `eval:summary` | Human review records, review page, results summary | [Phase 5](Phase/Phase5_Evaluation.md) |
| `npm run site:data` / `site:build` / `site:serve` | Build and preview the replay page (`http://127.0.0.1:4173/`) | [Phase 6](Phase/Phase6_ResultReplayPage.md) |

The confirmation form can be viewed in MCP Inspector without Claude Desktop; see [Phase 7](Phase/Phase7_ConfirmationAndDemo.md).

## Testing

```sh
npm run check                 # typecheck + 239 tests in 22 files + build + replay data check
npm test                      # tests only
npx vitest run tests/server   # one area: answer-key, core, eval, generator, server, shared, site, validator
```

Tests never read `.env` or call a paid API. They use real SQLite fixtures and the built stdio server, and cover period resolution, metrics and status handling, guarded drafts, coarse/fine tool parity, permissions and privacy, eval grading and review integrity, and the replay page data build. No coverage report is configured.

Known environment issue: if the project path contains non-ASCII characters, `tests/eval/scenarios.test.ts` fails to run because of a Node.js `fs.cpSync` crash.

## Project Structure

```
shopfloor-mcp/
├── src/
│   ├── shared/            # Row types, time helpers, code labels
│   ├── generator/         # SQLite schema and dataset generation
│   ├── answer-key/        # Independent event and weekly aggregates (grading only)
│   ├── validator/         # Validation rules V01–V17 and CLI
│   ├── core/              # Periods, metrics, analysis, audit, guarded issue drafts
│   ├── server/            # MCP tools (coarse/fine), resources, prompts, stdio, MCP Apps form (ui/)
│   └── eval/              # Eval runner, grading, freeze checks, human review
├── tests/                 # 239 tests in 22 files
├── eval/
│   ├── scenarios/         # 30 eval + 10 dev scenarios, lock, question catalogue
│   ├── runs/              # Recorded eval runs
│   ├── reviews/           # Human review records and review sheet
│   └── summary.md         # Results summary
├── site/                  # Replay page source and committed data
├── resources/             # Glossary, data guide, anomaly criteria (exposed as MCP resources)
├── config/                # Data generator settings (seed, ranges, planted events E1–E9)
├── scripts/               # Demos, runtime DB copy, client config, freeze, page data
├── docs/INSTALL.md        # Step-by-step installation (verified on a clean clone)
├── docs/EVALUATION.md     # Evaluation report
├── docs/MCP_SETUP.md      # Client connection guide
├── plan/                  # Project plan, dataset design, and work plans
├── Phase/                 # Per-phase design and implementation records
├── .github/workflows/     # Replay page check and GitHub Pages deployment
├── .claude/               # Claude Code skills and guard hooks
├── data/                  # Generated bundles (git-ignored)
├── .env.example           # Eval settings template
├── CLAUDE.md              # Project rules for Claude Code
├── package.json
└── README.md / README_ko.md
```

## Current Status

| Phase | Status | Deliverable |
|---|---|---|
| Phase 0 — Design | ✅ Done | Project plan + dataset design (11 tables, 9 planted events, answer key spec) |
| Phase 1 — Foundation | ✅ Done | Data generator (69,835 rows), answer key, 17 validation rules |
| Phase 2 — Evaluation scenarios | ✅ Done | 30 frozen eval + 10 dev scenarios with a dataset-bound lock |
| Phase 3 — Core server logic | ✅ Done | Period resolution, six data states, metrics/analysis, audited API, guarded draft/confirm |
| Phase 4 — MCP server | ✅ Done | 4 default / 10 fine tools, 4 resources, 2 prompts over stdio |
| Phase 5 — Evaluation | ✅ Done | Live eval runner and human-reviewed Sonnet results (93.3% / 86.7%) |
| Phase 6 — Result replay page | ✅ Done | Static bilingual replay page published on GitHub Pages |
| Phase 7 — Confirmation screen & demo | 🔧 In Progress | Issue confirmation form and app-only `confirm_issue` via MCP Apps (checked in MCP Inspector); Claude Desktop check next |

Phases 1–6 are development stage 1 (text-only); Phase 7 is stage 2. Claude Desktop acceptance of the Phase 4 tools and the Phase 7 form is still a manual check.

## Documents

| Document | Contents |
|---|---|
| [plan/01_production-mcp-server.md](plan/01_production-mcp-server.md) | Project plan: problem, tools, issue confirmation principle, evaluation, scope, decisions (Korean) |
| [plan/01a_production-mcp-dataset.md](plan/01a_production-mcp-dataset.md) | Dataset design: tables, planted events E1–E9, answer key, validation rules (Korean) |
| [plan/02_phase5-grader-server-version.md](plan/02_phase5-grader-server-version.md) | Phase 5 follow-up plan: value-check labels (#7) and server build identification (Korean) |
| [Phase/](Phase/) | Per-phase design decisions, implementation and checks (English and Korean) |
| [docs/INSTALL.md](docs/INSTALL.md) | Clone → install → generate → check → runtime copy → Claude Desktop, with expected results |
| [docs/EVALUATION.md](docs/EVALUATION.md) | Evaluation conditions, results by type, failures, tuning log, limits |
| [docs/MCP_SETUP.md](docs/MCP_SETUP.md) | Build, runtime DB copy, Claude Desktop/Code connection, tool list |
| [eval/scenarios/README.md](eval/scenarios/README.md) | Questions and expected behavior for all 40 scenarios (Korean) |
| [eval/summary.md](eval/summary.md) | Eval runs, costs and final accuracy |
| [resources/](resources/) | Glossary, data guide and anomaly criteria served to Claude |
| [Replay page](https://soyeonahn3.github.io/shopfloor-mcp/) | Step-by-step replay of all eval scenarios |

## Limitations

- Evaluation is N=1, so run-to-run variance is not measured. Automatic checks are provisional; final accuracy comes from human review.
- Phase 5 is closed on v1 (2026-10-29): the published accuracy is the v1 result and does not measure later changes. Follow-ups #1–#4 (metric descriptions, availability policy, Korean downtime labels, human selection of final issue severity) were checked on dev scenarios only; #7 (value grading) and #9 (prompt caching) are implemented. The v2 reevaluation was dropped because the follow-ups were chosen from the eval set's own failures; #5/#6 (asking for an ambiguous criterion, standard advice when data is missing) are not implemented. The current descriptions/policy are not frozen, so a new eval run needs dev runs and a refreeze first.
- The confirmation form is checked in MCP Inspector only; Claude Desktop acceptance is pending. The server cannot see who pressed the button: the guarantee rests on app-only visibility in the host, no registration for clients without MCP Apps, and one-time draft IDs.
- Synthetic data only; no connection to real plant systems. Simplified compared to real MES data: one product per line, no production orders, no equipment-level records, no public holidays.
- Production quantities are hourly totals; the validator checks capacity but cannot prove the minute each unit was produced.
- Local only: the server runs on the user's PC. No remote deployment or login.
- A single fixed reference time (2026-10-01 08:00); the data does not change over time.

## Future Plans

**Phase 7 (next)**
- Claude Desktop check of the form and of `confirm_issue`'s absence from Claude's tool list

**Evaluation (after development, conditional)**
- Build a new, unseen eval scenario set before any further evaluation, so improvements are not measured on the questions they were chosen from (see the closing decision in `Phase/Phase5_Evaluation.md`)
- On that set, compare with `claude-opus-5-5` on the coarse tools only if failures that look like model judgement remain

---
<p align="center">Made with AI-assisted development</p>
