# README 섹션 규칙

## 고정 섹션 (모든 프로젝트에 항상 포함)

### 1. 언어 스위치
```markdown
🌐 [한국어](./README_ko.md) | [English](./README.md)
```
- README.md (영어) 최상단, README_ko.md (한국어) 최상단에 동일하게 배치

### 2. 프로젝트명 + 한 줄 설명
```markdown
# Project Name
> One-line description
```

### 3. 개요
- 해결하는 문제 (1~2문장)
- 접근 방식 (1~2문장)
- 데모/포트폴리오 목적이면 솔직하게 명시

### 4. 목차
- 포함된 섹션만 링크 나열

### 5. 동작 흐름
- 핵심 플로우를 텍스트 다이어그램(→, ↓)으로 표현
- 5~7단계 이내

### 6. 기술 스택
```markdown
| Technology | Role | Why |
|------------|------|-----|
| ...        | ...  | ... |
```
- 각 기술이 어떤 역할인지 반드시 표기
- "Why" 칸에 해당 기술을 선택한 이유를 1줄로 설명 (대안 대비 장점, 제약 조건 등)
- 예: `localStorage + IndexedDB | 클라이언트 저장소 | 서버 없이 오프라인 동작, 별도 DB 운영 비용 제거`

### 7. 빠른 시작
- 사전 요구사항 (언어 버전, 외부 서비스 토큰 등)
- 설치 명령어 (package.json scripts, requirements.txt 등에서 검증된 것만)
- 실행 명령어 (검증된 것만, 임의 생성 금지)
- 환경변수 설정 안내 (.env.example 또는 필요한 키 목록)

### 8. 프로젝트 구조
- 주요 디렉토리/파일만 트리로 표시
- 각 파일/폴더 옆에 한 줄 설명

### 9. 현재 상태
- 구현 완료 / 진행 중 / 예정을 명확히 구분
- Phase 기반 프로젝트면 Phase 테이블로, 각 Phase에 결과물 1줄 요약 포함
```markdown
| Phase | Status | Deliverable |
|-------|--------|-------------|
| Phase 1 — 기본 UI | ✅ Done | 워크플로우 편집기 + 노드 드래그앤드롭 |
| Phase 2 — 저장 | 🔧 In Progress | IndexedDB 기반 워크플로우 저장/불러오기 |
| Phase 3 — 내보내기 | 📋 Planned | JSON/YAML 내보내기 및 공유 링크 |
```
- Deliverable은 해당 Phase의 핵심 산출물을 1줄로 요약 (기능명 + 핵심 동작)

### 10. 푸터
```markdown
---
<p align="center">Made with AI-assisted development</p>
```

---

## 조건부 섹션 (스캔 결과에 따라 포함/제외)

### AI 구성 요소 (AI 의존성 감지 시)
포함 조건: openai, langchain, anthropic, google-genai, transformers, torch 등 감지
내용:
- AI가 처리하는 부분 (입력 → 출력 표)
- 규칙 기반 처리 부분
- 모델 선택 방식
- AI 실패 처리 방식
- AI 결과의 성격 (참고용 vs 최종 판단)

### 신뢰성 (자동화/스케줄링 감지 시)
포함 조건: cron, scheduler, celery, 파이프라인, 배치 처리 감지
내용:
- 중복 방지, 실행 ID
- 에러 로그, 재시도, 폴백
- 알림 상태, 데이터 검증

### 테스트 (테스트 파일 감지 시)
포함 조건: test/, __tests__/, *_test.*, *.spec.*, pytest, jest 등 감지
내용:
- 테스트 실행 명령어
- 커버리지 정보 (있으면)

### 문서 (별도 문서 파일 감지 시)
포함 조건: docs/, *_Manual.md, *_Guide.md, CurrentStatus.md 등 감지
내용:
- 문서명 + 내용 설명 표
- API 엔드포인트 있으면 docs/API.md 별도 생성 후 링크

### 라이선스 (LICENSE 파일 감지 시)
포함 조건: LICENSE, LICENSE.md 파일 존재
내용:
- 라이선스 종류 명시

### 기여 방법 (CONTRIBUTING.md 감지 시)
포함 조건: CONTRIBUTING.md 파일 존재
내용:
- 해당 파일로 링크

### Docker (Docker 설정 감지 시)
포함 조건: Dockerfile, docker-compose.yml 존재
내용:
- 빠른 시작 섹션에 Docker 실행 방식 추가

### 한계점 (한계가 있을 때)
포함 조건: localhost 전용, 테스트 미작성, 영속성 없음 등 스캔에서 판단
내용:
- 현재 한계 목록

### 향후 계획 (예정된 작업이 있을 때)
포함 조건: Phase 문서에서 미완료 항목 감지, 또는 사용자가 요청
내용:
- 예정된 기능/개선 목록

---

## 제외 항목 (README에 넣지 않음)

| 항목 | 대체 |
|------|------|
| API 엔드포인트 상세 | docs/API.md로 분리, README에는 링크만 |
| 실무 적용 시 추가 필요 | 제외 (실무 프로젝트만 대상) |

---

## 프로젝트 유형 판별 기준

| 유형 | 감지 기준 |
|------|-----------|
| web | React, Vue, Angular, Next.js, FastAPI, Express, Django, Flask 등 |
| cli | bin 필드, argparse, commander, click, typer 등 |
| library | main/exports 필드, setup.py, pyproject.toml 배포 설정 |
| ai | openai, langchain, anthropic, google-genai, transformers, torch |
| automation | schedule, cron, celery, airflow, 파이프라인 패턴 |
| data | pandas, spark, ETL 패턴, 데이터 처리 스크립트 |

하나의 프로젝트에 복수 태그 가능 (예: web + ai)

---

## 스캔 대상 파일

| 파일/패턴 | 수집 정보 |
|-----------|-----------|
| package.json | 언어, 의존성, scripts, bin, main/exports |
| requirements.txt, Pipfile, pyproject.toml | Python 의존성 |
| go.mod, Cargo.toml, build.gradle | 기타 언어 의존성 |
| Dockerfile, docker-compose.yml | 컨테이너 환경 |
| .env.example, .env | 환경변수 목록 |
| LICENSE, LICENSE.md | 라이선스 종류 |
| CONTRIBUTING.md | 기여 가이드 존재 여부 |
| test/, __tests__/, *_test.*, *.spec.* | 테스트 존재 여부 |
| docs/ | 별도 문서 존재 여부 |
| src/, lib/, app/, backend/, frontend/ | 프로젝트 구조 |

---

## 작성 원칙

| 원칙 | 적용 |
|------|------|
| 간결 우선 | README 본문은 핵심만, 상세는 docs/로 분리 |
| 사실 기반 | 실제 파일에서 확인된 정보만 기술 |
| 과장 금지 | 마케팅 문구 배제 ("혁신적", "강력한", "최첨단" 등 사용 금지) |
| 동적 구성 | 프로젝트에 없는 요소의 섹션은 생성하지 않음 |
| 명령어 검증 | 의존성 파일, scripts 등에서 확인된 명령어만 기재 |
| 파일명 규칙 | 공백 대신 언더스코어 사용 |
| 이중 언어 | README.md(영어) + README_ko.md(한국어) 동시 생성 |
