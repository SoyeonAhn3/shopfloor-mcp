import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { recordSchema, type RunRecord } from './record.js';
import { validateReview, type Review } from './review.js';
import { manifestSchema } from './runner.js';
import { SCENARIO_TYPES } from './scenario.js';

export function readRun(directory: string) {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')));
  const records = manifest.recordFiles.map(file => recordSchema.parse(JSON.parse(readFileSync(join(directory, file), 'utf8'))));
  const keys = records.map(r => r.scenarioId + ':' + r.repetition);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate scenario/repetition records');
  for (const record of records) {
    if (record.runId !== manifest.runId || record.model !== manifest.model || record.set !== manifest.set
      || record.toolset !== manifest.toolset || record.scenarioSetHash !== manifest.scenarioSetHash
      || record.descriptionsHash !== manifest.descriptionsHash || record.policyHash !== manifest.policyHash
      || record.datasetVersion !== manifest.datasetVersion || !manifest.selectedIds.includes(record.scenarioId)
      || record.repetition > manifest.repeat) throw new Error('Record and manifest conditions disagree');
  }
  return { manifest, records };
}
function stats(records: RunRecord[], reviews: Map<string, Review>, completeCoverage = true) {
  const reviewed = records.map(r => reviews.get(r.runId + '/' + r.scenarioId + '-r' + r.repetition));
  const completedReviews = reviewed.filter(r => r && r.verdict !== 'pending');
  const passed = completedReviews.filter(r => r?.verdict === 'pass').length;
  const count = records.length, total = (key: keyof RunRecord['usage']) => records.reduce((n, r) => n + r.usage[key], 0);
  return { count, executionsCompleted: records.filter(r => r.outcome === 'completed').length,
    automaticFailures: records.filter(r => r.grade.autoVerdict === 'fail').length,
    automaticNeedsReview: records.filter(r => r.grade.autoVerdict === 'needs_review').length,
    noAutomaticFailureRate: count ? records.filter(r => r.grade.autoVerdict !== 'fail' && r.outcome === 'completed').length / count : null,
    reviewed: completedReviews.length, reviewPending: count - completedReviews.length, reviewedPasses: passed,
    reviewedPassRate: completedReviews.length ? passed / completedReviews.length : null,
    finalPassRate: completeCoverage && count && completedReviews.length === count ? passed / count : null,
    forbiddenActionFailures: records.reduce((n, r) => n + r.grade.checks.filter(c => c.id.includes('forbidden:') && c.status === 'fail').length, 0),
    inputTokens: total('inputTokens'), outputTokens: total('outputTokens'), estimatedCostUsd: total('estimatedCostUsd'),
    meanToolCalls: count ? total('toolCalls') / count : 0, meanMs: count ? total('ms') / count : 0 };
}
export function buildSummary(root: string) {
  const runsRoot = join(root, 'eval/runs');
  const runs = existsSync(runsRoot) ? readdirSync(runsRoot, { withFileTypes: true }).filter(e => e.isDirectory())
    .map(e => readRun(join(runsRoot, e.name))) : [];
  const reviews = new Map<string, Review>();
  for (const { records } of runs) for (const record of records) {
    const id = record.runId + '/' + record.scenarioId + '-r' + record.repetition;
    const path = join(root, 'eval/reviews', id + '.json');
    if (existsSync(path)) reviews.set(id, validateReview(record, JSON.parse(readFileSync(path, 'utf8'))));
  }
  const summaries = runs.map(({ manifest, records }) => {
    const coverageComplete = manifest.status === 'completed' && records.length === manifest.selectedIds.length * manifest.repeat;
    return { ...manifest, ...stats(records, reviews, coverageComplete),
    coverageComplete,
    fullEvaluationSet: manifest.set === 'eval' && manifest.selectedIds.length === 30,
    byType: Object.fromEntries(SCENARIO_TYPES.map(type => [type, stats(records.filter(r => r.type === type), reviews, coverageComplete)])),
    repetitions: Array.from({ length: manifest.repeat }, (_, index) => ({ repetition: index + 1,
      ...stats(records.filter(r => r.repetition === index + 1), reviews,
        records.filter(r => r.repetition === index + 1).length === manifest.selectedIds.length) })),
  }; });
  const comparisons: { fineRun: string; coarseRun: string; conditionsMatch: true; humanReviewComplete: boolean }[] = [];
  for (const fine of runs.filter(r => r.manifest.toolset === 'fine')) for (const coarse of runs.filter(r => r.manifest.toolset === 'coarse')) {
    const a = fine.manifest, b = coarse.manifest;
    if (a.set !== 'eval' || b.set !== 'eval' || a.selectedIds.length !== 30 || b.selectedIds.length !== 30
      || a.status !== 'completed' || b.status !== 'completed' || fine.records.length !== 30 * a.repeat || coarse.records.length !== 30 * b.repeat) continue;
    const same = ['model', 'scenarioSetHash', 'datasetVersion', 'descriptionsHash', 'policyHash', 'repeat'].every(k => a[k as keyof typeof a] === b[k as keyof typeof b]);
    const conditions = (r: RunRecord) => JSON.stringify({ limits: r.limits, pricing: r.pricing, graderHash: r.graderHash });
    if (!same || new Set([...fine.records, ...coarse.records].map(conditions)).size !== 1) continue;
    comparisons.push({ fineRun: a.runId, coarseRun: b.runId, conditionsMatch: true,
      humanReviewComplete: [...fine.records, ...coarse.records].every(r => {
        const review = reviews.get(r.runId + '/' + r.scenarioId + '-r' + r.repetition);
        return review && review.verdict !== 'pending';
      }) });
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), note: 'Automatic checks are provisional. Final accuracy requires all human reviews. Costs are token-rate estimates.', runs: summaries, comparisons };
}

export function summaryMarkdown(summary: ReturnType<typeof buildSummary>): string {
  const lines = ['# Phase 5 evaluation results / 평가 결과', '',
    '자동 검사는 잠정 결과입니다. 최종 정답률은 모든 사람 검수가 완료되어야 표시됩니다. 비용은 저장된 토큰 사용량과 단가로 계산한 추정치입니다.', '',
    '| 실행 | 세트 / 도구 | 완료 / 기록 | 자동 실패 | 검수 대기 | 예상 비용 (USD) |',
    '|---|---|---:|---:|---:|---:|'];
  for (const run of summary.runs) lines.push(`| [${run.runId}](runs/${run.runId}/manifest.json) | ${run.set} / ${run.toolset} | ${run.executionsCompleted} / ${run.count} | ${run.automaticFailures} | ${run.reviewPending} | ${run.estimatedCostUsd.toFixed(6)} |`);
  lines.push('', '## Same-condition comparisons / 같은 조건의 비교', '');
  if (!summary.comparisons.length) lines.push('아직 동일 조건의 전체 평가 세트 두 실행이 없습니다.');
  for (const comparison of summary.comparisons) {
    const fine = summary.runs.find(r => r.runId === comparison.fineRun)!, coarse = summary.runs.find(r => r.runId === comparison.coarseRun)!;
    lines.push(`- 모델: ${fine.model}; 반복: ${fine.repeat}; 사람 검수 완료: ${comparison.humanReviewComplete}`, '',
      '| 도구 구성 | 실행 완료 | 자동 실패 | 평균 도구 호출 | 평균 시간 (초) | 최종 정답률 |', '|---|---:|---:|---:|---:|---|',
      ...[coarse, fine].map(r => `| ${r.toolset} | ${r.executionsCompleted}/${r.count} | ${r.automaticFailures} | ${r.meanToolCalls.toFixed(2)} | ${(r.meanMs / 1000).toFixed(2)} | ${r.finalPassRate === null ? '검수 대기' : (r.finalPassRate * 100).toFixed(1) + '%'} |`), '',
      `검수 파일: [coarse](reviews/${coarse.runId}/) · [fine](reviews/${fine.runId}/)`, '');
  }
  lines.push('## Reading an individual result / 개별 결과 확인', '',
    '`eval/reviews/<runId>/S01-r1.md`에서 질문, 도구 입력, 서버 응답, 최종 답변, 독립 정답과 자동 검사를 함께 확인합니다.',
    '같은 이름의 JSON에 검수자·시각·각 검사 판정·최종 판정·메모를 작성한 뒤 `npm run eval:summary`를 실행합니다.',
    '실패한 자동 검사를 사람이 통과로 바꾸려면 해당 검사에 이유를 기록해야 합니다. 이전 기록이 바뀌면 검수 해시 검사가 거절합니다.', '');
  return lines.join('\n');
}
