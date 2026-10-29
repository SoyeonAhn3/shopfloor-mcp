# shopfloor-mcp

생산 데이터 MCP 서버. 계산은 서버가 하고 Claude는 해석만 한다. 데이터를 바꾸는 유일한 행동(이슈 등록)은
Claude가 초안까지만 만들고, 확정은 사람 버튼으로만 한다.

이 문서와 코드가 다르면 코드를 따르고, 불일치를 사용자에게 알린다.

## 명령어
- `npm run check` — typecheck + test + build + 결과 재생 페이지 데이터 검사(`site:data -- --check`). 코드 변경의 완료 기준.
  재생 데이터가 낡았다고 실패하면 `npm run site:data`로 다시 만든다(채점기·검수 화면·평가 기록 변경 시)
- `npx vitest run tests/<area>` — 영역별 테스트 (core, server, eval ...)
- `npm run scenarios:check` — 동결 시나리오 무결성 검사 (data/phase2 필요). 없으면 만들지 말고 알린다.
  생성 후 잠금 재연결은 평가 식별값을 바꾸는 재동결이다(절차는 README Phase 2)
- `npm run mcp:demo` — AI 없이 빌드된 서버에 실제 stdio 연결해 확인
- `npm run eval` — **유료 API 호출. Claude는 실행하지 않고 사용자가 터미널에서 직접 실행한다** (hook은 보조 장치)

## 구조와 의존 방향
- shared ← generator / answer-key / validator (데이터 생성·정답표·검증)
- shared ← core ← server ← eval (eval은 MCP 클라이언트로 빌드된 서버를 실행)
- core는 generator·answer-key를 import하지 않는다. 정답표는 서버 계산과 독립이어야 채점이 의미 있다.
- MCP 도구는 core `createCore()`의 공개 연산만 호출한다. 계산을 server/eval에 중복 구현하지 않는다.
- 계산·결과 형식 변경은 core와 `src/server/format.ts`에서 한다. coarse/fine의 동일 결과는 tests/server로 확인한다.
- 테이블·칼럼은 `src/generator/schema.sql`, 용어 정의는 `resources/glossary.md`에서 확인하고 추측하지 않는다.

## 절대 규칙

### 안전 구조 (프롬프트가 아니라 구조로 막는다)
- Claude(모델)가 호출할 수 있는 도구에 이슈 확정 기능을 넣지 않는다.
  확정은 core `confirmDraft()`와 사람 입구로만 들어온다. Phase 7 화면 전용 등록 방식은 plan 3-2를 따른다.
- 공개 연산은 `audited()`를 거친다. 감사 기록과 작업자 정보 제거(`protectOutput`)가 여기서 적용되므로 우회 경로를 만들지 않는다.
- 작업자 ID는 어떤 응답에도 넣지 않는다. 집계는 라인·교대조 단위까지만 한다.
- 자유 메모는 `wrapMemo()`로 reference_data로 감싸서 반환한다.
- 역할(viewer/operator)은 서버 실행 설정으로만 정한다. 도구 입력으로 바꾸는 경로를 만들지 않는다.
- 확정 처리(검증 → 등록 → 초안 사용 처리 → 성공 감사 기록)는 하나의 트랜잭션으로 처리한다.

### 도메인 계산
- "어제", "지난주" 같은 기간 해석의 기준은 `clocks.reference()`(2026-10-01 08:00 KST)다.
  실제 시각(`new Date()`)은 실행 ID·생성 시각·감사 시각 같은 기록용 타임스탬프에 쓴다.
- 생산일은 08:00 ~ 다음 날 08:00 직전이다. 새벽 기록은 전날 생산일에 속한다.
- 미입력은 0이 아니다. `src/core/status.ts`의 DataStatus 6개 상태를 서로 섞지 않는다.
- 달성률 = 양품 ÷ 목표. 백분율이 아닌 비율로 반환한다(0.85 = 85%). 목표가 0이면 null과 planned_stop 상태로 반환한다.
- 손실 분해는 항상 비가동 + 속도 + 불량 = 목표 − 양품을 만족해야 한다.
- 범위를 벗어난 기간을 임의로 잘라서 조회하지 않는다.

### 평가 무결성
- `src/server/descriptions.ts`와 평가 프롬프트는 개발용 D01~D10 결과로만 수정한다.
  평가용 S01~S30 결과를 보고 설명·프롬프트·채점 규칙을 고치지 않는다.
- descriptions.ts를 바꾸면 descriptionsHash가 달라져 기존 평가와 다른 조건이 된다. 바꿀 때 사용자에게 알린다.
- `eval/scenarios/eval/`, `eval.lock.json`, `eval/description-freeze.json`, `eval/freezes/`는 사용자 요청 없이 수정하지 않는다.
  재동결할 때는 `--reason`을 남긴다.
- 모델에는 시나리오의 `turns`만 전달한다. 정답표·expect·reviewCriteria는 채점기에서만 쓴다.
- `eval/runs/` 기존 기록은 수정·삭제하지 않는다.
- `eval/reviews/*.json`의 reviewer·verdict는 사람이 작성한다. Claude가 검수 완료로 표시하지 않는다.
- 해시·잠금 검사(scenarios:check, 검수 해시, freeze 조건)가 실패하면 우회하지 말고 원인과 함께 보고한다.
- 위 금지는 hook과 무관하게 지킨다. `.claude/hooks/guard-eval.mjs`는 유료 평가 실행과 동결 기록의 직접 수정을
  보조로 차단한다. 차단되면 우회하지 말고 사용자에게 알린다. hook 파일이 없거나 hook 오류가 보이면 즉시 알린다.
  hook과 `.claude/settings.json`은 사용자 요청 없이 수정하지 않는다.

### 데이터·파일
- `data/`는 Git 제외 생성본이다. 기존 생성본을 덮어쓰거나 재생성하지 않고, 새로 만들 때는 새 `--out-dir`을 쓴다.
- 원본 DB는 읽기 전용이다. 쓰기는 `db:copy`로 만든 실행용 복사본(+ `.runtime.json` 마커)에서만 한다.
- 테스트는 `.env`를 읽거나 유료 API를 호출하지 않는다. DB는 `tests/core/fixture.ts`로 준비한다.
- `.env`의 값(API 키)을 출력하거나 로그·기록에 남기지 않는다. `.claude/hooks/guard-env.mjs`가 `.gitignore`와 같은
  기준(`.env`, `.env.*`, `*.env`, 템플릿 제외)으로 도구 접근을 차단한다. 차단되면 우회하지 말고 사용자에게 요청한다.

## 코드 관례
- ESM + NodeNext: 상대 import에 `.js` 확장자를 붙인다.
- `exactOptionalPropertyTypes`: 선택 필드는 `...(x ? { x } : {})`로 넣고 undefined를 대입하지 않는다.
- 외부 입력(도구 인자, 설정, 시나리오 JSON)은 zod로 파싱한다. 도구 입력 스키마는 strict(`z.strictObject`)로 만든다.
- 식별자·코드 주석은 영어, 사용자·AI가 읽는 문자열(도구 설명, 오류 안내)은 한국어로 쓴다.
- 주변 코드처럼 짧게 쓰고 주석은 최소로 단다. 주석은 "왜"만 적는다.
- 의존성은 정확한 버전으로 고정한다. 새 패키지는 사용자 확인 후 추가한다.

## 문서 동기화
- README.md(영어)와 README_ko.md(한국어)는 같은 내용으로 유지한다. 테스트 수·도구 수가 바뀌면 둘 다 갱신한다.

## 완료 기준
- `npm run check`가 통과해야 한다. 실패를 숨기거나 테스트를 약화시키지 않는다.
- 알려진 환경 실패: 프로젝트 경로에 한글 등 비ASCII 문자가 있으면 Node 22의 `fs.cpSync` 크래시로
  `tests/eval/scenarios.test.ts`가 실행되지 않는다. 그 외 실패는 실제 문제로 본다.
  `src/eval/`의 동결·해시 코드를 바꿀 때는 ASCII 경로 복제본에서 check를 실행해 이 파일까지 확인한다.
- 동작이 바뀌면 해당 Phase 문서와 README 갱신이 필요한지 확인한다.

## 참고 문서 (필요할 때 읽기)
- plan/01_production-mcp-server.md — 목표, 이슈 확정 원칙, 결정 사항
- plan/01a_production-mcp-dataset.md — 테이블 11개, 정답 사건 E1~E9
- Phase/Phase5_Evaluation.md — 실행 한도, 채점, 검수 절차
- eval/scenarios/README.md — 시나리오별 기대 행동
- docs/MCP_SETUP.md — 클라이언트 연결
