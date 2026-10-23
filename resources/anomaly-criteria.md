# 이상 판단 기준 / Anomaly criteria

Version: normal-rules-v1

시간대별 관측 구간에 적용합니다. 미입력·계획 정지는 이상 점수에서 제외하며, 원인을 확정하는 기준이 아닙니다.
Applied per observed hourly slot. Missing data and planned stops are excluded; flags are not causal diagnoses.

| Line | Achievement below | Severe below | Defect rate above | Severe above | Downtime above (min) | Severe above (min) |
|---|---|---|---|---|---|---|
| L1 | 0.86 | 0.66 | 0.04140 | 0.08280 | 10 | 30 |
| L2 | 0.86 | 0.66 | 0.04600 | 0.09200 | 10 | 30 |
| L3 | 0.86 | 0.66 | 0.05060 | 0.10120 | 10 | 30 |
| L4 | 0.86 | 0.66 | 0.03910 | 0.07820 | 10 | 30 |
| L5 | 0.86 | 0.66 | 0.03450 | 0.06900 | 10 | 30 |
| L6 | 0.86 | 0.66 | 0.04370 | 0.08740 | 10 | 30 |

정상 설정: 최소 성능 0.96, 정상 순간 정지 최대 5분, 라인별 기준 불량률 × 최대 배수 1.15. 여유 기준: 달성률 −0.10/−0.30, 불량률 ×2/×4, 정지 시간 ×2/×6. 비율은 0~1 단위이며 경계값과 같으면 상위 등급으로 올리지 않습니다.
Derived from normal rules with fixed margins: achievement −0.10/−0.30, defect rate ×2/×4, downtime ×2/×6. Ratios use 0–1 units; comparisons are strict.
