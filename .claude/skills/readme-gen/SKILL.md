---
name: readme-gen
type: general
version: 1.0
description: 프로젝트를 분석하여 README.md(영어)와 README_ko.md(한국어)를 자동 생성한다. "readme 만들어줘", "README 생성해줘", "readme 작성해줘", "프로젝트 설명 만들어줘" 등의 요청 시 트리거한다.
required_environment:
  - Python 3.8+
depends_on: []
produces:
  - README.md (영어, GitHub 메인)
  - README_ko.md (한국어)
  - docs/API.md (API 엔드포인트 존재 시)
references:
  - references/section-rules.md   # 섹션 구성 규칙, 프로젝트 유형 판별 기준, 작성 원칙
---

# README Gen Skill

프로젝트를 스캔하여 유형을 판별하고, 해당 프로젝트에 맞는 README를 영어/한국어로 자동 생성한다.

---

## 사전 조건

- 대상 프로젝트 디렉토리가 존재할 것
- 프로젝트에 최소 1개 이상의 소스 파일이 존재할 것
- README.md가 이미 존재하면 덮어쓰기 전 사용자 확인 필수

---

## STEP 1 — 프로젝트 스캔

대상 프로젝트 디렉토리에서 아래 정보를 수집한다.

### 1-1. 파일 구조 스캔

```
Glob으로 전체 파일 목록 확인:
- 루트 디렉토리 파일 (package.json, requirements.txt, go.mod 등)
- 소스 디렉토리 구조 (src/, lib/, app/, backend/, frontend/)
- 설정 파일 (.env.example, Dockerfile, docker-compose.yml)
- 문서 파일 (docs/, *.md)
- 테스트 파일 (test/, __tests__/, *_test.*, *.spec.*)
- 라이선스 (LICENSE, LICENSE.md)
- 기여 가이드 (CONTRIBUTING.md)
```

### 1-2. 의존성 분석

```
의존성 파일을 Read로 확인:
- package.json → dependencies, devDependencies, scripts, bin, main
- requirements.txt / Pipfile / pyproject.toml → Python 패키지 목록
- go.mod / Cargo.toml / build.gradle → 기타 언어 의존성
```

### 1-3. 핵심 소스 파일 분석

```
진입점 및 주요 파일을 Read로 확인:
- main.py, index.js, app.py 등 진입점
- 라우터/컨트롤러 파일 (API 엔드포인트 파악)
- 설정 파일 (환경변수 목록 파악)
```

---

## STEP 2 — 프로젝트 유형 판별

`references/section-rules.md`의 "프로젝트 유형 판별 기준" 참조.

스캔 결과를 기반으로 복수 태그를 부여한다:

```
예시 결과:
- 유형: [web, ai]
- 언어: Python 3.14
- 프레임워크: FastAPI
- AI: google-genai, openai
- DB: Notion API (외부 서비스)
- 테스트: 없음
- Docker: 없음
- 라이선스: 없음
```

---

## STEP 3 — 섹션 선별

`references/section-rules.md`의 "고정 섹션"과 "조건부 섹션" 참조.

### 3-1. 고정 섹션 확정

모든 프로젝트에 포함:
1. 언어 스위치
2. 프로젝트명 + 한 줄 설명
3. 개요
4. 목차
5. 동작 흐름
6. 기술 스택 (Technology / Role / Why 3칸 표)
7. 빠른 시작
8. 프로젝트 구조
9. 현재 상태 (Phase 기반이면 Phase / Status / Deliverable 3칸 표)
10. 푸터

### 3-2. 조건부 섹션 판단

스캔 결과와 유형 태그를 기준으로 조건부 섹션 포함 여부를 결정한다:

```
[예시]
✅ 포함: AI 구성 요소 (ai 태그 감지)
✅ 포함: 문서 (Program_Manual.md, CurrentStatus.md 감지)
❌ 제외: 테스트 (테스트 파일 미발견)
❌ 제외: 라이선스 (LICENSE 파일 미발견)
❌ 제외: 기여 방법 (CONTRIBUTING.md 미발견)
❌ 제외: Docker (Dockerfile 미발견)
❌ 제외: 신뢰성 (자동화/스케줄링 미감지)
✅ 포함: 한계점 (localhost 전용, 테스트 미작성 등 감지)
```

### 3-3. API 문서 분리 판단

API 엔드포인트가 존재하면 (FastAPI, Express, Django REST 등):
- README에는 API 섹션을 넣지 않음
- `docs/API.md`를 별도 생성
- README 문서 섹션에 `docs/API.md` 링크 추가

---

## STEP 4 — README 초안 생성

`references/section-rules.md`의 "작성 원칙" 준수.

### 4-1. 영어 README.md 생성

- 모든 내용을 영어로 작성
- 최상단에 언어 스위치: `🌐 [한국어](./README_ko.md) | [English](./README.md)`
- 고정 섹션 + 선별된 조건부 섹션 순서대로 작성
- 최하단에 `Made with AI-assisted development` 푸터

### 4-2. 한국어 README_ko.md 생성

- 영어 README와 동일한 구조, 한국어로 번역
- 최상단에 언어 스위치: `🌐 [한국어](./README_ko.md) | [English](./README.md)`
- 기술 용어, 명령어, 코드 블록은 번역하지 않음

### 4-3. docs/API.md 생성 (해당 시)

- API 엔드포인트를 Method / 경로 / 설명 표로 정리
- 요청/응답 예시 포함

### 작성 시 금지 사항

- 검증되지 않은 명령어 임의 생성 금지
- 과장 표현 금지 ("혁신적", "강력한", "최첨단" 등)
- 존재하지 않는 파일/기능 기술 금지
- 파일명에 공백 사용 금지 (언더스코어 사용)

---

## STEP 5 — 사용자 확인

초안 생성 후 바로 저장하지 않고, 아래 형식으로 사용자에게 확인 요청한다:

```
📋 README 초안이 생성되었습니다.

생성 파일:
  - README.md (영어)
  - README_ko.md (한국어)
  - docs/API.md (API 문서)

포함된 섹션: [섹션 목록]
제외된 섹션: [섹션 목록 + 제외 이유]

1. 이대로 저장
2. 섹션 추가/제거 후 저장
3. 내용 수정 후 저장
```

사용자가 선택하기 전까지 저장하지 않는다.

---

## STEP 6 — 저장

사용자 확인 후:

### 6-1. 기존 README 존재 시

- 덮어쓰기 전 한 번 더 확인: "기존 README.md를 덮어씁니다. 진행할까요?"
- 사용자 승인 후 저장

### 6-2. 파일 저장

```
Write 도구로 저장:
1. README.md (영어)
2. README_ko.md (한국어)
3. docs/API.md (해당 시, docs/ 디렉토리 없으면 생성)
```

### 6-3. 기존 문서 파일명 정리 (해당 시)

프로젝트 내 문서 파일명에 공백이 있으면:
- 사용자에게 알림: "Program Manual.md → Program_Manual.md로 변경을 권장합니다"
- 사용자 승인 시에만 변경 (자동 변경 금지)

### 6-4. 완료 보고

```
✅ README 생성 완료

생성된 파일:
  - README.md (영어)
  - README_ko.md (한국어)
  - docs/API.md

프로젝트 유형: [판별된 유형]
포함된 섹션: [섹션 목록]
```

---

## 출력 형식

최종 생성되는 파일 구조:

```
프로젝트/
├── README.md           # 영어 (GitHub 메인)
├── README_ko.md        # 한국어
└── docs/
    └── API.md          # API 문서 (해당 시)
```

---

## 실패 처리

| 실패 유형 | 처리 방법 |
|---|---|
| 대상 디렉토리 없음 | 경로 재확인 요청 후 중단 |
| 소스 파일 없음 | "프로젝트 파일을 찾을 수 없습니다" 안내 후 중단 |
| 의존성 파일 없음 | 소스 코드 기반으로 기술 스택 추정, 사용자에게 확인 |
| 파일 I/O 실패 (쓰기) | 에러 메시지 출력 후 중단 |
| 기존 README 덮어쓰기 거부 | 중단, 기존 README 유지 |

---

## 주의사항

- 이 스킬은 README를 **새로 생성**하는 용도. 기존 README 수정은 `readme-update` 스킬 사용
- 사용자 확인 없이 파일을 저장하지 말 것
- 검증할 수 없는 실행 명령어를 임의로 만들지 말 것
- 프로젝트에 존재하지 않는 기능을 README에 기술하지 말 것
- 파일명에 공백 대신 언더스코어를 사용할 것
