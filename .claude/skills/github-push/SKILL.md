---
name: github-push
version: 1.2
description: 프로젝트를 GitHub에 커밋하고 푸시한다. git 미초기화 시 init + remote 설정부터 진행. 변경 내용을 분석해 커밋 메시지 초안을 자동 생성하고 사용자 확인 후 push한다. push 완료 시 dev-log로 커밋 이력을 자동 기록한다. "깃허브에 올려줘", "git push해줘", "변경사항 올려줘", "커밋해줘" 등의 요청 시 트리거한다.
depends_on:
  - dev-log
produces:
  - GitHub 원격 저장소 업데이트
  - logs/dev_YYYYMMDD.jsonl (커밋 이력 자동 기록)
---

# GitHub Push Skill

변경된 파일을 분석해 커밋 메시지 초안을 생성하고, 사용자 확인 후 GitHub에 푸시한다.
push 완료 후 dev-log 스킬을 호출하여 커밋 이력을 자동 기록한다.

---

## 전체 흐름

```
STEP 1: git 초기화 상태 확인
STEP 2: (미초기화 시) init + .gitignore 확인 + remote 설정
STEP 3: 변경사항 확인 (git status + git diff)
STEP 4: 커밋 메시지 초안 생성 → 사용자 확인
STEP 5: git add + commit + push
STEP 6: dev-log 자동 기록 (커밋 이력)
STEP 7: 완료 보고
```

---

## STEP 1 — git 초기화 상태 확인

```bash
git -C "." rev-parse --is-inside-work-tree 2>/dev/null && echo "initialized" || echo "not_initialized"
```

- `initialized` → STEP 3으로 바로 진행
- `not_initialized` → STEP 2 실행

---

## STEP 2 — 초기 설정 (최초 1회)

### 2-1. .gitignore 확인

```bash
ls .gitignore 2>/dev/null && echo "exists" || echo "missing"
```

없으면 아래 내용으로 자동 생성:

```
# 시크릿/환경변수 (절대 커밋 금지)
.env
.env.*
*.env
api.env
.claude/api.env

# 컨설팅 실행 데이터
logs/
archive/
output/

# 시스템 파일
.DS_Store
Thumbs.db
desktop.ini

# 에디터
.vscode/
*.swp
*.swo
```

기존 `.gitignore`가 있더라도 아래 항목이 누락된 경우 자동으로 추가한다:

```bash
# .env 관련 항목 누락 여부 확인 후 추가
grep -q "api.env\|\.env" .gitignore || echo -e "\n# 시크릿\n.env\n.env.*\n*.env\napi.env\n.claude/api.env" >> .gitignore
```

### 2-2. git init

```bash
git init
git branch -M main
```

### 2-3. Remote URL 입력 요청

```
GitHub 저장소 URL을 입력해주세요.
(예: https://github.com/your-id/AI_Consulting.git)

URL:
```

입력받은 URL로 remote 설정:

```bash
git remote add origin [입력된 URL]
```

### 2-4. 인증 방식 안내

```
[인증 안내]
HTTPS 방식은 GitHub Personal Access Token(PAT)이 필요합니다.

PAT가 없다면:
  1. github.com → Settings → Developer settings
  2. Personal access tokens → Tokens (classic) → Generate new token
  3. 권한: repo 체크 → 생성 후 토큰 복사
  4. git push 시 비밀번호 자리에 토큰 입력

SSH 방식을 사용 중이면 별도 토큰 불필요.
```

→ 사용자 확인 후 STEP 3 진행

---

## STEP 3 — 변경사항 확인

```bash
git status --short
```

변경 없으면:
```
변경된 파일이 없습니다. push할 내용이 없습니다.
```
→ 종료

변경 있으면 목록 표시:
```
[변경된 파일]
M  .claude/skills/consult/SKILL.md
M  .claude/skills/ai-score-compare/SKILL.md
A  .claude/skills/archive/SKILL.md
M  README.md
...
```

변경된 파일 수가 5개 이상이면 diff 요약을 위해 추가 확인:
```bash
git diff --stat HEAD 2>/dev/null || git diff --stat
```

---

## STEP 4 — 커밋 메시지 초안 생성

변경된 파일 목록과 경로를 분석해 Claude가 커밋 메시지 초안을 작성한다.

### 초안 작성 규칙

```
[분석 기준]
- 변경된 스킬명, 버전, 주요 내용을 파일 경로에서 파악
- 신규 파일(A)과 수정 파일(M)을 구분
- 50자 이내 제목 + 필요 시 본문 (변경 내용 2~4줄)

[형식]
제목: [변경 범위] 핵심 내용 요약

본문 (선택):
- 변경 항목 1
- 변경 항목 2
```

### 초안 출력 및 사용자 확인

```
[커밋 메시지 초안]
──────────────────────────────────────
add archive skill and token optimization

- archive v1.0: 4주 보존 + CSV 요약 + Cold Storage
- ai-score-compare v3.2: 요약 출력 포맷 적용
- consult v1.3: Evidence Summary 압축 추가
- README v1.3 반영
──────────────────────────────────────

이 메시지로 커밋할까요?
1. 그대로 사용
2. 직접 수정 (수정할 내용을 입력해주세요)
```

사용자가 수정 내용을 입력하면 반영 후 재확인 없이 바로 진행.

---

## STEP 5 — add + commit + push

```bash
# 전체 스테이징 (.gitignore 제외 자동 적용)
git add .

# 커밋
git commit -m "[확정된 커밋 메시지]"

# 푸시
# 최초 push
git push -u origin main

# 이후 push
git push
```

push 중 인증 오류 발생 시:
```
[인증 오류]
GitHub 사용자명과 Personal Access Token을 입력해주세요.
  사용자명: github.com 로그인 ID
  비밀번호: PAT 토큰 (비밀번호 아님)

또는 SSH 키 설정을 확인해주세요.
```

push 전 원격 저장소에 기존 커밋이 있는 경우 (non-fast-forward):

```bash
# 원격 fetch 후 README 충돌 시 로컬 우선 적용
git fetch origin main
git merge origin/main --allow-unrelated-histories -X ours
# -X ours: 충돌 발생 시 로컬(ours) 파일을 자동 우선 적용 (README 포함 모든 충돌)
git push -u origin main
```

> **README 우선 규칙**: 원격에 README가 이미 존재해도 **로컬 README를 항상 우선** 적용한다. 별도 확인 없이 자동 처리.

---

## STEP 6 — dev-log 자동 기록

push 성공 직후, dev-log 스킬의 스키마(`references/schema.md`)를 참조하여 커밋 이력을 자동 기록한다.

### 6-1. 스키마 로드

```
Read(".claude/skills/dev-log/references/schema.md")
```

### 6-2. 기록 항목 구성

| 항목 | 값 |
|---|---|
| `module` | `"github-push"` |
| `event_type` | `"INFO"` |
| `message` | 커밋 메시지 제목 (50자 이내) |
| `data` | 아래 참고 |

`data` 필드:

```json
{
  "commit_hash": "[git log --format=%h -1 결과]",
  "branch": "[현재 브랜치명]",
  "remote": "[remote URL]",
  "files_changed": N,
  "commit_message": "[전체 커밋 메시지]"
}
```

### 6-3. JSONL 기록

1. 오늘 날짜 기준 파일 경로: `logs/dev_YYYYMMDD.jsonl`
2. `logs/dev/` 디렉토리 없으면 `mkdir -p logs`
3. 파일이 없으면 Write로 신규 생성, 있으면 Edit으로 마지막 줄 뒤에 추가

예시:
```jsonl
{"timestamp":"2026-04-28T14:30:00+09:00","session_id":"f1e2d3c4","module":"github-push","event_type":"INFO","message":"add archive skill and token optimization","data":{"commit_hash":"a1b2c3d","branch":"main","remote":"https://github.com/user/repo.git","files_changed":4,"commit_message":"add archive skill and token optimization"}}
```

### 6-4. 실패 시 처리

dev-log 기록 실패는 push 자체의 성공에 영향을 주지 않는다.
실패 시 STEP 7 완료 보고에 경고 메시지만 추가:

```
⚠ dev-log 기록 실패 — push는 정상 완료됨
```

---

## STEP 7 — 완료 보고

```
[GitHub Push 완료]

커밋: [커밋 메시지 제목]
브랜치: main
저장소: [remote URL]
변경 파일: N개

저장소 확인: [github.com URL]
```

---

## 실패 처리

| 실패 유형 | 처리 방법 |
|---|---|
| git 미설치 | "git이 설치되어 있지 않습니다. git-scm.com에서 설치 후 재실행해주세요." |
| remote URL 없음 | STEP 2-3으로 돌아가 URL 입력 요청 |
| 인증 실패 (403/401) | PAT 안내 메시지 출력 후 중단 |
| push rejected (non-fast-forward) | `git fetch origin main && git merge origin/main --allow-unrelated-histories -X ours` 후 재push |
| 변경사항 없음 | "커밋할 변경사항이 없습니다." 후 종료 |
| .gitignore 없음 | 자동 생성 후 진행 (STEP 2-1) |

---

## 주의사항

- `git push --force` 는 절대 실행하지 않는다 (히스토리 재작성이 필요한 경우만 `--force-with-lease` 허용)
- 커밋 메시지 사용자 확인 전 `git commit` 실행 금지
- `logs/`, `archive/`, `output/` 폴더는 .gitignore로 자동 제외됨
- Personal Access Token은 data 필드에 기록하지 말 것
- **`.env`, `*.env`, `api.env`, `.claude/api.env` 등 시크릿 파일은 절대 커밋하지 않는다** — `git add` 전 반드시 .gitignore 포함 여부 확인
- **README 충돌 시 로컬 우선** — `git merge -X ours`로 자동 처리, 사용자 확인 불필요

---

## 변경 이력

| 날짜 | 버전 | 내용 |
|---|---|---|
| 2026-03-10 | v1.0 | 최초 작성 — git init/push 통합, 커밋 메시지 자동 초안 + 사용자 확인 |
| 2026-03-11 | v1.1 | .env 시크릿 파일 자동 제외, README 충돌 시 로컬 우선(-X ours) 자동 처리 |
| 2026-04-28 | v1.2 | dev-log 스킬 조합 방식 연동 — push 완료 후 커밋 이력 자동 기록 (STEP 6 추가) |
