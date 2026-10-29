🌐 [한국어](./README_ko.md) | [English](./README.md)

# shopfloor-mcp

> Claude가 생산 현황 질문에 서버가 계산한 수치와 추적 가능한 근거로 답하고, 사람이 확인한 뒤에만 이슈를 등록하는 MCP 서버

<p align="center">
  <a href="https://soyeonahn3.github.io/shopfloor-mcp/">
    <img src="https://img.shields.io/badge/Evaluation_Replay-View_on_GitHub_Pages-2ea44f?style=for-the-badge&logo=githubpages&logoColor=white" alt="평가 결과 재생 페이지">
  </a>
</p>

<p align="center">
  🔎 <b>평가 질문 30개에 Claude가 어떻게 답했는지 확인하세요</b><br>
  질문 → 도구 호출 → 서버 응답 → 최종 답변 → 정답값 · 묶음/세부 도구 구성 비교
</p>

https://github.com/user-attachments/assets/1206e12b-e5bd-408a-937a-4151fa7e9af9

## 개요

현장에서 생산 실적을 확인하려면 시트나 대시보드를 열고, 필터를 걸고, 기간을 직접 비교해야 합니다. 정기 리포트는 미리 정해둔 질문에만 답하기 때문에 "어제 2라인은 왜 목표에 못 미쳤지?" 같은 그때그때의 질문은 결국 사람이 데이터를 뒤져야 하고, 이슈 등록도 다른 화면에서 다시 해야 합니다.

이 프로젝트는 Claude 데스크톱에 연결하는 MCP 서버를 만듭니다. Claude가 자연어 질문을 보고 서버의 도구를 고르면, 계산은 모두 서버가 하고 수치는 근거 번호와 함께 돌려줍니다. Claude는 해석만 합니다. 데이터를 바꾸는 유일한 행동인 이슈 등록은 초안까지만 만들어지고, 확정은 사람이 버튼으로 합니다.

포트폴리오 목적으로 제작했습니다. AI를 앱 안에 넣는 대신 AI가 쓸 도구를 설계하는 데 집중합니다. 정답 사건과 함정을 심은 가상 데이터셋(6라인, 3개월, 테이블 11개, 69,835행)과, 서버 계산과 독립적으로 만든 정답표로 Claude의 답을 채점합니다.

## 목차

- [동작 흐름](#동작-흐름)
- [기술 스택](#기술-스택)
- [AI 구성 요소](#ai-구성-요소)
- [빠른 시작](#빠른-시작)
- [테스트](#테스트)
- [프로젝트 구조](#프로젝트-구조)
- [현재 상태](#현재-상태)
- [문서](#문서)
- [한계점](#한계점)
- [향후 계획](#향후-계획)

## 동작 흐름

```
사용자가 Claude 데스크톱에서 질문 ("4라인 왜 목표에 못 미쳐?")
  → Claude가 MCP로 서버 도구를 선택
    → 서버가 생산일 기준으로 기간 해석 (기준 시각 2026-10-01 08:00 KST 고정)
      → 서버가 SQLite 실행용 복사본에서 계산: 달성률, 손실 분해, 시간대별 패턴
        → 응답: 요약 + 근거 번호 + 데이터 기준 시각
          → Claude가 근거 번호를 붙여 해석하고 답변
            → 이슈 요청 시: Claude는 초안만 생성 → 확정 폼 → 사람이 확정 → 감사 기록
```

마지막 단계는 MCP Inspector에서 동작을 확인했습니다. 폼의 버튼이 사람 전용 `confirm_issue`를 부르면 이슈 1건이 등록되고 사람의 감사 기록이 남습니다. 다음은 Claude 데스크톱 확인입니다(Phase 7).

## 기술 스택

| Technology | Role | Why |
|---|---|---|
| Node.js 24.14.0 + TypeScript | 데이터 생성기·검증기·core·MCP 서버·평가 실행기·재생 페이지 | 데이터 도구, 서버, 브라우저 코드를 한 언어로 개발. `package.json`과 `.node-version`으로 버전 고정 |
| SQLite (`better-sqlite3`) | 생산 데이터, 이슈, 감사 기록 | DB 서버 없는 단일 파일. 서버는 실행용 복사본에만 쓰고 생성 원본은 건드리지 않음 |
| zod | 도구 입력·설정·시나리오 JSON 검증 | strict 스키마가 모르는 필드를 거절하므로 도구 입력으로 역할을 바꾸거나 검사를 우회할 수 없음 |
| MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `client`) | stdio로 도구·리소스·프롬프트 제공, 데모·평가용 클라이언트 | 대화와 도구 호출 반복은 Claude 데스크톱이 처리. 평가 실행기도 실제 클라이언트와 같은 방식으로 빌드된 서버에 연결 |
| MCP Apps (`@modelcontextprotocol/ext-apps`) | 대화 안의 이슈 확정 폼 | 서버가 화면을 제공하므로 별도 프론트엔드가 필요 없음. MCP Apps를 선언한 클라이언트에만 제공 |
| Claude 데스크톱 | 클라이언트 (대화, 도구 선택, 답변) | 채팅 화면을 직접 만들 필요가 없고, 일상 사용에 API 비용이 들지 않음 |
| Anthropic SDK (`@anthropic-ai/sdk`) | 평가 실행기 전용 | 동결한 질문을 고정한 모델로 실행하고 토큰 수 확인과 비용 한도를 적용. 서버 자체는 AI 서비스를 호출하지 않음 |
| Vitest | 테스트 실행기 | TypeScript ESM 테스트를 바로 실행하고, 실제 SQLite와 stdio 연결로 검증 |
| 정적 페이지 + GitHub Pages | 평가 결과 재생 페이지 | AI 호출과 로그인이 없어 비용 없이 링크로 공유 |

## AI 구성 요소

### 역할 분담

| Claude가 하는 일 | 서버가 하는 일 (규칙 기반) |
|---|---|
| 질문 이해 | "어제", "이번 주"를 생산일 기준 실제 기간으로 해석 |
| 호출할 도구 선택 | 교대 시간과 계획 정지 처리 (목표와 손실에서 제외) |
| 결과 해석과 답변 작성 | 모든 수치: 합계, 달성률, 손실 분해(비가동 / 속도 저하 / 불량), 시간대별 패턴 |
| 이슈 초안 작성 | 기간 밖, 휴무일, 계획 정지, 데이터 미입력, 생산 0, 조회 실패 구분 |
| | 권한, 중복 방지, 근거 번호, 감사 기록 |

### AI 결과의 성격

Claude는 해석만 하고 계산하지 않습니다. 답변에 나오는 모든 수치는 서버 응답에서 온 것이고, 근거 번호로 감사 기록에서 추적할 수 있습니다. 이슈 초안은 제안일 뿐이며, 사람이 확정해야만 등록됩니다.

### 모델 선택 방식

- **일상 사용:** 서버는 모델을 고르거나 호출하지 않습니다. 사용자가 Claude 데스크톱(또는 다른 MCP 클라이언트)에서 선택한 모델을 씁니다.
- **평가:** 실행기 기본값은 `claude-sonnet-5-5`이며 `ANTHROPIC_MODEL` 또는 `--model`로 바꿀 수 있습니다. 실행마다 모델, 설정 해시, 예상 비용을 기록합니다.

### 프롬프트가 아니라 구조로 지키는 안전

- **이슈 등록:** Claude는 초안까지만 만들 수 있습니다. 확정 도구는 Claude의 도구 목록에 없고, 서버는 일회용 초안 번호(10분 유효, 1회 사용)가 있을 때만 확정을 받아들입니다.
- **자유 메모:** 메모 칸은 참고 데이터로 감싸서 전달해, 안에 숨긴 지시를 따르지 않게 합니다. Claude가 속더라도 결과는 초안에서 멈춥니다.
- **작업자 정보:** 작업자 ID는 어떤 응답에도 넣지 않아 개인별 순위를 만들 수 없습니다. 집계는 라인과 교대조 단위까지만 합니다.
- **역할:** viewer/operator는 서버 실행 설정으로만 정하며, 도구 입력으로 바꿀 수 없습니다.

### 실패 처리

오류가 나면 무엇이 잘못됐고 무엇이 가능한지 함께 알려서, Claude가 스스로 다시 시도할 수 있게 합니다. 예: "10월 생산일은 아직 시작 전입니다. 조회 가능 범위는 7/1~9/30입니다. 9월 기준으로 볼까요?"

### AI 동작 검증 방식

- 8개 유형(단순 조회, 여러 단계 분석, 반복 패턴, 모호한 질문, 데이터 없음과 함정, 권한 밖 요청, 변경 요청, 공격 시도)의 동결한 평가용 시나리오 30개와, 도구 설명을 다듬는 데만 쓰는 개발용 시나리오 10개
- 서버 계산 코드와 독립적으로 심어둔 사건에서 계산한 정답표로 채점하고, 모든 기록을 사람이 검수
- `claude-sonnet-5-5`로 두 도구 구성을 비교, N=1, 60건 모두 사람 검수 완료. 두 구성은 계산과 결과가 같고 Claude에게 보이는 도구 모양만 다릅니다. **묶음(coarse, 기본)** 은 비슷한 기능을 도구 4개에 모아 `mode`로 고르고, **세부(fine)** 는 기능마다 도구를 하나씩 둔 10개입니다. 그래서 점수 차이는 계산이 아니라 도구 설계의 차이입니다. 도구 대응표는 [Phase 4](Phase/Phase4_McpServer.md#tool-sets-coarse-vs-fine)에 있습니다.

| 도구 구성 | 최종 정답률 | 평균 도구 호출 | 평균 시간 (초) |
|---|---:|---:|---:|
| 묶음 coarse (기본) | 28/30 (93.3%) | 1.60 | 9.88 |
| 세부 fine | 26/30 (86.7%) | 1.97 | 10.32 |

모든 단계는 [soyeonahn3.github.io/shopfloor-mcp](https://soyeonahn3.github.io/shopfloor-mcp/)에서 다시 볼 수 있습니다. 실행 조건, 유형별 결과, 한계는 [docs/EVALUATION.md](docs/EVALUATION.md)에 있습니다.

## 빠른 시작

### 사전 요구사항

- Node.js 24.14.0, npm 11.x
- 자연어로 질문하려면 Claude 데스크톱 (선택)
- Anthropic API 키는 유료 평가 실행기에만 필요합니다. 그 외에는 키나 별도 DB가 필요 없습니다

### 설치, 데이터 생성, 검증

저장소 루트에서 실행합니다.

```sh
npm ci
npm run generate
npm run validate
npm run check
```

`generate`는 `data/`(Git 제외)에 `production.db`, `answer_key.json`, `validation.json`, 설정 스냅샷을 만듭니다. 기존 생성 파일은 덮어쓰지 않으므로, 다른 생성본은 `npm run generate -- --out-dir <새 폴더>`로 만듭니다. `check`는 타입 검사, 전체 테스트, 빌드를 실행합니다.

C++ 빌드 도구가 없는 Windows에서는 `npm ci`가 `gyp ERR! find VS`로 실패합니다. 이때는 `npm ci --ignore-scripts`를 사용합니다. 단계별 설치와 정상 결과는 [docs/INSTALL.md](docs/INSTALL.md)에 있습니다.

### Claude에 연결

```sh
npm run db:copy -- --from data/production.db --to data/run/phase4-production.db
npm run --silent mcp:config -- --db data/run/phase4-production.db --role viewer --user demo
```

출력된 `mcpServers.shopfloor` 항목을 Claude 데스크톱 설정에 합친 뒤 다시 시작합니다. 이슈 초안을 시험하려면 `--role operator`를 사용합니다. Claude 데스크톱·Code 연결 방법은 [docs/MCP_SETUP.md](docs/MCP_SETUP.md)에 있습니다.

모델 없이 서버를 확인하려면:

```sh
npm run mcp:demo -- --db data/production.db
```

### 환경변수

`npm run eval`에만 필요합니다. `.env.example`을 `.env`로 복사합니다.

| 변수 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | 평가 실행기용 API 키 |
| `ANTHROPIC_MODEL` | 평가 모델 (기본 `claude-sonnet-5-5`) |
| `EVAL_MAX_COST_USD` | 평가 명령 1회당 예상 비용 한도 (기본 5) |

### 기타 명령

| 명령 | 용도 | 자세히 |
|---|---|---|
| `npm run core:demo` | MCP·AI 없이 임시 DB 복사본에서 core 계산 실행 | [Phase 3](Phase/Phase3_CoreLogic.md) |
| `npm run scenarios:check` | 동결 시나리오와 연결된 생성본 검사 | [Phase 2](Phase/Phase2_EvaluationScenarios.md) |
| `npm run eval -- --set dev --toolset coarse --ids D01` | 실제 AI 평가 (**유료**) | [Phase 5](Phase/Phase5_Evaluation.md) |
| `npm run eval:review` / `eval:sheet` / `eval:summary` | 사람 검수 기록, 검수 화면, 결과 요약 | [Phase 5](Phase/Phase5_Evaluation.md) |
| `npm run site:data` / `site:build` / `site:serve` | 결과 재생 페이지 생성과 미리보기 (`http://127.0.0.1:4173/`) | [Phase 6](Phase/Phase6_ResultReplayPage.md) |

확정 폼은 Claude 데스크톱 없이 MCP Inspector에서 확인할 수 있습니다. 방법은 [Phase 7](Phase/Phase7_ConfirmationAndDemo.md)에 있습니다.

## 테스트

```sh
npm run check                 # typecheck + 234 tests in 22 files + build
npm test                      # tests only
npx vitest run tests/server   # one area: answer-key, core, eval, generator, server, shared, site, validator
```

테스트는 `.env`를 읽거나 유료 API를 호출하지 않습니다. 실제 SQLite 테스트 데이터와 빌드된 stdio 서버를 사용하며, 기간 해석, 집계와 상태 구분, 초안 보호, 묶음·세부 도구 동일 결과, 권한·정보 보호, 평가 채점과 검수 무결성, 재생 페이지 데이터 생성을 검증합니다. 커버리지 보고서는 설정하지 않았습니다.

알려진 환경 문제: 프로젝트 경로에 한글 등 비ASCII 문자가 있으면 Node.js `fs.cpSync` 크래시로 `tests/eval/scenarios.test.ts`가 실행되지 않습니다.

## 프로젝트 구조

```
shopfloor-mcp/
├── src/
│   ├── shared/            # 행 타입, 시각 함수, 코드 표시명
│   ├── generator/         # SQLite 스키마와 데이터 생성
│   ├── answer-key/        # 독립적인 사건·주간 집계 (채점 전용)
│   ├── validator/         # 검증 규칙 V01~V17과 CLI
│   ├── core/              # 기간, 집계, 분석, 감사 기록, 이슈 초안 보호
│   ├── server/            # MCP 도구(coarse/fine), 리소스, 프롬프트, stdio, MCP Apps 폼(ui/)
│   └── eval/              # 평가 실행기, 채점, 동결 검사, 사람 검수
├── tests/                 # 파일 22개, 테스트 234개
├── eval/
│   ├── scenarios/         # 평가용 30개·개발용 10개 시나리오, 잠금, 질문 목록
│   ├── runs/              # 평가 실행 기록
│   ├── reviews/           # 사람 검수 기록과 검수 화면
│   └── summary.md         # 결과 요약
├── site/                  # 결과 재생 페이지 소스와 커밋한 데이터
├── resources/             # 용어집, 데이터 안내, 이상 판단 기준 (MCP 리소스로 제공)
├── config/                # 데이터 생성 설정 (시드, 정상 범위, 정답 사건 E1~E9)
├── scripts/               # 데모, 실행용 DB 복사, 클라이언트 설정, 동결, 페이지 데이터
├── docs/INSTALL.md        # 단계별 설치 안내 (새 클론에서 확인)
├── docs/EVALUATION.md     # 평가 결과
├── docs/MCP_SETUP.md      # 클라이언트 연결 안내
├── plan/                  # 기획서, 데이터셋 설계서, 작업 계획
├── Phase/                 # Phase별 설계와 구현 기록
├── .github/workflows/     # 재생 페이지 검사와 GitHub Pages 배포
├── .claude/               # Claude Code 스킬과 보호 hook
├── data/                  # 생성 파일 묶음 (Git 제외)
├── .env.example           # 평가 설정 템플릿
├── CLAUDE.md              # Claude Code용 프로젝트 규칙
├── package.json
└── README.md / README_ko.md
```

## 현재 상태

| Phase | Status | Deliverable |
|---|---|---|
| Phase 0 — 기획 | ✅ 완료 | 기획서 + 데이터셋 설계서 (테이블 11개, 정답 사건 9개, 정답표 명세) |
| Phase 1 — 개발 기반 | ✅ 완료 | 데이터 생성기 (69,835행), 정답표, 검증 규칙 17개 |
| Phase 2 — 평가 시나리오 | ✅ 완료 | 생성본에 연결해 잠근 평가용 30개·개발용 10개 시나리오 |
| Phase 3 — 서버 내부 로직 | ✅ 완료 | 기간 해석, 데이터 상태 6가지, 집계·분석, 감사 기록 API, 초안·확정 보호 |
| Phase 4 — MCP 서버 | ✅ 완료 | 기본 도구 4개·세부 10개, 리소스 4개, 프롬프트 2개 (stdio) |
| Phase 5 — 평가 | ✅ 완료 | 실제 평가 실행기와 사람 검수를 마친 Sonnet 결과 (93.3% / 86.7%) |
| Phase 6 — 결과 재생 페이지 | ✅ 완료 | GitHub Pages에 게시한 한·영 정적 재생 페이지 |
| Phase 7 — 확정 화면과 데모 | 🔧 진행 중 | MCP Apps 이슈 확정 폼과 화면 전용 `confirm_issue` (MCP Inspector 확인), 다음은 Claude 데스크톱 확인 |

Phase 1~6은 개발 1단계(텍스트), Phase 7은 2단계입니다. Phase 4 도구와 Phase 7 폼의 Claude 데스크톱 화면 확인은 수동 확인으로 남아 있습니다.

## 문서

| 문서 | 내용 |
|---|---|
| [plan/01_production-mcp-server.md](plan/01_production-mcp-server.md) | 기획서: 문제, 도구, 이슈 확정 원칙, 평가, 범위, 결정 사항 (한국어) |
| [plan/01a_production-mcp-dataset.md](plan/01a_production-mcp-dataset.md) | 데이터셋 설계서: 테이블, 정답 사건 E1~E9, 정답표, 검증 규칙 (한국어) |
| [plan/02_phase5-grader-server-version.md](plan/02_phase5-grader-server-version.md) | Phase 5 후속 계획: 값 검사 항목명 확인(7번)과 서버 빌드 식별 (한국어) |
| [Phase/](Phase/) | Phase별 설계 결정, 구현 내용, 완료 검사 (영어·한국어) |
| [docs/INSTALL.md](docs/INSTALL.md) | 저장소 받기 → 설치 → 데이터 생성 → 검사 → 실행용 복사본 → Claude 데스크톱, 단계별 정상 결과 포함 |
| [docs/EVALUATION.md](docs/EVALUATION.md) | 평가 조건, 유형별 결과, 실패 내용, 도구 설명 조정 기록, 한계 |
| [docs/MCP_SETUP.md](docs/MCP_SETUP.md) | 빌드, 실행용 DB 복사, Claude 데스크톱·Code 연결, 도구 목록 |
| [eval/scenarios/README.md](eval/scenarios/README.md) | 시나리오 40개의 질문과 기대 행동 (한국어) |
| [eval/summary.md](eval/summary.md) | 평가 실행, 비용, 최종 정답률 |
| [resources/](resources/) | Claude에게 제공하는 용어집, 데이터 안내, 이상 판단 기준 |
| [결과 재생 페이지](https://soyeonahn3.github.io/shopfloor-mcp/) | 전체 평가 시나리오의 단계별 재생 |

## 한계점

- 평가는 N=1이라 실행 간 변동성을 측정하지 못합니다. 자동 검사는 잠정 판정이며 최종 정답률은 사람 검수로 정합니다.
- Phase 5는 v1으로 마감했습니다(2026-10-29). 공개 정답률은 v1 결과이며 이후 변경의 효과를 측정하지 않습니다. 후속 1~4번(지표 설명, 제공 가능 여부 정책, 비가동 한국어 이름, 사람의 최종 심각도 선택)은 개발용 시나리오로만 확인했고, 7번(값 채점)과 9번(프롬프트 캐싱)은 구현했습니다. 후속 항목을 평가용 세트의 실패에서 골랐기 때문에 v2 재평가는 하지 않기로 했고, 5·6번(모호한 기준 되묻기, 데이터가 없을 때 정해진 조치 안내)은 구현하지 않았습니다. 현재 설명·정책은 동결되지 않았으므로 새 평가를 하려면 개발용 실행과 재동결이 먼저 필요합니다.
- 확정 폼은 MCP Inspector에서만 확인했고 Claude 데스크톱 확인은 남아 있습니다. 서버는 누가 버튼을 눌렀는지 직접 볼 수 없습니다. 보장은 호스트의 화면 전용 공개 범위, MCP Apps 미지원 클라이언트에 등록하지 않기, 일회용 초안 번호가 함께 만듭니다.
- 가상 데이터만 사용하며 실제 사내 시스템과 연동하지 않습니다. 실제 MES 데이터보다 단순합니다: 라인당 제품 1개, 생산 오더 없음, 설비 단위 기록 없음, 공휴일 없음.
- 생산 수량은 시간대별 합계입니다. 검증기는 생산 가능 수량을 확인하지만 양품 하나하나의 생산 분까지 증명하지는 못합니다.
- 로컬 전용입니다. 서버는 사용자 PC에서 실행되며 원격 배포와 로그인은 없습니다.
- 기준 시각이 2026-10-01 08:00 하나로 고정되어 있어 데이터가 시간에 따라 바뀌지 않습니다.

## 향후 계획

**Phase 7 (다음 작업)**
- Claude 데스크톱에서 폼 확인, Claude 도구 목록에 `confirm_issue`가 없는지 확인

**평가 (개발 완료 후, 조건부)**
- 추가 평가 전에 처음 보는 평가용 질문 세트를 새로 만들기. 개선 항목을 고른 질문으로 그 효과를 재지 않기 위함 (`Phase/Phase5_Evaluation.md`의 마감 결정 참고)
- 그 세트에서 모델 판단력 문제로 보이는 실패가 남을 때만 coarse 도구로 `claude-opus-5-5` 비교

---
<p align="center">Made with AI-assisted development</p>
