import { has, num, pct, t } from './i18n.js';
import { el, toolsetName, verdictBadge } from './render.js';
import { TOOLSETS, type ScenarioRow, type SiteIndex } from './types.js';

export const FILTERS = ['all', 'failed', 'differ'] as const;
export type Filter = typeof FILTERS[number];
const FILTER_LABEL = { all: 'filterAll', failed: 'filterFailed', differ: 'filterDiffer' } as const;
const matches = (row: ScenarioRow, filter: Filter) => filter === 'failed' ? TOOLSETS.some(ts => row.results[ts].verdict !== 'pass')
  : filter === 'differ' ? row.results.coarse.verdict !== row.results.fine.verdict : true;

export function typeLabel(type: string): string {
  const key = 'type.' + type;
  return has(key) ? t(key) : type;
}
export const kilo = (n: number) => n >= 1000 ? num(n / 1000, 1) + 'K' : num(n);

export function results(index: SiteIndex, filter: Filter, onFilter: (next: Filter) => void): HTMLElement {
  const rows = index.scenarios.filter(row => matches(row, filter));
  const totals = index.toolsets.map(s => el('span', { class: 'total' }, toolsetName(s.toolset), ' ',
    el('strong', {}, `${s.passed}/${s.count}`), ` (${pct(s.finalPassRate)})`));
  const select = el('select', { 'aria-label': t('filter'), onchange: event => onFilter((event.target as HTMLSelectElement).value as Filter) },
    FILTERS.map(f => el('option', { value: f, selected: f === filter }, t(FILTER_LABEL[f]))));
  const head = el('thead', {},
    el('tr', {}, el('th', { rowspan: 2, scope: 'col' }, t('colId')), el('th', { rowspan: 2, scope: 'col' }, t('colType')),
      el('th', { rowspan: 2, scope: 'col', class: 'question-col' }, t('colQuestion')),
      TOOLSETS.map(ts => el('th', { colspan: 4, scope: 'colgroup', class: 'group' }, toolsetName(ts)))),
    el('tr', {}, TOOLSETS.map(() => [t('colVerdict'), t('colCalls'), t('colForbidden'), t('colTokens')]
      .map((label, i) => el('th', { scope: 'col', class: i ? 'num' : 'group' }, label)))));
  const body = el('tbody', {}, rows.map(row => {
    const link = `#/scenario/${row.scenarioId}`;
    return el('tr', {},
      el('th', { scope: 'row' }, el('a', { href: link }, row.scenarioId)),
      el('td', { class: 'type' }, typeLabel(row.type)),
      el('td', { class: 'question-col' }, el('a', { href: link, class: 'question', title: row.question }, row.question),
        row.turns > 1 ? el('span', { class: 'muted' }, ' · ' + t('multiTurn', { n: row.turns })) : null),
      TOOLSETS.map(ts => {
        const cell = row.results[ts];
        return [el('td', { class: 'group' }, verdictBadge(cell.verdict)),
          el('td', { class: 'num', title: cell.tools.join('\n') }, cell.toolCalls),
          el('td', { class: 'num' + (cell.forbiddenViolations ? ' bad' : '') }, cell.forbiddenViolations),
          el('td', { class: 'num' }, kilo(cell.inputTokens + cell.outputTokens))];
      }));
  }));
  return el('section', { class: 'view' },
    el('p', { class: 'intro' }, t('resultsIntro')),
    el('div', { class: 'toolbar' }, el('div', { class: 'totals' }, totals),
      el('label', {}, t('filter'), ' ', select), el('span', { class: 'muted' }, t('shown', { n: rows.length }))),
    el('div', { class: 'scroll' }, el('table', { class: 'results' }, head, body)));
}
