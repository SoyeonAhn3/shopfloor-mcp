# Phase 5 evaluation results / 평가 결과

자동 검사는 잠정 결과입니다. 최종 정답률은 모든 사람 검수가 완료되어야 표시됩니다. 비용은 저장된 토큰 사용량과 단가로 계산한 추정치입니다.

| 실행 | 세트 / 도구 | 완료 / 기록 | 자동 실패 | 검수 대기 | 예상 비용 (USD) |
|---|---|---:|---:|---:|---:|
| [20261023T072410401Z-dev-coarse-b16341e5](runs/20261023T072410401Z-dev-coarse-b16341e5/manifest.json) | dev / coarse | 1 / 1 | 0 | 1 | 0.034092 |
| [20261023T072444168Z-dev-coarse-b21ab9fc](runs/20261023T072444168Z-dev-coarse-b21ab9fc/manifest.json) | dev / coarse | 10 / 10 | 1 | 10 | 0.464738 |
| [20261023T072759542Z-dev-coarse-5f9cf680](runs/20261023T072759542Z-dev-coarse-5f9cf680/manifest.json) | dev / coarse | 10 / 10 | 2 | 10 | 0.598226 |
| [20261023T073057831Z-dev-coarse-db939b2a](runs/20261023T073057831Z-dev-coarse-db939b2a/manifest.json) | dev / coarse | 10 / 10 | 0 | 10 | 0.570350 |
| [20261023T073452530Z-dev-fine-78a67952](runs/20261023T073452530Z-dev-fine-78a67952/manifest.json) | dev / fine | 10 / 10 | 0 | 10 | 1.063598 |
| [20261023T073705712Z-eval-coarse-845d6c72](runs/20261023T073705712Z-eval-coarse-845d6c72/manifest.json) | eval / coarse | 30 / 30 | 1 | 0 | 1.921032 |
| [20261023T073937732Z-eval-fine-23f3d69f](runs/20261023T073937732Z-eval-fine-23f3d69f/manifest.json) | eval / fine | 30 / 30 | 2 | 0 | 3.525696 |

## Same-condition comparisons / 같은 조건의 비교

- 모델: claude-sonnet-5-5; 반복: 1; 사람 검수 완료: true

| 도구 구성 | 실행 완료 | 자동 실패 | 평균 도구 호출 | 평균 시간 (초) | 최종 정답률 |
|---|---:|---:|---:|---:|---|
| coarse | 30/30 | 1 | 1.60 | 9.88 | 93.3% |
| fine | 30/30 | 2 | 1.97 | 10.32 | 86.7% |

검수 파일: [coarse](reviews/20261023T073705712Z-eval-coarse-845d6c72/) · [fine](reviews/20261023T073937732Z-eval-fine-23f3d69f/)

## Reading an individual result / 개별 결과 확인

`eval/reviews/<runId>/S01-r1.md`에서 질문, 도구 입력, 서버 응답, 최종 답변, 독립 정답과 자동 검사를 함께 확인합니다.
같은 이름의 JSON에 검수자·시각·각 검사 판정·최종 판정·메모를 작성한 뒤 `npm run eval:summary`를 실행합니다.
실패한 자동 검사를 사람이 통과로 바꾸려면 해당 검사에 이유를 기록해야 합니다. 이전 기록이 바뀌면 검수 해시 검사가 거절합니다.
