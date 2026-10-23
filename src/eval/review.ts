import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { assertPublishable, recordHash, type RunRecord } from './record.js';

export const reviewSchema = z.strictObject({
  schemaVersion: z.literal(1), runId: z.string(), scenarioId: z.string(), repetition: z.number().int().positive(),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewer: z.string().nullable(), reviewedAt: z.iso.datetime().nullable(),
  verdict: z.enum(['pending', 'pass', 'fail']), note: z.string(),
  checks: z.array(z.strictObject({ id: z.string(), verdict: z.enum(['pending', 'pass', 'fail']), note: z.string() })),
});
export type Review = z.infer<typeof reviewSchema>;
export function reviewTemplate(record: RunRecord): Review {
  return { schemaVersion: 1, runId: record.runId, scenarioId: record.scenarioId, repetition: record.repetition,
    recordHash: recordHash(record), reviewer: null, reviewedAt: null, verdict: 'pending', note: '',
    checks: record.grade.checks.map(c => ({ id: c.id, verdict: 'pending', note: '' })) };
}
export function validateReview(record: RunRecord, raw: unknown): Review {
  const review = reviewSchema.parse(raw);
  if (review.runId !== record.runId || review.scenarioId !== record.scenarioId || review.repetition !== record.repetition
    || review.recordHash !== recordHash(record)) throw new Error('Review does not match this exact record');
  const ids = review.checks.map(c => c.id), expected = record.grade.checks.map(c => c.id);
  if (new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error('Review must cover every check exactly once');
  }
  if (review.verdict !== 'pending') {
    if (!review.reviewer?.trim() || !review.reviewedAt || !review.note.trim() || review.checks.some(c => c.verdict === 'pending')) {
      throw new Error('Completed reviews require a reviewer, timestamp, note, and every check verdict');
    }
    if (review.verdict === 'pass' && (record.outcome !== 'completed' || record.privacyViolation || review.checks.some(c => c.verdict === 'fail'))) {
      throw new Error('An incomplete/private/failed record cannot be marked pass');
    }
    for (const check of review.checks) {
      if (check.verdict === 'pass' && record.grade.checks.find(c => c.id === check.id)?.status === 'fail' && !check.note.trim()) {
        throw new Error('Overriding an automatic failure requires a per-check explanation');
      }
    }
  }
  assertPublishable(review);
  return review;
}
export function reviewMarkdown(record: RunRecord): string {
  const lines = [`# ${record.scenarioId} — ${record.toolset} — ${record.model}`, '',
    `Run: ${record.runId}; repetition: ${record.repetition}; outcome: ${record.outcome}; automatic: ${record.grade.autoVerdict}`, '',
    'Human review is pending. Fill the adjacent JSON; automatic checks are not a human verdict.', '', '## Transcript', ''];
  for (const event of record.transcript) {
    if (event.kind === 'user' || event.kind === 'assistant') lines.push(`### ${event.turn}: ${event.kind}${event.kind === 'assistant' && event.final ? ' (final)' : ''}`, '', event.text, '');
    else if (event.kind === 'tool_call') lines.push(`### ${event.turn}: ${event.name}`, '', '```json', JSON.stringify({ input: event.input, output: event.output }, null, 2), '```', '');
  }
  lines.push('## Checks and independent expected values', '');
  for (const check of record.grade.checks) lines.push(`- [${check.status}] ${check.id}: ${check.detail}`,
    ...(check.expected === undefined ? [] : ['  Expected: ' + JSON.stringify(check.expected)]));
  lines.push('', '## DB changes', '', '```json', JSON.stringify(record.dbDiff, null, 2), '```', '');
  return lines.join('\n');
}
export function prepareReview(directory: string, record: RunRecord): void {
  mkdirSync(directory, { recursive: true });
  const stem = join(directory, record.scenarioId + '-r' + record.repetition);
  if (!existsSync(stem + '.json')) writeFileSync(stem + '.json', JSON.stringify(reviewTemplate(record), null, 2) + '\n', { flag: 'wx' });
  else validateReview(record, JSON.parse(readFileSync(stem + '.json', 'utf8')));
  if (!existsSync(stem + '.md')) writeFileSync(stem + '.md', reviewMarkdown(record), { flag: 'wx' });
}
