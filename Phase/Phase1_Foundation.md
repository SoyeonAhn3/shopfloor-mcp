# Phase 1 — Foundation (Dataset & Answer Key) `✅ Completed`

> Set up the TypeScript project and build the synthetic production DB, its answer key, and automatic validation from one fixed-seed config.

**Status**: ✅ Completed (2026-10-21)
**Prerequisites**: Phase 0 (design) complete: `plan/01_production-mcp-server.md`, `plan/01a_production-mcp-dataset.md`

---

## Overview

Phase 1 builds what the server and the evaluation stand on. It covers four things:

- the project skeleton
- a data generator that writes the 11-table SQLite DB (`data/production.db`, 69,835 rows with the default config) with the planted events E1–E9
- an answer key (`data/answer_key.json`) computed from the planted values
- a validator that checks the 17 rules in dataset design §8

There is no MCP and no AI yet. This is development stage 1, which is text-only.

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| 1 | Project skeleton (`package.json`, `tsconfig.json`, Vitest, npm scripts, `src/shared/`) | ✅ | general |
| 2 | `config/generator.config.json` + `src/generator/config.ts` (config schema) | ✅ | project-specific |
| 3 | `src/generator/` (data generator → `data/production.db`) | ✅ | project-specific |
| 4 | `src/answer-key/` (answer key → `data/answer_key.json`) | ✅ | project-specific |
| 5 | `src/validator/` (17 validation rules) | ✅ | project-specific |
| 6 | `tests/shared/`, `tests/generator/`, `tests/answer-key/`, `tests/validator/` (37 tests) | ✅ | general |

---

## Project Skeleton

### Purpose
Provide one TypeScript project for the generator, server, evaluation runner and replay page, with shared types and time helpers.

### Implementation Files
| File | Role |
|---|---|
| `package.json` | **New**: dependencies, `engines`, npm scripts |
| `tsconfig.json` | **New**: `strict: true`, ES modules |
| `tsconfig.build.json`, `scripts/copy-assets.mjs` | Compile to `dist/` and copy the SQL schema |
| `vitest.config.ts` | **New**: test runner config |
| `.node-version`, `package-lock.json` | Pin Node.js and dependency versions |
| `src/shared/time.ts` | **New**: local-time text, production day, slot helpers |
| `src/shared/codes.ts` | **New**: enum codes ↔ Korean labels (`day` → 주간, `minor_stop` → 순간 정지) |
| `src/shared/types.ts` | **New**: row types for the 11 tables |
| `src/shared/files.ts` | Remove only verified project-owned temporary directories |

### Core Classes / Structure
```
shopfloor-mcp/
├── config/generator.config.json   # lines, normal rules, events E1–E9, seed
├── src/
│   ├── shared/        # types, time helpers, code labels (used by every module)
│   ├── generator/     # Phase 1
│   ├── answer-key/    # Phase 1. Never imported by core/ or server/
│   ├── validator/     # Phase 1
│   ├── core/          # Planned, not created: Phase 3
│   ├── server/        # Planned, not created: Phase 4
│   └── eval/          # Planned, not created: Phase 2, 5
├── data/              # Generated DB, key, validation report, config snapshot; all git-ignored
└── tests/
```
```
npm ci             # install pinned dependencies
npm run generate   # build and validate, then publish the four generation files
npm run validate   # re-run the 17 rules on an existing DB
npm test           # Vitest
npm run check      # typecheck + tests + build
```

### Design Decisions
- **One package, no monorepo.** The generator, server and runner share the row types and time helpers. A single package keeps that sharing simple.
- **Timestamps are plant-local text** (`YYYY-MM-DDTHH:MM`, dataset design §3-4). `time.ts` turns them into minute offsets with UTC methods and never uses JavaScript `Date` local-time parsing. Results therefore do not depend on the PC's time zone.
- **Production day is computed once.** `productionDateOf(slotStart)` maps 00:00–07:59 to the previous day. The generator writes the result into each row as `production_date`, and later modules read that column.
- **Generation time is a real instant.** Only `dataset_meta.generated_at` uses UTC ISO text with milliseconds and `Z`; production timestamps and `reference_now` remain plant-local minute text.

---

## Data Generator

### Purpose
Write the generated tables and initialise the runtime tables from the config. The same generator and config use a fixed seed for reproducible production content; each generation is a separate dataset instance.

### Implementation Files
| File | Role |
|---|---|
| `src/generator/index.ts` | CLI entry (`npm run generate`) |
| `src/generator/build.ts` | Build rows and assign a fresh dataset identity |
| `src/generator/config.ts` | `GeneratorConfig` type + zod schema |
| `src/generator/rng.ts` | Seeded PRNG (no `Math.random`) |
| `src/generator/schema.sql` | DDL for the 11 tables |
| `src/generator/calendar.ts` | 92 calendar days, working days, weekly A/B crew rotation |
| `src/generator/plan.ts` | `hourly_plan` (9,504 rows), shift-change and E5 planned stops |
| `src/generator/normal.ts` | Normal variation: output, minor stops, defects |
| `src/generator/events.ts` | E1–E9 applied on top of the normal data |
| `src/generator/issues.ts` | 25 seed issues |
| `src/generator/writer.ts` | Single-transaction insert, `dataset_meta` |

### Core Classes / Structure
```ts
// Config uses a strict zod schema; events is an object keyed E1–E9.
export type GeneratorConfig = z.infer<typeof schema>;
export function buildDataset(config: GeneratorConfig): GeneratedDataset;
// GeneratedDataset = tables + planted record IDs, passed to the answer-key builder.
export function generate(config: GeneratorConfig, dbPath: string): {
  datasetVersion: string;
  dbPath: string;
  answerKeyPath: string;
  report: ValidationReport;
};
// dataset_version = a new unique identifier per generation, stored in dataset_meta
// The DB and its answer key share this identifier; DB copies preserve it.
```
```
calendar → workers → hourly_plan (shift change 20 min, E5 maintenance)
  → downtime_events (normal minor stops ~1/line/day + E1, E2, E4, E5, E7; E8 memo on an L5 record)
  → hourly_output (available minutes × std rate, variation, E6 slots left without a row)
  → defect_events (1 row per defect, count per slot = produced − good, never in shift change)
  → issues (25 seed, none about E4)
```

### Design Decisions
- **Separate dataset instances.** Each generation gets its own `dataset_version` and actual `generated_at`. Different generation times identify different datasets even when the production values match. DB copies keep the original metadata.
- **Fixed-seed production content.** A seeded PRNG in `rng.ts` replaces `Math.random`. Whether to add a repeat-generation check, and which content it compares, remains open. Such a check would not require generation identifiers or timestamps to match.
- **No event markers in the data** (principle ②). Events change the normal rows, but no column says "this is E4". Event information lives only in the answer key.
- **One transaction.** Schema creation and all inserts run in one better-sqlite3 transaction (69,835 rows, approximately 7.7 MiB with the default config). A failed insert rolls back both the schema and the rows.
- **Output never exceeds the standard rate.** Each slot's output is capped at (planned minutes − unplanned downtime minutes) × std rate ÷ 60. Speed loss then never goes negative, which matches the OEE reading in dataset design §9, where the standard rate is the theoretical maximum.
- **Preserve existing generations.** Generation uses temporary staging, validates the DB, then writes `production.db`, `answer_key.json`, `validation.json`, and `generator.config.json`. Existing files are refused; use `--out-dir` to create another generation. A failed publication removes only files created by that invocation. The config snapshot lets later validation use the settings that produced that DB.
- **Database constraints.** The 11 tables use SQLite STRICT types, foreign keys, and quantity checks. Non-null `issues.draft_id` is unique. The actual draft-confirmation transaction remains Phase 3 work.

---

## Answer Key

### Purpose
Compute the correct values for each event (dataset design §7), so that Phase 5 can grade answers against them.

### Implementation Files
| File | Role |
|---|---|
| `src/answer-key/build.ts` | `buildAnswerKey()` returns the key; the generator CLI writes JSON |
| `src/answer-key/types.ts` | `AnswerKey` type (also used by the Phase 5 grader) |

### Core Classes / Structure
```ts
export function buildAnswerKey(config: GeneratorConfig, data: GeneratedDataset): AnswerKey;
// Full schema: src/answer-key/types.ts.
// datasetVersion + generatedAt + E1–E9 + lookups.
// E4: byHour: HourStats[], byCrew: Record<Crew, HourStats[]>.
// E7: slotMinutes splits Friday 23:30–Saturday 02:30 as 30/60/60/30 minutes.
```

### Design Decisions
- **A separate calculation path** (principle ③). The builder independently aggregates generated observations, computes targets from config, and never imports core/server/validator or generator arithmetic. It shares only types and time helpers. Import restrictions and comparisons with independent SQL and hand-calculated cases are tested.
- **Rebuilt together with the data.** `npm run generate` writes both files with the same `dataset_version`.
- **Keep it outside the server's inputs.** The key is a separate file, not a DB table. Phase 4 must pass only the DB path to the server and ensure its tools/resources do not read or expose the key. Phase 1 does not create an OS-level file-access boundary.
- **Patterns are not proof of cause.** E4 includes both crews' hourly aggregates and the 09:00/21:00 comparison. Its interpretation describes the repeated pattern without claiming that the raw records prove the hidden material-supply cause.

---

## Validator

### Purpose
Check the 17 rules of dataset design §8 automatically after generation. `npm run generate` fails if any rule fails.

### Implementation Files
| File | Role |
|---|---|
| `src/validator/index.ts` | `validate()`, report output, used by `npm run generate` / `npm run validate` |
| `src/validator/rules.ts` | V01–V17 |
| `src/validator/types.ts` | `RuleCheck`, `RuleResult`, `ValidationReport` |

### Core Classes / Structure
```ts
export interface RuleResult {
  id: string;     // "V01"…"V17"
  name: string;
  passed: boolean;
  checked: number;
  failureCount: number;
  examples: string[];  // at most five counterexamples
}
export function validate(db: Database.Database, config: GeneratorConfig): ValidationReport;
```
```
V01 shift change: complete hourly slots and at most 40 minutes of capacity at 08:00/20:00
V02 target adjustment: 08시/20시 slots use 40 minutes
V03 target definition: target = planned minutes × std rate ÷ 60
V04 downtime vs output: subtract downtime from capacity; zero output during a full stop
V05 good ≤ produced
V06 defect rows per slot = produced − good
V07 defect placement: none in E6 slots or shift change
V08 loss breakdown: downtime + speed + defect loss = target − good
V09 planned stop: E5 records planned, target 0 that day
V10 reason code: category planned ⇔ is_planned = 1
V11 downtime placement: no overlap with shift change, never crosses 08:00
V12 non-working days: no plan/output/downtime/defect rows
V13 crew matches calendar day_crew / night_crew
V14 production day: after-midnight night rows belong to the previous day (incl. Fri → Sat)
V15 all 9 events present
V16 L6 has no events
V17 no E4-related seed issue
```

### Design Decisions
- **The validator reads the DB, not the generator's memory.** It checks persisted rows against the configured calendar, rates, normal ranges, and event locations. Standalone validation opens the DB read-only and checks that its answer key has the same dataset identity.
- **V08 uses integer arithmetic.** Losses are kept in "unit-minutes" (quantity × 60). Every term is then an integer even for L5 (90/h = 1.5 per minute), and the identity can be checked exactly.
- **Check independent counts.** V08 counts the defect table independently and requires nonnegative speed loss. The proposed capacity check is covered by V04/V08 without adding V18.
- **Hourly-data limit.** V01 checks the 40-minute plan and production capacity; an hourly total cannot prove the minute when each good unit was produced. V07/V11 separately verify that defect and downtime timestamps avoid changeovers.
- **Database integrity.** Foreign-key and SQLite integrity checks are included. CLI validation exits with code 1 for failed rules, a missing answer key, or a different-generation key.

### Usage Examples
```
npm run generate                             # first generation, into data/
npm run generate -- --out-dir data/run-02     # separate generation; choose an unused folder
npm run validate -- --db data/run-02/production.db --json
npm run build
node dist/validator/index.js --db data/production.db
```

---

## Phase 1 Skill Classification

| Skill | Classification | Reason |
|---|---|---|
| Project skeleton, `src/shared/time.ts` | general | Standard TypeScript setup; local-time helpers are reusable |
| Generator / answer key / validator | project-specific | Encodes this dataset's tables, events and rules |
| Vitest tests | general | Standard unit testing |

---

## Prerequisites & Dependencies
- Phase 0 design docs as the source of truth (dataset design §2–§8).
- Node.js 24.14.0 (`engines`, `.node-version`), npm 11.x; exact dependency versions in `package-lock.json`.
- npm: `better-sqlite3`, `zod`. Dev: `typescript`, `tsx`, `vitest`, `@types/node`, `@types/better-sqlite3`.

---

## Development Notes
- **Definition of done:**
  - Each generation has its own `dataset_version`, shared by its DB and answer key; DB copies retain it.
  - V01–V17 pass.
  - The answer key covers E1–E9.
- **Configured values:** event dates, line-specific defect rates, variation, four missing slots, and all 25 seed issues are now explicit in `config/generator.config.json`; see dataset design §10 for the event schedule.
- **Open decision:** whether to adopt a repeat-generation check for production content. It is not a required completion check while this decision is pending.
- **Worker IDs** exist only in `workers`, `defect_events.worker_id` and `downtime_events.entered_by`. No later module may return them.
- **Git:** the entire `data/` generation bundle is ignored. Track the source config and lockfile, then regenerate the DB and its matching key together. This prevents a tracked key from blocking generation on a clean checkout.
- **What the tests cover:** the unit tests here check the generator, not AI accuracy (that is Phase 5).

### Verification completed on 2026-10-21
- `npm run check`: typecheck, 37 tests across four files, and production build passed.
- `npm run validate`: V01–V17 and SQLite integrity checks passed on `data/production.db`.
- Built CLI: generated a fresh bundle, validated it successfully, and rejected a deliberately mismatched key with exit code 1. The temporary bundle was removed.
- Tests cover date/shift boundaries, all nine events, independent answer-key totals, corruption for each validation rule, failed-write rollback, unique draft IDs, preservation of existing files, and dataset/copy identities. They do not compare production content across generations.
- Default row counts: metadata 1, lines 6, workers 24, calendar 92, plans 9,504, outputs 9,500, defects 50,244, downtime 439, seed issues 25, drafts/audit 0; total 69,835.

---

## Change Log

| Date | Description |
|---|---|
| 2026-10-21 | Initial creation |
| 2026-10-21 | Record distinct dataset instances per generation; leave repeat-generation checking undecided and remove the identical-version requirement. |
| 2026-10-21 | Complete Phase 1 implementation, lock event settings, verify 37 tests and both CLIs, record actual counts and validation limits. |

---
---

# Phase 1 — 개발 기반 (데이터셋과 정답표) `✅ 완료`

> TypeScript 프로젝트를 세우고, 고정 시드 설정 하나로 가상 생산 DB, 정답표, 자동 검증을 만든다.

**상태**: ✅ 완료 (2026-10-21)
**선행 조건**: Phase 0(기획) 완료: `plan/01_production-mcp-server.md`, `plan/01a_production-mcp-dataset.md`

---

## 개요

Phase 1은 서버와 평가가 딛고 설 토대를 만든다. 만드는 것은 네 가지다.

- 프로젝트 골격
- 정답 사건 E1~E9를 심은 테이블 11개짜리 SQLite DB(`data/production.db`, 기본 설정 기준 69,835행)를 쓰는 데이터 생성기
- 심은 값에서 계산한 정답표(`data/answer_key.json`)
- 데이터셋 설계서 8장의 규칙 17개를 확인하는 검증기

MCP와 AI는 아직 없다. 개발 1단계(텍스트)에 해당한다.

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| 1 | 프로젝트 골격 (`package.json`, `tsconfig.json`, Vitest, npm 스크립트, `src/shared/`) | ✅ | 범용 |
| 2 | `config/generator.config.json` + `src/generator/config.ts` (설정 스키마) | ✅ | 전용 |
| 3 | `src/generator/` (데이터 생성기 → `data/production.db`) | ✅ | 전용 |
| 4 | `src/answer-key/` (정답표 → `data/answer_key.json`) | ✅ | 전용 |
| 5 | `src/validator/` (검증 규칙 17개) | ✅ | 전용 |
| 6 | `tests/shared/`, `tests/generator/`, `tests/answer-key/`, `tests/validator/` (테스트 37개) | ✅ | 범용 |

---

## 프로젝트 골격

### 목적
생성기, 서버, 평가 실행기, 결과 재생 페이지를 하나의 TypeScript 프로젝트로 두고, 타입과 시각 함수를 공유한다.

### 구현 파일
| 파일 | 역할 |
|---|---|
| `package.json` | **신규**: 의존성, `engines`, npm 스크립트 |
| `tsconfig.json` | **신규**: `strict: true`, ES 모듈 |
| `tsconfig.build.json`, `scripts/copy-assets.mjs` | `dist/`로 컴파일하고 SQL 스키마 복사 |
| `vitest.config.ts` | **신규**: 테스트 실행 설정 |
| `.node-version`, `package-lock.json` | Node.js와 의존성 버전 고정 |
| `src/shared/time.ts` | **신규**: 현지 시각 텍스트, 생산일, 시간대 함수 |
| `src/shared/codes.ts` | **신규**: 영어 코드 ↔ 한국어 표시 (`day` → 주간, `minor_stop` → 순간 정지) |
| `src/shared/types.ts` | **신규**: 테이블 11개의 행 타입 |
| `src/shared/files.ts` | 경로를 확인한 프로젝트 임시 폴더만 삭제 |

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 설계 결정 사항
- **모노레포 없이 패키지 하나로 둔다.** 생성기, 서버, 실행기가 행 타입과 시각 함수를 같이 쓰므로, 패키지 하나가 가장 단순하다.
- **시각은 공장 현지 시각 텍스트로 다룬다** (`YYYY-MM-DDTHH:MM`, 설계서 3-4). `time.ts`는 이 텍스트를 UTC 메서드로 분 단위 값으로 바꿔 계산하고, JavaScript `Date`의 현지 시각 해석은 쓰지 않는다. 그래서 PC의 시간대 설정에 따라 결과가 달라지지 않는다.
- **생산일은 한 번만 계산한다.** `productionDateOf(slotStart)`는 00:00~07:59를 전날로 묶는다. 생성기가 그 결과를 `production_date` 칼럼에 넣고, 이후 모듈은 그 칼럼을 읽는다.
- **실제 생성 시각을 기록한다.** `dataset_meta.generated_at`만 밀리초와 `Z`를 포함한 UTC ISO 형식을 쓴다. 생산 기록과 `reference_now`는 공장 현지 시각의 분 단위 텍스트를 유지한다.

---

## 데이터 생성기

### 목적
설정에서 생성 테이블을 만들고 실행 중 테이블을 초기화한다. 같은 생성기와 설정에서는 고정 시드로 생산 내용을 재현하되, 새로 생성한 데이터는 각각 별도 생성본으로 구분한다.

### 구현 파일
| 파일 | 역할 |
|---|---|
| `src/generator/index.ts` | CLI 진입점 (`npm run generate`) |
| `src/generator/build.ts` | 행 생성과 새 데이터 식별번호 발급 |
| `src/generator/config.ts` | `GeneratorConfig` 타입 + zod 스키마 |
| `src/generator/rng.ts` | 시드 고정 난수 (`Math.random` 사용 안 함) |
| `src/generator/schema.sql` | 테이블 11개 DDL |
| `src/generator/calendar.ts` | 92일 캘린더, 근무일, 매주 A/B조 교대 |
| `src/generator/plan.ts` | `hourly_plan` (9,504행), 교대 시간과 E5 계획 정지 |
| `src/generator/normal.ts` | 평상시 흔들림: 생산량, 순간 정지, 불량 |
| `src/generator/events.ts` | 평상시 데이터 위에 E1~E9 반영 |
| `src/generator/issues.ts` | 과거 이슈 25건 |
| `src/generator/writer.ts` | 트랜잭션 하나로 저장, `dataset_meta` |

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 설계 결정 사항
- **새 생성본은 별도로 구분한다.** 생성할 때마다 `dataset_version`을 발급하고 실제 `generated_at`을 기록한다. 생성 시각이 다르면 생산 수치가 같아도 다른 데이터다. DB 복사본은 원본의 정보를 유지한다.
- **생산 내용에는 고정 시드를 쓴다.** `Math.random` 대신 `rng.ts`의 시드 고정 난수를 쓴다. 반복 생성 검사의 채택 여부와 비교 대상은 추가 논의한다. 검사를 채택해도 생성본 식별값과 생성 시각이 같아야 한다는 조건은 두지 않는다.
- **원데이터에 사건 표시를 두지 않는다** (원칙 ②). 사건은 평상시 행을 바꾸지만 "이 행은 E4"라는 칼럼은 없다. 사건 정보는 정답표에만 있다.
- **트랜잭션 하나로 저장한다.** 스키마 생성과 전체 삽입을 better-sqlite3 트랜잭션 하나로 처리한다 (기본 설정 69,835행, 약 7.7 MiB). 삽입 실패 시 테이블 생성과 행 저장을 모두 되돌린다.
- **생산량은 표준 생산량을 넘지 않는다.** 시간대마다 생산량을 (계획 가동 분 − 비계획 정지 분) × 표준 생산량 ÷ 60 이하로 제한한다. 그러면 속도 저하 손실이 음수가 되지 않고, 표준 생산량을 이론 최대 속도로 보는 설계서 9장의 OEE 해석과도 맞는다.
- **기존 생성본을 보존한다.** 임시 폴더에서 DB를 만들고 검증한 후 `production.db`, `answer_key.json`, `validation.json`, `generator.config.json`을 저장한다. 기존 파일이 있으면 거부하며, 새 생성본은 `--out-dir`로 다른 폴더를 지정한다. 저장 실패 시 해당 실행에서 만든 파일만 제거한다. 설정 스냅샷은 나중에도 당시 설정으로 DB를 검증하기 위해 남긴다.
- **DB 제약을 둔다.** 테이블 11개에 SQLite STRICT 타입, 외래키, 수량 검사를 적용했다. NULL이 아닌 `issues.draft_id`는 고유하다. 실제 이슈 확정 트랜잭션은 Phase 3에서 구현한다.

---

## 정답표

### 목적
사건별 정답 수치(설계서 7장)를 계산해 Phase 5 채점의 기준으로 쓴다.

### 구현 파일
| 파일 | 역할 |
|---|---|
| `src/answer-key/build.ts` | `buildAnswerKey()`로 정답표 반환. JSON 파일 저장은 생성기 CLI가 담당 |
| `src/answer-key/types.ts` | `AnswerKey` 타입 (Phase 5 채점기도 사용) |

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일.

### 설계 결정 사항
- **계산 경로를 따로 둔다** (원칙 ③). 생성된 관측값을 독립적으로 합산하고 설정에서 목표를 계산한다. core/server/validator나 생성기의 계산 로직을 import하지 않으며 타입과 시각 함수만 공유한다. import 제한과 별도 SQL·손계산 결과 비교를 테스트했다.
- **데이터와 함께 다시 만든다.** `npm run generate`가 두 파일을 같은 `dataset_version`으로 함께 만든다.
- **서버 입력과 분리한다.** 정답표는 DB 테이블이 아닌 별도 파일이다. Phase 4에서 서버에 DB 경로만 전달하고 도구·리소스가 정답표를 읽거나 노출하지 않도록 검증해야 한다. Phase 1에서 운영체제 수준의 파일 접근 차단을 구현한 것은 아니다.
- **패턴과 원인 확정을 구분한다.** E4에는 두 교대조의 시간대별 집계와 09시·21시 비교를 담는다. 해석 문구는 반복 패턴을 설명하되, 원데이터만으로 숨겨진 자재 공급 원인까지 입증했다고 표현하지 않는다.

---

## 검증기

### 목적
생성 직후 설계서 8장의 규칙 17개를 자동으로 확인한다. 하나라도 실패하면 `npm run generate`가 실패한다.

### 구현 파일
| 파일 | 역할 |
|---|---|
| `src/validator/index.ts` | `validate()`, 결과 출력, `npm run generate` / `npm run validate`에서 사용 |
| `src/validator/rules.ts` | V01~V17 |
| `src/validator/types.ts` | `RuleCheck`, `RuleResult`, `ValidationReport` |

### 핵심 클래스 / 구조
위 영어 섹션 코드와 동일 (V01 교대 시간 ~ V17 이슈 이력).

### 설계 결정 사항
- **생성기 메모리가 아니라 DB를 읽는다.** 실제 저장된 행을 설정의 캘린더, 생산 속도, 정상 범위, 사건 위치와 대조한다. 별도 검증 명령은 DB를 읽기 전용으로 열고 정답표가 같은 생성본인지 확인한다.
- **V08은 정수로 계산한다.** 손실을 "수량 × 60" 단위로 계산한다. 그러면 L5(시간당 90개 = 분당 1.5개)에서도 모든 항이 정수라 등식을 정확히 확인할 수 있다.
- **독립된 수를 대조한다.** V08은 불량 테이블의 행 수를 따로 세고 속도 저하 손실이 음수가 아닌지도 확인한다. 제안했던 생산량 상한 검사는 V04/V08에 포함했으며 V18은 추가하지 않았다.
- **시간 단위 데이터의 한계.** V01은 계획 가동 40분과 생산 가능 수량을 검사한다. 시간대 합계만으로 양품 하나하나의 실제 생산 분까지 증명할 수는 없다. 불량·비가동 시각이 교대 시간과 겹치지 않는지는 V07/V11로 별도 검증한다.
- **DB 무결성.** 외래키와 SQLite 무결성 검사도 포함한다. 규칙 실패, 정답표 누락, 다른 생성본의 정답표 연결 시 CLI는 종료 코드 1을 반환한다.

### 사용 예시
위 영어 섹션 코드와 동일.

---

## Phase 1 스킬 범용/전용 분류

| 스킬 | 분류 | 이유 |
|---|---|---|
| 프로젝트 골격, `src/shared/time.ts` | 범용 | 표준 TypeScript 설정, 현지 시각 함수는 재사용 가능 |
| 생성기 / 정답표 / 검증기 | 전용 | 이 데이터셋의 테이블, 사건, 규칙을 담음 |
| Vitest 테스트 | 범용 | 표준 단위 테스트 |

---

## 선행 조건 및 의존성
- Phase 0 기획 문서 (데이터셋 설계서 2~8장이 기준).
- Node.js 24.14.0 (`engines`, `.node-version`), npm 11.x. 의존성의 정확한 버전은 `package-lock.json`으로 고정.
- npm: `better-sqlite3`, `zod`. 개발용: `typescript`, `tsx`, `vitest`, `@types/node`, `@types/better-sqlite3`.

---

## 개발 시 주의사항
- **완료 기준:**
  - 생성본마다 고유한 `dataset_version`을 발급하고 해당 DB와 정답표가 공유한다. DB 복사본은 원본 값을 유지한다.
  - V01~V17이 통과한다.
  - 정답표가 E1~E9를 모두 담고 있다.
- **확정한 설정:** 사건 날짜, 라인별 기본 불량률, 변동 폭, 미입력 4시간대, 과거 이슈 25건은 `config/generator.config.json`에 명시했다. 사건 일정은 설계서 10장에도 기록했다.
- **미정 사항:** 생산 내용의 반복 생성 검사를 채택할지 결정한다. 논의 중에는 필수 완료 검사로 두지 않는다.
- **작업자 ID**는 `workers`, `defect_events.worker_id`, `downtime_events.entered_by`에만 있다. 이후 어떤 모듈도 이를 응답에 넣지 않는다.
- **Git:** `data/` 생성본 전체를 제외한다. 원본 설정과 잠금 파일을 관리하고 DB와 정답표를 함께 다시 만든다. 정답표만 저장소에 남아 새 환경의 데이터 생성을 막는 상황도 방지한다.
- **테스트 범위:** 여기 단위 테스트는 생성기를 검증하지, AI 정확도를 검증하지 않는다 (그건 Phase 5).

### 2026-10-21 검증 결과
- `npm run check`: 타입 검사, 파일 4개의 테스트 37개, 배포용 빌드 통과.
- `npm run validate`: `data/production.db`의 V01~V17과 SQLite 무결성 검사 통과.
- 빌드된 CLI로 별도 생성본을 만들고 검증했다. 정답표의 생성본 번호를 일부러 바꾸면 종료 코드 1로 거부됨을 확인했다. 확인용 임시 생성본은 제거했다.
- 날짜·교대 경계, 사건 9개, 정답표의 독립 집계, 검증 규칙별 오류 데이터, 저장 실패 롤백, 초안별 고유 제약, 기존 파일 보존, 새 생성본과 복사본의 식별값을 테스트했다. 생성본 간 생산 내용의 동일성은 비교하지 않았다.
- 기본 행수: 메타 1, 라인 6, 작업자 24, 캘린더 92, 계획 9,504, 실적 9,500, 불량 50,244, 비가동 439, 과거 이슈 25, 초안·감사 기록 0. 합계 69,835행.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-21 | 최초 작성 |
| 2026-10-21 | 생성 시각이 다른 데이터는 별도 생성본으로 구분. 반복 생성 검사는 미정으로 두고 버전 동일성 요구를 제거. |
| 2026-10-21 | Phase 1 구현 완료. 사건 설정 확정, 테스트 37개와 두 CLI 검증, 실제 행수와 검증 한계 기록. |
