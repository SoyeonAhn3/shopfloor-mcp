import { has, num, t, when } from './i18n.js';
import { el, json, markdown, toolsetName, verdictBadge } from './render.js';
import { typeLabel } from './results.js';
import { TOOLSETS, type CheckView, type RecordView, type ScenarioDetail, type SiteIndex, type Step, type TurnView } from './types.js';

const label = (key: string) => has(key) ? t(key) : key.slice(key.indexOf('.') + 1);
export function checkLabel(id: string): string {
  const m = /^(?:checkpoint-(\d+):|final:)?(.*)$/.exec(id)!;
  const [kind = '', ...rest] = m[2]!.split(':'), arg = rest.join(':'), key = 'check.' + kind;
  if (!has(key)) return id;
  const value = kind === 'forbidden' ? label('action.' + arg) : kind === 'expected' ? label('expected.' + arg)
    : kind === 'semantic' ? String(Number(arg) + 1) : arg;
  return (m[1] ? t('check.at', { n: m[1] }) : '') + t(key, { arg: value });
}

function step(s: Step): HTMLElement {
  if (s.kind === 'message') return el('li', { class: 'step message' }, el('div', { class: 'muted small' }, t('message')), markdown(s.text));
  return el('li', { class: 'step' + (s.isError ? ' error' : '') },
    el('div', { class: 'step-head' },
      el('code', { class: 'tool-name' }, s.name + (s.mode ? `(mode=${s.mode})` : '')),
      s.evidenceId ? el('span', { class: 'evidence', title: t('evidence') }, s.evidenceId) : null,
      s.isError ? el('span', { class: 'badge fail' }, t('toolError')) : null,
      s.memo ? el('span', { class: 'badge memo' }, t('memo')) : null,
      el('span', { class: 'muted small' }, t('ms', { n: num(s.ms) }))),
    s.summary ? el('p', { class: 'summary' }, s.summary) : null,
    el('details', {}, el('summary', {}, t('raw')),
      el('h5', {}, t('input')), json(s.input),
      el('h5', {}, t('output')), s.omitted ? el('p', { class: 'muted small' }, t('omitted', { n: s.omitted })) : null, json(s.output)));
}
function turn(view: TurnView, multi: boolean): HTMLElement {
  return el('div', { class: 'turn' },
    multi ? el('p', { class: 'turn-question' }, el('strong', {}, t('turnQuestion', { n: view.turn })), ' ', view.question) : null,
    el('h4', {}, t('steps')),
    view.steps.length ? el('ol', { class: 'steps' }, view.steps.map(step)) : el('p', { class: 'muted' }, t('noTools')),
    el('h4', {}, t('answer')),
    view.answer ? el('div', { class: 'answer' }, markdown(view.answer, view.marks)) : el('p', { class: 'muted' }, t('noAnswer')),
    view.marks.length ? el('p', { class: 'muted small' }, el('mark', {}, '123'), ' ', t('marks')) : null);
}
// Run, privacy and answer-presence checks rarely matter to a reader once they pass, so they are folded away.
const ROUTINE = /^(execution|privacy|(final|checkpoint-\d+):answer)$/;
function checks(list: CheckView[]): HTMLElement[] {
  const routine = list.filter(c => ROUTINE.test(c.id) && c.auto === 'pass' && c.human === 'pass' && !c.note);
  const table = (rows: CheckView[]) => el('div', { class: 'scroll' }, el('table', { class: 'checks' },
    el('thead', {}, el('tr', {}, [t('colCheck'), t('colExpected'), t('colAuto'), t('colHuman')]
      .map(h => el('th', { scope: 'col' }, h)))),
    el('tbody', {}, rows.map(c => el('tr', { class: c.human === 'fail' ? 'failed' : '' },
      el('td', { title: c.detail }, checkLabel(c.id),
        c.id.startsWith('semantic:') ? el('div', { class: 'criterion' }, c.detail) : null,
        c.note ? el('div', { class: 'check-note' }, el('strong', {}, t('colNote') + ': '), c.note) : null),
      el('td', { class: 'expected' }, c.expected ?? '—'),
      el('td', {}, verdictBadge(c.auto, true)),
      el('td', {}, verdictBadge(c.human)))))));
  return [table(list.filter(c => !routine.includes(c))),
    ...(routine.length ? [el('details', {}, el('summary', {}, t('routine', { n: routine.length })), table(routine))] : [])];
}
function card(r: RecordView): HTMLElement {
  const { issues } = r.dbDiff, u = r.usage;
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, toolsetName(r.toolset)), verdictBadge(r.review.verdict)),
    r.turns.map(v => turn(v, r.turns.length > 1)),
    el('h4', {}, t('checks')), checks(r.checks),
    el('h4', {}, t('reviewHeading')),
    el('div', { class: 'review' },
      el('p', {}, verdictBadge(r.review.verdict), ' ', el('span', { class: 'muted small' },
        r.review.reviewer && r.review.reviewedAt ? t('reviewedBy', { name: r.review.reviewer, time: when(r.review.reviewedAt) }) : '')),
      r.review.note ? [el('h5', {}, t('reviewNote')), el('p', { class: 'note-text' }, r.review.note)] : el('p', { class: 'muted small' }, t('noNote'))),
    el('dl', { class: 'facts' },
      el('dt', {}, t('dbChanges')), el('dd', {}, t('dbValue', { added: issues.added, updated: issues.updated, deleted: issues.deleted,
        drafts: r.dbDiff.draftsCreated, audit: r.dbDiff.auditRows })),
      el('dt', {}, t('usage')), el('dd', {}, t('usageValue', { models: u.modelCalls, tools: u.toolCalls, input: num(u.inputTokens),
        output: num(u.outputTokens), seconds: num(u.ms / 1000, 1), cost: num(u.estimatedCostUsd, 3) })),
      el('dt', {}, t('outcome')), el('dd', {}, r.outcome + (r.error ? ` (${r.error})` : ''))),
    el('p', { class: 'links' }, el('a', { href: r.recordUrl }, t('fullRecord')), ' · ', el('a', { href: r.reviewUrl }, t('reviewFile'))));
}

export function scenario(index: SiteIndex, detail: ScenarioDetail): HTMLElement {
  const ids = index.scenarios.map(s => s.scenarioId), at = ids.indexOf(detail.scenarioId);
  const prev = ids[at - 1], next = ids[at + 1];
  const questions = detail.records.coarse.turns.map(v => v.question);
  return el('section', { class: 'view' },
    el('nav', { class: 'pager', 'aria-label': detail.scenarioId },
      el('a', { href: '#/results' }, t('back')),
      el('span', {}, prev ? el('a', { href: `#/scenario/${prev}` }, t('prev')) : null, ' ',
        next ? el('a', { href: `#/scenario/${next}` }, t('next')) : null)),
    el('div', { class: 'scenario-head' },
      el('h2', {}, detail.scenarioId, ' ', el('span', { class: 'chip' }, typeLabel(detail.type))),
      el('p', { class: 'muted small' }, `${t('role')}: ${detail.role === 'operator' ? t('operator') : t('viewer')}`),
      questions.length > 1
        ? el('ol', { class: 'questions' }, questions.map(q => el('li', {}, q)))
        : el('p', { class: 'questions' }, questions[0] ?? ''),
      t('recordedNote') ? el('p', { class: 'muted small' }, t('recordedNote')) : null),
    el('div', { class: 'cards' }, TOOLSETS.map(ts => card(detail.records[ts]))));
}
