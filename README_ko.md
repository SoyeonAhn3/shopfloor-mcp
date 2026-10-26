🌐 [한국어](./README_ko.md) | [English](./README.md)

# shopfloor-mcp

> Claude가 생산 현황 질문에 서버가 계산한 수치와 추적 가능한 근거로 답하고, 사람이 확인한 뒤에만 이슈를 등록하는 MCP 서버

**현재 상태: Phase 1~4 구현, Phase 5 Sonnet 평가 사람 검수 완료(최종 정답률: 도구 4개 93.3%, 도구 10개 86.7%, N=1), Phase 6 결과 재생 페이지 게시([soyeonahn3.github.io/shopfloor-mcp](https://soyeonahn3.github.io/shopfloor-mcp/)), Phase 7 진행 중(이슈 확정 폼을 MCP Inspector에서 확인, 다음은 사람 전용 확정 도구).** 로컬 MCP 서버는 **공통 기능을 묶은 도구 4개**를 기본으로 제공하며 참고자료 4개·질문 템플릿 2개와 비교용 도구 10개를 지원합니다. MCP Apps를 선언한 클라이언트에는 확정 폼 리소스도 제공합니다. 검증된 기간 해석·계산·감사 기록·초안을 실행용 SQLite 복사본에서 처리합니다. 기본 데이터는 테이블 11개, 총 69,835행입니다. 실제 Claude 평가 기록과 읽기 쉬운 보고서는 `eval/`에 저장하며, Desktop 화면 확인은 별도 수동 검증으로 남아 있습니다.

## 개요

현장에서 생산 실적을 확인하려면 시트나 대시보드를 열고, 필터를 걸고, 기간을 직접 비교해야 합니다. 정기 리포트는 미리 정해둔 질문에만 답하기 때문에 "어제 2라인은 왜 목표에 못 미쳤지?" 같은 그때그때의 질문은 결국 사람이 데이터를 뒤져야 하고, 이슈 등록도 다시 다른 화면에서 해야 합니다.

이 프로젝트는 Claude 데스크톱에 연결하는 MCP 서버를 만듭니다. Claude가 자연어 질문을 보고 서버의 도구를 고르면, 계산은 모두 서버가 하고 수치는 근거 번호와 함께 돌려줍니다. Claude는 해석만 합니다. 데이터를 바꾸는 유일한 행동인 이슈 등록은 초안까지만 만들어지고, 확정은 사람이 버튼으로 합니다.

포트폴리오 목적으로 제작. 이전 프로젝트가 AI를 품은 앱이었다면, 이번에는 AI가 쓸 도구를 설계하는 데 집중합니다. 정답 사건과 함정을 의도적으로 심은 가상 데이터셋(6라인, 3개월)과, Claude의 답을 채점하는 정답표를 함께 사용합니다.

## 목차

- [동작 흐름](#동작-흐름)
- [기술 스택](#기술-스택)
- [AI 구성 요소](#ai-구성-요소)
- [빠른 시작](#빠른-시작)
- [프로젝트 구조](#프로젝트-구조)
- [현재 상태](#현재-상태)
- [문서](#문서)
- [한계점](#한계점)
- [향후 계획](#향후-계획)

## 동작 흐름

구현한 흐름입니다. MCP Apps 클라이언트는 초안을 확정 폼으로 보여주며, 폼의 버튼이 부를 확정 도구는 Phase 7의 다음 단계입니다.

```
사용자가 Claude 데스크톱에서 질문 ("4라인 왜 목표에 못 미쳐?")
  → Claude가 MCP로 서버 도구를 선택
    → 서버가 생산일 기준으로 기간 해석 (기준 시각 2026-10-01 08:00 고정)
      → 서버가 SQLite에서 계산 (읽기 전용): 달성률, 손실 분해, 시간대별 패턴
        → 응답: 요약 + 근거 번호 + 데이터 기준 시각
          → Claude가 근거 번호를 붙여 해석하고 답변
            → 이슈 요청 시: Claude는 초안만 생성 → 폼에 초안 표시 → 사람이 버튼으로 확정 → 감사 기록
```

## 기술 스택

서버는 Node.js 24.14.0, TypeScript, SQLite (`better-sqlite3`), zod, Vitest와 버전을 고정한 MCP TypeScript SDK v2를 사용합니다. 클라이언트 연결 안내와 정적 결과 재생 페이지(`site/`, 프레임워크 없는 TypeScript)를 제공합니다. Phase 7 확정 폼(`src/server/ui/`, 외부 파일 없는 HTML)은 버전을 고정한 MCP Apps 확장 `@modelcontextprotocol/ext-apps`를 사용하며, 확정 도구는 진행 중입니다.

| Technology | Role | Why |
|---|---|---|
| TypeScript | 데이터 생성기·검증기·core·MCP 서버 | 데이터 도구, 서버, HTML/JS 확정 폼을 같은 언어로 개발 |
| SQLite | 생산 데이터, 이슈, 감사 기록 | DB 서버 없는 단일 파일. 고정 시드로 생산 내용을 재현하되 새 생성본은 별도로 구분 |
| MCP (Model Context Protocol) | Claude와 서버 연결 | 대화와 도구 호출 반복은 Claude 데스크톱이 처리하고, 같은 서버를 다른 MCP 클라이언트에서도 재사용 가능 |
| Claude 데스크톱 | 클라이언트 (대화, 도구 선택, 답변) | 채팅 화면을 직접 만들 필요가 없고, API 비용도 들지 않음 |
| MCP Apps (Phase 7, 조건부 채택) | 대화 안의 이슈 확정 폼 | 서버가 화면을 제공하므로 별도 프론트엔드가 필요 없음 |
| 정적 페이지 (GitHub Pages) | 평가 결과 재생 페이지 | AI를 호출하지 않아 비용이 없고, 로그인 없이 링크로 공유 |

## AI 구성 요소

Phase 3의 서버 계산과 보호 장치를 Phase 4에서 MCP로 연결했습니다. 서버 자체는 AI 서비스를 호출하지 않습니다. Claude 등 MCP 클라이언트가 모델을 실행하고 필요한 도구를 선택합니다.

### 역할 분담

| Claude가 하는 일 | 서버가 하는 일 (규칙 기반) |
|---|---|
| 질문 이해 | "어제", "이번 주"를 생산일 기준 실제 기간으로 해석 |
| 호출할 도구 선택 | 교대 시간과 계획 정지 처리 (목표와 손실에서 제외) |
| 결과 해석과 답변 작성 | 모든 수치: 합계, 달성률, 손실 분해(비가동 / 속도 저하 / 불량), 시간대별 패턴 |
| 이슈 초안 작성 | 기간 밖, 휴무일, 계획 정지, 데이터 미입력, 생산 0, 조회 실패 구분 |
| | 권한, 중복 방지, 근거 번호, 감사 기록 |

### AI 결과의 성격

Claude는 해석만 하고 계산하지 않습니다. 답변에 나오는 모든 수치는 서버 응답에서 온 것이고, 근거 번호로 감사 기록에서 추적할 수 있습니다.

### 프롬프트가 아니라 구조로 지키는 안전

- **이슈 등록:** Claude는 초안까지만 만들 수 있습니다. 확정 도구는 Claude의 도구 목록에 없습니다. 사람이 버튼으로 확정하고, 서버는 일회용 초안 번호(10분 유효, 1회 사용)가 있을 때만 받아들입니다. 폼은 MCP Apps를 선언한 클라이언트에만 등록되며, 평가 실행기를 포함한 다른 클라이언트는 텍스트 도구만 그대로 사용합니다.
- **자유 메모:** 메모 칸은 참고 데이터로 감싸서 전달해, 안에 숨긴 지시를 따르지 않게 합니다. Claude가 속더라도 결과는 초안에서 멈춥니다.
- **작업자 정보:** 작업자 ID는 어떤 도구 응답에도 넣지 않아 개인별 순위를 만들 수 없습니다. 집계는 라인과 교대조 단위까지만 합니다.

### 실패 처리

오류가 나면 무엇이 잘못됐고 무엇이 가능한지 함께 알려서, Claude가 스스로 다시 시도할 수 있게 합니다. 예: "10월 생산일은 아직 시작 전입니다. 조회 가능 범위는 7/1~9/30입니다. 9월 기준으로 볼까요?"

### AI 동작 검증 방식 (계획)

- 동결한 평가용 시나리오 30개, 8개 유형: 단순 조회, 여러 단계 분석, 반복 패턴, 모호한 질문, 데이터 없음과 함정, 권한 밖 요청, 변경 요청, 공격 시도
- 도구 설명을 다듬는 데만 쓰는 개발용 시나리오 10개를 별도로 운영
- 서버 계산 코드와 독립적으로, 심어둔 사건에서 계산한 정답표와 대조해 채점
- 도구를 크게 묶은 버전과 잘게 나눈 버전을 비교
- 평가 실행마다 모델 버전을 고정하고 기록

## 빠른 시작

**Node.js 24.14.0, npm 11.x**가 필요합니다. 이 프로젝트 폴더(`production-mcp/`)에서 실행합니다.

```sh
npm ci
npm run generate
npm run validate
npm run check
```

`generate`는 `data/`에 `production.db`, `answer_key.json`, `validation.json`, `generator.config.json` 설정 스냅샷을 만듭니다. DB에는 2026년 7~9월의 6라인·66생산일 데이터와 정답 사건 9개가 들어 있습니다. API 키나 별도 DB 서버는 필요하지 않습니다.

개발 작업 폴더에는 첫 생성본을 이미 만들어 두었습니다. 다시 생성할 때는 사용하지 않은 폴더를 지정합니다. 기존 생성본의 파일은 덮어쓰지 않습니다.

```sh
npm run generate -- --out-dir data/run-02
npm run validate -- --db data/run-02/production.db --json
```

생성할 때마다 새 `dataset_version`과 실제 생성 시각을 기록합니다. DB 복사본은 원본 값을 유지하고, 정답표의 버전도 DB와 같아야 합니다. 이 식별값 검사는 생성본 간 생산 내용이 동일한지 비교하는 검사가 아닙니다.

설정은 [config/generator.config.json](config/generator.config.json)에서 수정하거나 `generate`에 `--config 경로`로 전달합니다. 검증은 기본적으로 DB 옆의 설정 스냅샷을 사용하므로 원본 설정을 수정해도 예전 생성본의 검증 기준이 바뀌지 않습니다. 생성 파일 묶음은 Git에서 제외하며, DB와 정답표를 함께 다시 만듭니다.

`npm run check`는 타입 검사(서버와 결과 재생 페이지), **파일 20개의 테스트 206개**, 빌드를 실행합니다. Phase 5 테스트 37개는 모델·도구 호출 반복, 한도, 채점 단위·중간 턴, 원본을 보존하는 실제 stdio 실행, DB 변경, 기록 해시 기반 사람 검수와 검수 화면 판정 반영을 확인합니다. Phase 6 테스트 7개는 페이지 데이터 생성(검수 완료 쌍만, 근거 번호, 줄이기, 불일치 감지)과 텍스트로만 표시하는 렌더링을 확인합니다. Phase 7 테스트 5개는 MCP Apps 감지, 그대로 유지되는 텍스트 도구 목록, 두 도구 세트의 폼 연결, 외부 파일 없는 폼, 폼 클라이언트용 초안 안내를 확인합니다. MCP 테스트는 도구 목록, 묶음·세부 버전 동일 결과, 기간, 권한·정보 보호와 복사본 보호를 검증합니다. 테스트는 `.env`를 읽거나 유료 API를 호출하지 않습니다. 일치하는 동결 생성본이 있으면 복사하고 새 체크아웃에는 별도 테스트 데이터를 만듭니다. 개별 실행은 `npm test`, `npm run typecheck`, `npm run build`를 사용합니다. 빌드된 생성기·검증기는 Node.js로도 실행할 수 있습니다.

```sh
node dist/generator/index.js --out-dir data/run-03
node dist/validator/index.js --db data/run-03/production.db
```

Phase 2의 질문 목록과 채점 규칙은 [eval/scenarios/README.md](eval/scenarios/README.md)에 있습니다. 현재 작업 폴더에서는 `npm run scenarios:check`가 동결한 `data/phase2/` 생성본을 검사합니다. 기존 `data/` 생성본은 보존했습니다. 새 체크아웃에는 생성 파일이 없으므로, 사용하지 않은 폴더에 생성한 뒤 잠금을 명시적으로 다시 연결합니다. 이 작업은 평가 식별값을 바꾸며 CHANGE 기록을 남깁니다.

```sh
npm run generate -- --out-dir data/phase2
npm run scenarios:freeze -- --dataset-dir data/phase2 --reason "Bind a newly generated local dataset"
npm run scenarios:check
```

원래 식별값을 유지하려면 일치하는 생성본 복사본을 `npm run scenarios:check -- --dataset-dir path/to/copy`로 검사합니다. 기존 잠금은 사유 없이 덮어쓸 수 없습니다. 해시와 생성본 연결은 [Phase 2](Phase/Phase2_EvaluationScenarios.md), Claude Desktop·Code 연결 방법은 [MCP 실행 안내](docs/MCP_SETUP.md)에 있습니다.

구현한 서버 로직은 AI 연결 없이 실행할 수 있습니다. 명령이 임시 DB 복사본에서 조회·감사 기록을 수행하고 종료 후 복사본을 정리합니다.

```powershell
npm run core:demo
npm run core:demo -- --period '{"kind":"recent","unit":"weeks","count":4}'
npm run core:demo -- --period '{"kind":"week_day","weeksAgo":1,"weekday":3}'
```

기본값은 `data/phase2/production.db`의 지난달이며 `--db`로 다른 원본을 지정할 수 있습니다. 특정 월, 최근 N일·주·개월, 완료된 달력 주, 상대 주차의 요일과 직접 지정한 날짜·범위를 지원합니다. `--compare-to`에 다른 기간 JSON을 넣으면 비교합니다. 미입력은 상태로 표시하며 해당 구간은 관측 합계·목표에서 제외합니다. 기간별 의미와 TypeScript 호출 방법은 [Phase 3](Phase/Phase3_CoreLogic.md)에 있습니다.

### MCP 실행하기

빌드 후 생성한 DB를 복사하고, 실제 PC의 절대 경로가 들어 있는 클라이언트 설정을 출력합니다.

```powershell
npm run db:copy -- --from data/production.db --to data/run/phase4-production.db
npm run --silent mcp:config -- --db data/run/phase4-production.db --role viewer --user demo
npm run mcp:demo -- --db data/production.db
```

데모는 빌드된 stdio 서버에 연결해 목록을 확인하고 개발용 D01(L5 어제 실적)을 조회합니다. AI 모델은 사용하지 않습니다. 기본 `coarse`는 `get_line_info`, `query_production`, `analyze_production`, `preview_issue` 4개이며 `--toolset fine`으로 10개를 선택합니다. 기존 DB는 덮어쓰지 않으며 실행용 DB 옆의 `.runtime.json`을 함께 보관해야 합니다. 기능별 조건·검증·남은 수동 확인은 [Phase 4](Phase/Phase4_McpServer.md)에 기록했습니다.

### 실제 AI 평가 (Phase 5)

Git에서 제외된 `.env`에 `ANTHROPIC_API_KEY`를 입력합니다. `.env.example`은 비밀값 없이 지원 설정을 안내하며 기존 `.env`는 보존합니다. 평가에는 API 비용이 발생합니다. 실행기는 응답 요청 전에 토큰 수를 확인하고 설정한 예상 비용 한도를 적용합니다.

```bash
npm run eval -- --set dev --toolset coarse --ids D01 --max-cost-usd 0.25
npm run eval:review -- --run <runId>
npm run eval:sheet
npm run eval:review -- --apply <review-decisions.json>
npm run eval:summary
```

[eval/summary.md](eval/summary.md)에서 전체 결과를 확인합니다. 검수용 Markdown에는 질문, 실제 도구 입력, 서버 결과, 최종 답변, 독립 정답과 자동 검사가 들어 있습니다. 옆 JSON 체크리스트는 검수 대기로 시작하며 사람이 검수를 마치기 전에는 최종 정답률을 표시하지 않습니다. `eval:sheet`는 coarse와 fine 답변을 정답·일치 위치 표시와 함께 나란히 보여주는 로컬 검수 화면(`eval/reviews/review-sheet.html`)을 만듭니다. 화면에서 저장한 결정 파일은 `eval:review -- --apply`가 검증한 뒤 반영합니다. 전체 개발용 실행, 도구 설명 동결, 30개 질문 비교, 비용·실행 결과는 [Phase 5](Phase/Phase5_Evaluation.md)에 기록합니다. Claude에는 질문과 공개 MCP 문맥만 전달하며 정답표는 채점기에서만 사용합니다.

### 결과 재생 페이지 (Phase 6)

```bash
npm run site:data     # eval/runs + eval/reviews → site/data/ (커밋 대상)
npm run site:build    # site/src → site/dist/
npm run site:serve    # http://127.0.0.1:4173/
```

정적 페이지는 두 도구 세트의 평가 시나리오 30개를 결과표, 시나리오별 단계(질문 → 근거 번호가 붙은 도구 호출 → 서버 응답 → 최종 답변 → 정답값 → 검수 메모 원문), 도구 세트 비교로 보여줍니다. 화면 문구는 한국어·영어로 전환하며 기록 본문은 원래대로 표시합니다. 커밋된 JSON만 읽고 AI를 호출하지 않으며 기록의 모든 문자열을 텍스트로만 표시합니다. `site:data`는 같은 조건에서 사람 검수를 마친 전체 평가 실행 쌍만 게시하며, `npm run site:data -- --check`는 `site/data/`가 기록과 달라지면 실패합니다. `.github/workflows/pages.yml`은 `main`에 push되면 이 검사를 거쳐 GitHub Pages(소스: "GitHub Actions")에 배포합니다. 공개 페이지: https://soyeonahn3.github.io/shopfloor-mcp/. 자세한 내용은 [Phase 6](Phase/Phase6_ResultReplayPage.md)에 있습니다.

### 이슈 확정 폼 (Phase 7, 진행 중)

폼은 MCP Apps를 선언한 클라이언트에만 나타납니다. Claude 데스크톱 없이 MCP Inspector 웹 화면으로 확인할 수 있습니다(`npx`로 실행하며 프로젝트 의존성에 넣지 않음, Node 22.19 이상).

```powershell
npm run build
npm run db:copy -- --from data/production.db --to data/run/phase7-inspector.db
npx -y @modelcontextprotocol/inspector@2.12.0 node dist/server/index.js --db data/run/phase7-inspector.db --role operator --user demo
```

명령이 연 브라우저 화면에서 연결한 뒤, Tools 탭에서 `query_production`을 실행해 근거 번호(`Q-…`)를 받고, Apps 탭에서 그 번호로 `preview_issue`를 호출해 앱을 엽니다. 폼은 라인, 생산일, 근거, 유효 시간을 보여주고 제목·심각도·설명을 사람이 고칠 수 있게 합니다. 확정 버튼은 이미 호스트를 거쳐 `confirm_issue`를 보내지만 도구가 아직 등록되지 않아 이슈는 만들어지지 않습니다. Inspector CLI, Claude Code, 평가 실행기는 MCP Apps를 선언하지 않으므로 폼이 보이지 않습니다. 자세한 내용은 [Phase 7](Phase/Phase7_ConfirmationAndDemo.md)에 있습니다.

### 모델 비교 계획

**개발 완료 후 별도 테스트 (Phase 5에서 이동, 2026-10-26 연기):** 같은 coarse 도구 4개·동결 질문·DB로 `claude-opus-5-5`와 기존 `claude-sonnet-5-5`를 비교합니다. 사람 검수를 거친 품질, 호출 횟수, 시간, 토큰과 비용을 평가합니다. Opus는 아직 실행하지 않았습니다. 개선 후보를 반영하고 Sonnet으로 다시 평가한 뒤로 연기했으며, 모델 판단력 문제로 보이는 실패가 남을 때만 coarse 도구 4개로 실행합니다. 실행 전에는 모델별 개발용 검증·동결, 단가 확인과 모델 간 비교 보고서가 필요합니다. 현재 요약기는 같은 모델의 도구 구성을 비교합니다. 실험과 모델 지원 종료 시 전환 계획은 [Phase 5](Phase/Phase5_Evaluation.md)에 기록했습니다. 종료 자동 감시와 자동 대체 기능은 아직 구현하지 않았습니다.

## 프로젝트 구조

현재 파일입니다.

```
shopfloor-mcp/
├── plan/
│   ├── 01_production-mcp-server.md    # 기획서 (목표, 도구, 평가, 범위)
│   └── 01a_production-mcp-dataset.md  # 데이터셋 설계서 (데이터 아키텍처, 테이블, 정답 사건)
├── Phase/
│   ├── Phase1_Foundation.md           # ✅ 완료
│   ├── Phase2_EvaluationScenarios.md  # ✅ 완료
│   ├── Phase3_CoreLogic.md            # ✅ 완료
│   ├── Phase4_McpServer.md            # ✅ 구현·자동 검증 완료, 클라이언트 수동 확인 대기
│   ├── Phase5_Evaluation.md           # ✅ Sonnet 평가 사람 검수 완료
│   ├── Phase6_ResultReplayPage.md     # ✅ 완료, GitHub Pages 게시
│   └── Phase7_ConfirmationAndDemo.md  # 🚧 진행 중
├── config/generator.config.json      # 시드, 정상 범위, E1~E9, 과거 이슈
├── src/
│   ├── shared/                       # 행 타입, 시각 함수, 코드 표시명
│   ├── generator/                    # SQLite 스키마와 데이터 생성
│   ├── answer-key/                   # 독립적인 사건·주간 집계
│   ├── eval/                         # 시나리오 형식, 로딩, 동결 검사
│   ├── core/                         # 검증된 조회, 집계·분석, 감사 기록과 이슈
│   ├── server/                       # 묶음·세부 MCP 도구, 자료, 템플릿, stdio 연결, MCP Apps 폼(ui/)
│   └── validator/                    # V01~V17과 CLI
├── eval/scenarios/                   # 평가용 30개·개발용 10개 JSON, 잠금, 질문 목록
├── site/                             # 결과 재생 페이지: index.html, style.css, src/*.ts, data/ (커밋한 JSON)
├── tests/                            # 파일 20개, 테스트 206개
├── scripts/                          # 빌드 자료, 동결, 실행용 복사, 설정, 데모, 페이지 데이터와 로컬 서버
├── .github/workflows/pages.yml       # 결과 재생 페이지 검사와 GitHub Pages 배포
├── resources/                        # 용어집, 데이터 안내, 검증된 이상 판단 기준
├── docs/MCP_SETUP.md                 # 빌드, 실행 DB, 클라이언트 연결과 데모
├── data/                             # 생성 파일 묶음, Git 제외
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
├── tsconfig.site.json
├── vitest.config.ts
├── .node-version
├── .claude/skills/                    # 개발에 쓰는 Claude Code 스킬
├── .gitignore
├── README.md
└── README_ko.md
```

## 현재 상태

| Phase | Status | Deliverable |
|---|---|---|
| Phase 0 — 기획 | ✅ 완료 | 기획서 + 데이터셋 설계서 (테이블 11개, 정답 사건 9개, 정답표 명세) |
| Phase 1 — 개발 기반 | ✅ 완료 | TypeScript 프로젝트, 데이터 생성기 (테이블 11개, 69,835행), 정답표, 검증 규칙 17개, 테스트 37개 통과 |
| Phase 2 — 평가 시나리오 | ✅ 완료 | 평가용 30개 동결·개발용 10개, 주간 비교, 형식·참조 검사, 생성본 연결 잠금 |
| Phase 3 — 서버 내부 로직 | ✅ 완료 | 일반화한 기간, 상태 6가지, 집계·비교·분석, 감사 기록이 있는 호출 경로, 초안·확정 보호, 테스트 63개 추가와 CLI |
| Phase 4 — MCP 서버 | ✅ 구현·자동 검증 완료, 클라이언트 수동 확인 대기 | 기본 도구 4개·비교용 10개, 자료 4개·템플릿 2개, 신규 테스트 43개와 stdio 데모 |
| Phase 5 — 평가 | ✅ Sonnet 평가 사람 검수 완료(93.3% / 86.7%) | 실제 Claude/MCP 실행기, 개발용 개선, 정답·행동 검사, JSON/Markdown 기록과 4개·10개 도구 비교 |
| Phase 6 — 결과 재생 페이지 | ✅ 완료, GitHub Pages 게시 | 정적 페이지(결과표, 시나리오 단계, 도구 세트 비교, 한·영 전환), 불일치 검사가 있는 데이터 생성, Pages 워크플로, 신규 테스트 7개 |
| Phase 7 — 확정 화면과 데모 | 🚧 진행 중 | 1~4번 우선: MCP Apps 조건부 채택(Claude 데스크톱 확인 전), 이슈 확정 폼 완료·MCP Inspector 렌더링 확인, 신규 테스트 5개. 다음은 사람 전용 `confirm_issue`와 테스트. 데모 영상과 문서는 그 뒤 |

Phase 1~6은 개발 1단계(텍스트), Phase 7은 개발 2단계입니다. 상세 내용은 [Phase/](Phase/)에 있습니다.

## 문서

| 문서 | 내용 |
|---|---|
| [plan/01_production-mcp-server.md](plan/01_production-mcp-server.md) | 기획서: 문제, 도구, 서버 로직, 이슈 확정 원칙, 평가, 범위, 리스크, 결정 사항 |
| [plan/01a_production-mcp-dataset.md](plan/01a_production-mcp-dataset.md) | 데이터셋 설계서: 데이터 아키텍처, 전체 테이블 칼럼, 정답 사건 E1~E9, 정답표, 검증 규칙 |
| [Phase/](Phase/) | Phase별 계획과 개발 기록 (TypeScript, 영어·한국어): 모듈, 설계 결정, 완료 검사 |

## 한계점

- Phase 1~5의 데이터·동결 질문·검증된 core·MCP 서버와 실제 모델 평가 도구를 제공합니다. 자동 검사는 잠정 판정이며 최초 N=1 실행은 변동성을 측정하지 못합니다. Sonnet 평가 60건은 사람 검수를 마쳤고 개선 후보 8개를 Phase 5에 기록했습니다(미적용). 결과 재생 페이지는 GitHub Pages에 게시했습니다. 확정 폼은 MCP Inspector에서 렌더링되지만 확정 도구는 아직 등록하지 않았고, Claude 데스크톱 확인은 남아 있습니다.
- 생산 수량은 시간대별 합계입니다. 검증기는 교대 시간을 제외한 생산 가능 수량을 확인하며, 양품 하나하나의 생산 분까지 증명하지는 못합니다.
- 가상 데이터만 사용하며, 실제 사내 시스템과 연동하지 않습니다.
- 로컬 전용입니다. 사용자 PC에서 Claude 데스크톱이 서버를 실행하며, 원격 배포와 로그인은 없습니다.
- 실제 MES 데이터보다 단순합니다: 라인당 제품 1개, 생산 오더 없음, 설비 단위 기록 없음, 공휴일 없음.
- 기준 시각이 2026-10-01 08:00 하나로 고정되어 있어, 데이터가 시간에 따라 바뀌지 않습니다.

## 향후 계획

MVP 이후:

- 붙여넣기 방식 비교: MCP 없이 데이터를 Claude에게 직접 넣어 같은 시나리오를 실행
- 추가 화면: 원인 분해 차트, 조회 근거 패널
- 목표 달성 전망, 이슈 재발 연결, 교대 인수인계 템플릿, AI 활동 기록 조회
- RAG 프로젝트를 두 번째 MCP 서버로 연결해 생산 데이터와 사내 규정을 조합

---
<p align="center">Made with AI-assisted development</p>
