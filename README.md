🌐 [한국어](./README_ko.md) | [English](./README.md)

# shopfloor-mcp

> MCP server that lets Claude answer shop-floor production questions with server-computed numbers and traceable evidence — and register issues only after a human confirms.

**Status: Phase 1 complete.** The TypeScript foundation, SQLite data generator, independent answer key, and 17 validation rules are implemented. The default dataset contains 69,835 rows in 11 tables. MCP integration starts in Phase 4.

## Overview

Checking production results on the shop floor means opening sheets or dashboards, applying filters, and comparing periods by hand. Scheduled reports answer only predefined questions, so ad-hoc questions such as "Why did Line 2 miss its target yesterday?" still require someone to dig through the data — and registering an issue afterwards happens in yet another screen.

This project builds an MCP server that Claude Desktop connects to. Claude picks the server's tools based on a natural-language question, the server performs every calculation and returns numbers with an evidence ID, and Claude only interprets. The only data-changing action, issue registration, stops at a draft: a human confirms it with a button.

Built as a portfolio project. Earlier projects embedded AI inside an app; this one focuses on designing the tools an AI uses. It runs on a synthetic dataset (6 lines, 3 months) with deliberately planted events and traps, plus an answer key used to grade Claude's answers.

## Table of Contents

- [Operation Flow](#operation-flow)
- [Technology Stack](#technology-stack)
- [AI Components](#ai-components)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Current Status](#current-status)
- [Documents](#documents)
- [Limitations](#limitations)
- [Future Plans](#future-plans)

## Operation Flow

Planned flow:

```
User asks in Claude Desktop ("Why is Line 4 below target?")
  → Claude selects a server tool via MCP
    → Server resolves the period by production day (fixed reference time: 2026-10-01 08:00)
      → Server computes from SQLite (read-only): achievement, loss breakdown, hourly patterns
        → Response: summary + evidence ID + data-as-of time
          → Claude interprets and answers, citing evidence IDs
            → Issue request: Claude creates a draft only → a human confirms with a button → audit log
```

## Technology Stack

Phase 1 uses Node.js 24.14.0, TypeScript, SQLite (`better-sqlite3`), zod, and Vitest. MCP, client integration, and the replay page below are planned for later phases.

| Technology | Role | Why |
|---|---|---|
| TypeScript | Data generator and validator; future MCP server | One language for the dataset tools, server, and future HTML/JS confirmation form |
| SQLite | Production data, issues, audit log | Single file with no DB server; a fixed seed reproduces production values, while each generation is identified separately |
| MCP (Model Context Protocol) | Connection between Claude and the server | Claude Desktop handles the chat and tool-call loop; the same server can be reused by other MCP clients |
| Claude Desktop | Client (chat, tool selection, answers) | No custom chat frontend to build or pay API costs for |
| MCP Apps (Phase 7, under review) | Issue confirmation form inside the conversation | The server provides the screen, so no separate frontend is needed |
| Static page (GitHub Pages) | Evaluation replay page | No AI calls, so it costs nothing and can be shared by link without login |

## AI Components

The following describes the planned server behavior; Phase 1 does not call an AI service.

### Who does what

| Handled by Claude | Handled by the server (rule-based) |
|---|---|
| Understanding the question | Resolving "yesterday" and "this week" into production days |
| Choosing which tools to call | Shift changes and planned stops (removed from targets and losses) |
| Interpreting results and writing the answer | Every number: totals, achievement, loss breakdown (downtime / speed / defects), hourly patterns |
| Drafting an issue | Distinguishing out-of-range, non-working day, planned stop, missing data, zero production, and query failure |
| | Permissions, duplicate prevention, evidence IDs, audit log |

### Nature of AI output

Claude interprets; it does not calculate. Every number in an answer comes from a server response and can be traced through its evidence ID in the audit log.

### Safety by structure, not by prompt

- **Issue registration:** Claude can only create a draft. The confirm tool is not in Claude's tool list. A human confirms with a button, and the server accepts it only with a one-time draft ID (10-minute expiry, single use).
- **Free-text memos:** memo fields are passed as reference data so that instructions hidden in them are not followed. Even if Claude is fooled, the result stops at a draft.
- **Worker data:** worker IDs are never returned by any tool, so per-worker rankings cannot be produced. Aggregation stops at line and shift crew.

### Failure handling

Errors tell Claude what went wrong and what is possible, so it can recover by itself. Example: "October production days have not started yet. Available range: 7/1–9/30. Use September?"

### How AI behavior is verified (planned)

- 30 frozen evaluation scenarios across 8 types: simple lookup, multi-step analysis, recurring pattern, ambiguous question, missing data and traps, out-of-permission request, change request, attack attempt
- 10 separate development scenarios used only for tuning tool descriptions
- Grading against an answer key computed from the planted events, independently of the server's calculation code
- Comparison of a coarse-grained and a fine-grained tool design
- The model version is pinned and recorded for each evaluation run

## Quick Start

Requires **Node.js 24.14.0 and npm 11.x**. Run these commands from this project directory (`production-mcp/`):

```sh
npm ci
npm run generate
npm run validate
npm run check
```

`generate` creates four files in `data/`: `production.db`, `answer_key.json`, `validation.json`, and the `generator.config.json` snapshot. The DB covers July–September 2026: six lines, 66 production days, and all nine planted events. No API key or external database is needed.

The first generation has already been created in the development workspace. On subsequent runs, choose an unused directory; existing generation files are never overwritten:

```sh
npm run generate -- --out-dir data/run-02
npm run validate -- --db data/run-02/production.db --json
```

Each generation receives a new `dataset_version` and actual creation time. A DB copy retains them; its answer key must have the same version. These identity checks do not compare production content between generations.

Edit [config/generator.config.json](config/generator.config.json) to change generation settings, or pass `--config path` to `generate`. Validation defaults to the snapshot beside the DB, so source-config changes do not change how an older generation is validated. Generated bundles are git-ignored and should be regenerated together.

`npm run check` runs type checking, the 37 tests, and the build. Tests cover event totals, corrupted records, date boundaries, rollback, and dataset identity. All passed on 2026-10-21. For individual checks use `npm test`, `npm run typecheck`, or `npm run build`. After building, the CLIs also run with plain Node.js:

```sh
node dist/generator/index.js --out-dir data/run-03
node dist/validator/index.js --db data/run-03/production.db
```

Claude Desktop connection instructions will be added in Phase 4.

## Project Structure

Current files:

```
shopfloor-mcp/
├── plan/
│   ├── 01_production-mcp-server.md    # Project plan (goals, tools, evaluation, scope)
│   └── 01a_production-mcp-dataset.md  # Dataset design (data architecture, tables, planted events)
├── Phase/
│   ├── Phase1_Foundation.md           # ✅ Completed
│   ├── Phase2_EvaluationScenarios.md  # 🔲 Not started
│   ├── Phase3_CoreLogic.md            # 🔲 Not started
│   ├── Phase4_McpServer.md            # 🔲 Not started
│   ├── Phase5_Evaluation.md           # 🔲 Not started
│   ├── Phase6_ResultReplayPage.md     # 🔲 Not started
│   └── Phase7_ConfirmationAndDemo.md  # 🔲 Not started
├── config/generator.config.json      # Seed, normal ranges, E1–E9, seed issues
├── src/
│   ├── shared/                       # Row types, time helpers, code labels
│   ├── generator/                    # SQLite schema and dataset generation
│   ├── answer-key/                   # Independent event aggregates
│   └── validator/                    # V01–V17 and CLI
├── tests/                            # 37 tests across four files
├── scripts/copy-assets.mjs           # Copy SQL schema into dist/ on build
├── data/                             # Generated bundle, git-ignored
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── .node-version
├── .claude/skills/                    # Claude Code skills used during development
├── .gitignore
├── README.md
└── README_ko.md
```

## Current Status

| Phase | Status | Deliverable |
|---|---|---|
| Phase 0 — Design | ✅ Done | Project plan + dataset design (11 tables, 9 planted events, answer key spec) |
| Phase 1 — Foundation | ✅ Done | TypeScript project, data generator (11 tables, 69,835 rows), answer key, 17 validation rules, 37 passing tests |
| Phase 2 — Evaluation scenarios | 📋 Planned | 30 frozen evaluation scenarios (8 types) + 10 development scenarios |
| Phase 3 — Core server logic | 📋 Planned | Period resolution, six data states, calculations, evidence IDs, audit log, draft/confirm logic (no MCP) |
| Phase 4 — MCP server | 📋 Planned | 10 Claude-callable tools / 4 resources / 2 prompts, in fine- and coarse-grained tool sets |
| Phase 5 — Evaluation | 📋 Planned | Evaluation runner, tuning on development scenarios, 30-scenario evaluation, tool-set comparison |
| Phase 6 — Result replay page | 📋 Planned | Static page on GitHub Pages |
| Phase 7 — Confirmation screen & demo | 📋 Planned | In-conversation issue confirmation form (MCP Apps under review; the 11th tool, human button only), demo video, documentation |

Phases 1–6 are development stage 1 (text-only); Phase 7 is development stage 2. Details are in [Phase/](Phase/).

## Documents

The plan documents are written in Korean; the Phase documents are in English and Korean.

| Document | Contents |
|---|---|
| [plan/01_production-mcp-server.md](plan/01_production-mcp-server.md) | Project plan: problem, tools, server logic, issue confirmation principle, evaluation, scope, risks, decisions |
| [plan/01a_production-mcp-dataset.md](plan/01a_production-mcp-dataset.md) | Dataset design: data architecture, all table columns, planted events E1–E9, answer key, validation rules |
| [Phase/](Phase/) | Plans and implementation records per phase (TypeScript): modules, design decisions, completion checks |

## Limitations

- Phase 1 supplies data and validation; server calculations, MCP tools, AI evaluation, and the UI are planned for later phases.
- Production quantities are hourly totals. The validator checks capacity after shift changes; it cannot prove the exact minute each good unit was produced.
- Synthetic data only; no connection to real plant systems.
- Local only: the server runs on the user's PC through Claude Desktop. No remote deployment or login.
- Simplified compared to real MES data: one product per line, no production orders, no equipment-level records, no public holidays.
- A single fixed reference time (2026-10-01 08:00); the data does not change over time.

## Future Plans

After the MVP:

- Paste-in comparison: run the same scenarios by pasting data directly into Claude without MCP
- Additional screens: loss breakdown chart, evidence panel
- Target attainment forecast, recurring-issue linking, shift handover template, AI activity log view
- Connect a RAG project as a second MCP server to combine production data with internal rules

---
<p align="center">Made with AI-assisted development</p>
