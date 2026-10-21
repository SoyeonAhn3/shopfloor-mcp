---
name: phase-doc
type: general
version: 1.0
description: 각 Phase의 상세 개발 내용을 Phase/ 디렉토리에 문서로 기록하고 갱신한다. "Phase 문서 업데이트해줘", "Phase N 상세 기록해줘", "개발 내용 문서화해줘", "Phase 완료 기록해줘" 등의 요청 시 트리거한다.
required_environment:
  - Python 3.8+
depends_on:
  - dev-log
produces:
  - Phase/PhaseN_[EnglishName].md (신규 생성 또는 갱신)
  - logs/dev_YYYYMMDD.jsonl (변경 이력 기록)
---

# Phase Doc Skill

각 Phase의 상세 개발 내용(목적, 구현 상세, 설계 결정, 사용 예시)을 `Phase/` 디렉토리에 문서로 기록하고 갱신한다.

---

## 사전 조건

- `Phase/` 디렉토리 존재 여부 확인 (없으면 생성)
- 대상 Phase 번호와 업데이트 내용 파악
- 기존 Phase 문서가 있으면 Read 도구로 먼저 읽기

---

## STEP 1 — 현재 상태 파악

아래 파일들을 Read / Glob 도구로 확인한다:

```
Phase/PhaseN_*.md       — 기존 문서 확인 (파일명은 영어로 작성)
src/modules/            — 구현된 Python 모듈 확인
.claude/skills/         — 등록된 스킬 확인
README.md               — 전체 Phase 계획 확인
```

업데이트 유형을 아래 중 하나로 분류한다:

| 유형 | 해당 상황 |
|---|---|
| 신규 생성 | Phase 문서가 없음 |
| 완료 항목 추가 | 새 스킬/모듈 개발 완료 시 |
| 설계 변경 | 구현 방향이 바뀐 경우 |
| 상태 변경만 | 미시작 → 진행 중 → 완료 상태 전환 |
| 전체 갱신 | Phase 전체 재검토 |

---

## STEP 2 — 문서 작성 / 갱신

### 2-A. 신규 생성

```
Read("references/phase-template.md")
```
→ 표준 구조 로드 후 Write 도구로 `Phase/PhaseN_[EnglishName].md` 생성

### 2-B. 기존 문서 갱신

Edit 도구로 변경된 부분만 수정한다. 전체 재작성 금지.
**중요: 영어 섹션과 한국어 섹션을 반드시 동시에 갱신하여 내용을 동기화한다.**

**자주 갱신하는 패턴:**

```
# 상태 변경 (영어/한국어 섹션 모두)
"🔲 Not Started" → "🚧 In Progress" → "✅ Completed"
"🔲 미시작" → "🚧 진행 중" → "✅ 완료"

# 완료 항목 추가
완료 예정 항목 테이블의 상태 컬럼 업데이트 (양쪽 언어 섹션)
구현 상세 섹션 추가

# 설계 결정 기록
"Design Decisions" / "설계 결정 사항" 섹션에 항목 추가

# 변경 이력 추가
Change Log / 변경 이력 테이블 하단에 행 추가
```

---

## STEP 3 — README.md 구조에 Phase 디렉토리 반영

Phase 문서 신규 생성 시 README.md의 프로젝트 구조 트리에 반영한다:

```
├── Phase/
│   ├── Phase1_Foundation.md          # ✅ 완료
│   ├── Phase2_CoreEngine.md          # 🔲 미시작
│   ├── Phase3_OutputGeneration.md    # 🔲 미시작
│   └── Phase4_QualityAssurance.md    # 🔲 미시작
```

---

## STEP 4 — dev-log에 변경 이력 기록

문서 작성/갱신 후 dev-log 스킬로 기록:

```
[dev-log에 기록할 내용]
event_type : CHANGE
module     : PhaseDoc
message    : Phase N 문서 [신규 생성 | 갱신]
before     : [변경 전 상태 요약]
after      : [변경 후 상태 요약]
reason     : [변경 이유]
```

---

## STEP 5 — 완료 보고

갱신된 내용을 아래 형식으로 보고한다:

```
[phase-doc] 완료
- 대상 파일: Phase/PhaseN_[EnglishName].md
- 작업 유형: [신규 생성 | 상태 변경 | 완료 항목 추가 | 설계 변경 | 전체 갱신]
- 변경 내용: [한 줄 요약]
- dev-log 기록: ✅
```

---

## 출력 형식

### 파일 경로 규칙

파일명은 반드시 **영어 PascalCase**로 작성한다. 한국어 파일명 사용 금지.

```
Phase/Phase1_Foundation.md
Phase/Phase2_CoreEngine.md
Phase/Phase3_OutputGeneration.md
Phase/Phase4_QualityAssurance.md
```

### 상태 표기 규칙

```
✅ 완료       — Phase 내 모든 항목 완료
🚧 진행 중    — Phase 내 일부 완료, 일부 미시작
🔲 미시작     — Phase 내 전체 미시작
⏸ 보류       — 일정 미정
```

---

## 실패 처리

| 실패 유형 | 처리 방법 |
|---|---|
| `Phase/` 디렉토리 없음 | Bash 도구로 mkdir 후 재시도 |
| 파일 I/O 실패 (읽기) | 경로 재확인 요청 후 중단 |
| 파일 I/O 실패 (쓰기) | `logs/error_YYYYMMDD.jsonl`에 기록 후 중단 |
| dev-log 스킬 기록 실패 | 문서 작업은 완료 처리, dev-log 기록 스킵 후 사용자 알림 |
| 기존 문서 Edit 실패 (old_string 미발견) | 해당 섹션을 다시 Read 후 정확한 문자열로 재시도 |

---

## 주의사항

- 기존 문서가 있으면 반드시 Read 먼저 — Edit은 읽은 후에만 가능
- 전체 재작성 대신 변경된 부분만 Edit 도구로 수정할 것
- 스킬/모듈의 실제 구현 내용을 반영할 것 (설계 예정 내용과 구분)
- 완료 항목 기록 시 Python 소스 코드의 실제 클래스/함수명을 정확히 기재
- `변경 이력` 섹션은 항상 최신 날짜순(하단 추가)으로 유지
- **문서는 상단 영어 → `---` 구분선 → 하단 한국어 이중 언어 구조를 유지한다**
- **갱신 시 영어/한국어 양쪽 섹션을 반드시 동시에 수정하여 내용 동기화를 유지한다**
