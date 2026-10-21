# Dev Log 스키마 정의

## 파일 경로 규칙

```
logs/dev_YYYYMMDD.jsonl
```

- 날짜는 로컬 시각 기준 (예: 2026-03-09 → `dev_20260309.jsonl`)
- `logs/` 디렉토리가 없으면 Bash로 `mkdir -p logs` 실행
- 파일이 없으면 Write로 신규 생성, 있으면 Edit으로 마지막 줄 뒤에 추가

---

## JSONL 엔트리 구조

각 라인은 JSON 객체 1개. 필드 순서는 아래를 따를 것.

```json
{
  "timestamp": "2026-03-09T10:32:01+00:00",
  "session_id": "a1b2c3d4",
  "module": "MSGraphConnector",
  "event_type": "ERROR",
  "message": "OAuth 토큰 만료",
  "data": { "error_code": 401 }
}
```

| 필드 | 타입 | 규칙 |
|---|---|---|
| `timestamp` | string | ISO 8601 형식. 현재 시각 기준 |
| `session_id` | string | 대화 세션 식별자. 한 대화 내에서 동일값 유지 (8자리 hex 권장) |
| `module` | string | 기록 주체. 스킬명 또는 모듈명 (예: "InputParser", "ai-score-compare") |
| `event_type` | string | `ERROR` / `CHANGE` / `INFO` 중 하나만 사용 |
| `message` | string | 한 줄 요약. 50자 이내 권장 |
| `data` | object | 이벤트 타입별 추가 데이터 (아래 참고) |

---

## 이벤트 타입별 규칙

### ERROR — 에러 발생 기록

언제: 예상치 못한 실패, 외부 API 오류, 모듈 실행 중단 시

`data` 필드:
```json
{
  "error_code": 401,
  "reason": "액세스 토큰 만료",
  "input": "(선택) 실패한 입력값"
}
```

예시:
```jsonl
{"timestamp":"2026-03-09T10:32:01+00:00","session_id":"a1b2c3d4","module":"MSGraphConnector","event_type":"ERROR","message":"OAuth 토큰 만료","data":{"error_code":401,"reason":"액세스 토큰 만료"}}
```

---

### CHANGE — 수정 이유 및 변경 내역 기록

언제: 설계 변경, 가중치 수정, 구현 방향 전환 등 의도적 변경 시

`data` 필드 (before / after / reason 필수):
```json
{
  "before": "변경 전 상태 설명",
  "after": "변경 후 상태 설명",
  "reason": "변경 이유"
}
```

예시:
```jsonl
{"timestamp":"2026-03-09T11:15:00+00:00","session_id":"a1b2c3d4","module":"RecommendationEngine","event_type":"CHANGE","message":"가중치 합산 오류 수정","data":{"before":"적합성 40% (합계 105%)","after":"적합성 35% (합계 100%)","reason":"AI 3자 검토에서 합산 오류 발견"}}
```

---

### INFO — 일반 실행 흐름 기록

언제: 스킬 실행 완료, 중간 처리 결과, 참고용 메모

`data` 필드: 자유 형식 (key-value 제한 없음)

예시:
```jsonl
{"timestamp":"2026-03-09T11:20:00+00:00","session_id":"a1b2c3d4","module":"InputParser","event_type":"INFO","message":"요구사항 파싱 완료","data":{"domain":"구매/조달","targets_count":2,"confidence":0.85}}
```

---

## 조회 출력 포맷

`view` 요청 시 아래 형식으로 출력:

```
[2026-03-09 10:32:01] [SESSION:a1b2c3d4] [ERROR] MSGraphConnector
  메시지: OAuth 토큰 만료
  데이터: {"error_code": 401, "reason": "액세스 토큰 만료"}

[2026-03-09 11:15:00] [SESSION:a1b2c3d4] [CHANGE] RecommendationEngine
  메시지: 가중치 합산 오류 수정
  데이터: {"before": "적합성 40%", "after": "적합성 35%", "reason": "AI 3자 검토에서 합산 오류 발견"}

─── 총 2건 | 날짜: 20260309 ───
```

---

## 요약 출력 포맷

`summary` 요청 시:

```
=== Dev Log 요약 [20260309] ===
  ERROR   : 1건
  CHANGE  : 1건
  INFO    : 3건
  합계    : 5건
```

---

## 주의사항

- 민감 정보(토큰 값, 비밀번호, 개인정보)는 `data`에 포함하지 말 것
- `logs/` 디렉토리는 `.gitignore`에 추가되어야 함
- JSONL 특성상 각 줄이 독립된 JSON — 줄바꿈 없이 한 줄로 기록
- `session_id`는 한 대화 세션 내에서 동일값 유지 (스킬 재호출 시에도 변경하지 말 것)
