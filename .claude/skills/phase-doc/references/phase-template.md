# Phase 문서 신규 생성 템플릿
# 유형 = "신규 생성" 판정 시 로드

Write 도구로 `Phase/PhaseN_[EnglishName].md`를 아래 표준 구조로 생성한다.
파일명은 반드시 영어 PascalCase로 작성한다. (예: Phase1_Foundation.md, Phase2_CoreEngine.md)

**문서 구조**: 상단 영어(English) → 구분선 → 하단 한국어(Korean) 순서로 배치한다.
영어/한국어 섹션은 동일한 내용을 각 언어로 작성하며, 반드시 동기화를 유지한다.

---

```markdown
# Phase N — [Phase Name] `[Status]`

> [One-line description of this phase]

**Completed**: YYYY-MM-DD  (only when completed)
**Status**: ✅ Completed | 🚧 In Progress | 🔲 Not Started
**Prerequisites**: Phase N-1 completion status

---

## Overview

[2-4 line description of what this Phase achieves]

---

## Deliverables

| # | Skill / Module | Status | Skill Type |
|---|---|---|---|
| N | `skill-name` | ✅/🔲 | general/project-specific |

---

## [Skill/Module Name]

### Purpose
### Implementation Files
### Core Classes / Structure (code block)
### Design Decisions
### Usage Examples

---

## Phase N Skill Classification

| Skill | Classification | Reason |
|---|---|---|

---

## Prerequisites & Dependencies

---

## Development Notes

---

## Change Log

| Date | Description |
|---|---|
| YYYY-MM-DD | Initial creation |

---
---

# Phase N — [Phase 이름] `[상태]`

> [Phase 한 줄 설명]

**완료일**: YYYY-MM-DD  (완료 시에만)
**상태**: ✅ 완료 | 🚧 진행 중 | 🔲 미시작
**선행 조건**: Phase N-1 완료 여부

---

## 개요

[이 Phase가 무엇을 달성하는지 2~4줄 설명]

---

## 완료 예정 / 완료 항목

| # | Skill / 모듈 | 상태 | 스킬 타입 |
|---|---|---|---|
| N | `skill-name` | ✅/🔲 | general/project-specific |

---

## [스킬/모듈명]

### 목적
### 구현 파일
### 핵심 클래스 / 구조 (코드 블록)
### 설계 결정 사항
### 사용 예시

---

## Phase N 스킬 범용/전용 분류

| 스킬 | 분류 | 이유 |
|---|---|---|

---

## 선행 조건 및 의존성

---

## 개발 시 주의사항

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| YYYY-MM-DD | 최초 작성 |
```
