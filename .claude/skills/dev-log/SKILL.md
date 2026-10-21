---
name: dev-log
version: 1.1
description: MS 업무자동화 CLI 에이전트 개발 중 발생하는 에러, 수정 이유, 변경 내역을 JSONL 형식으로 기록하고 조회한다. "로그 남겨줘", "변경 이유 기록해줘", "에러 기록해줘", "로그 조회해줘" 등의 요청 시 트리거한다.
depends_on: []
produces:
  - logs/dev_YYYYMMDD.jsonl
---

# Dev Log Manager Skill

개발 이력(ERROR / CHANGE / INFO)을 JSONL 파일에 직접 기록하고 조회한다.
스키마 및 포맷 상세는 `references/schema.md`를 참고한다.

---

## STEP 1 — 스키마 로드

기록 또는 조회 전 반드시 먼저 실행:

```
Read(".claude/skills/dev-log/references/schema.md")
```

→ 필드 정의, 이벤트 타입별 data 구조, 출력 포맷 확인

---

## STEP 2 — 기록

1. 오늘 날짜 기준 파일 경로 결정: `logs/dev_YYYYMMDD.jsonl`
2. `logs/` 디렉토리 없으면 Bash로 생성: `mkdir -p logs`
3. 파일이 없으면 Write 도구로 신규 생성, 있으면 Edit 도구로 마지막 줄 뒤에 추가
4. 사용자 요청에서 아래 항목 파악 후 schema.md 형식에 맞게 JSON 한 줄 작성:

| 항목 | 파악 방법 |
|---|---|
| `module` | 어떤 스킬/모듈에서 발생했는지 |
| `event_type` | ERROR(예상치 못한 실패) / CHANGE(의도적 변경) / INFO(일반 메모) |
| `message` | 한 줄 요약 (50자 이내) |
| `data` | 이벤트 타입별 추가 정보 (schema.md 참고) |

### 이벤트 타입 판단 기준

```
에러가 발생했다          → ERROR
원인 파악 후 수정했다    → ERROR 기록 후 CHANGE 추가 기록
설계/구현 방향을 바꿨다  → CHANGE
완료/진행 상황 메모      → INFO
```

---

## STEP 3 — 조회

1. 해당 날짜 JSONL 파일 Read
2. 요청된 필터 적용 (event_type / module / 날짜)
3. schema.md의 출력 포맷에 맞게 표시
4. 요약 요청이면 타입별 건수 집계 후 요약 포맷으로 출력

---

## 실패 처리

| 실패 유형 | 처리 방법 |
|---|---|
| `logs/` 디렉토리 없음 | Bash로 `mkdir -p logs` 후 재시도 |
| 파일 읽기 실패 | 경로 재확인 후 사용자에게 알림 |
| 파일 쓰기 실패 | 사용자에게 실패 내용 직접 출력 후 중단 |
| schema.md 로드 실패 | schema.md 경로 확인 요청 후 중단 |

---

## 주의사항

- `logs/` 디렉토리는 `.gitignore`에 추가
- 민감 정보(토큰 값, 비밀번호, 개인정보)는 `data`에 포함하지 말 것
- JSONL 특성상 JSON 한 줄로 기록 — 줄바꿈 없이 작성
- `session_id`는 한 대화 내에서 동일값 유지
