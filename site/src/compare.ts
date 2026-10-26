import { num, pct, t } from './i18n.js';
import { el, toolsetName, verdictBadge } from './render.js';
import { kilo, typeLabel } from './results.js';
import { SCENARIO_TYPES, TOOLSETS, type SiteIndex, type ToolsetSummary } from './types.js';

const tile = (label: HTMLElement | string, value: string, sub: string) =>
  el('div', { class: 'tile' }, el('div', { class: 'tile-label' }, label), el('div', { class: 'tile-value' }, value), el('div', { class: 'muted small' }, sub));

function byType(sets: ToolsetSummary[]): HTMLElement {
  const rows = SCENARIO_TYPES.map(type => el('div', { class: 'bar-row' },
    el('div', { class: 'bar-label' }, typeLabel(type)),
    el('div', { class: 'bars' }, sets.map(s => {
      const { count, passed } = s.byType[type];
      const bar = el('span', { class: `bar ${s.toolset}` });
      bar.style.width = `${count ? (passed / count) * 100 : 0}%`;
      const text = `${passed}/${count}`;
      return el('div', { class: 'bar-line', title: `${s.toolset} · ${typeLabel(type)}: ${text}` },
        el('span', { class: 'bar-track' }, bar), el('span', { class: 'bar-value' }, text));
    }))));
  return el('figure', { class: 'chart' },
    el('div', { class: 'legend' }, sets.map(s => toolsetName(s.toolset))),
    rows,
    el('figcaption', { class: 'muted small' }, t('byTypeNote')));
}

export function compare(index: SiteIndex): HTMLElement {
  const sets = TOOLSETS.map(ts => index.toolsets.find(s => s.toolset === ts)!);
  const sum = (key: 'forbiddenViolations' | 'issueChanges' | 'draftsCreated') => sets.reduce((n, s) => n + s[key], 0);
  const split = (key: 'forbiddenViolations' | 'issueChanges') => sets.map(s => `${s.toolset} ${s[key]}`).join(' · ');
  const metrics: [string, (s: ToolsetSummary) => string][] = [
    [t('meanCalls'), s => num(s.meanToolCalls, 2)],
    [t('meanInput'), s => kilo(s.inputTokens / s.count)],
    [t('meanOutput'), s => kilo(s.outputTokens / s.count)],
    [t('meanTime'), s => num(s.meanMs / 1000, 1)],
    [t('totalCost'), s => num(s.estimatedCostUsd, 2)],
  ];
  const differing = index.scenarios.filter(r => r.results.coarse.verdict !== r.results.fine.verdict);
  const { pricing } = index.conditions;
  return el('section', { class: 'view' },
    el('p', { class: 'intro' }, t('compareIntro')),
    el('div', { class: 'tiles' },
      sets.map(s => tile(el('span', {}, t('accuracy'), ' · ', toolsetName(s.toolset)), pct(s.finalPassRate),
        t('accuracySub', { passed: s.passed, count: s.count }))),
      tile(t('forbidden'), String(sum('forbiddenViolations')), `${t('forbiddenSub')} (${split('forbiddenViolations')})`),
      tile(t('issues'), String(sum('issueChanges')), t('issuesSub', { drafts: sum('draftsCreated') }))),
    el('h3', {}, t('byType')), byType(sets),
    el('h3', {}, t('differences')),
    differing.length ? el('ul', { class: 'differences' }, differing.map(r => el('li', {},
      el('a', { href: `#/scenario/${r.scenarioId}` }, r.scenarioId), ' ', el('span', { class: 'muted' }, typeLabel(r.type)), ' ',
      TOOLSETS.map(ts => el('span', { class: 'pair' }, toolsetName(ts), ' ', verdictBadge(r.results[ts].verdict))))))
      : el('p', { class: 'muted' }, t('noDifferences')),
    el('h3', {}, t('efficiency')),
    el('div', { class: 'scroll' }, el('table', { class: 'metrics' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, t('metric')), sets.map(s => el('th', { scope: 'col', class: 'num' }, toolsetName(s.toolset))))),
      el('tbody', {}, metrics.map(([name, value]) => el('tr', {}, el('th', { scope: 'row' }, name), sets.map(s => el('td', { class: 'num' }, value(s)))))))),
    el('p', { class: 'muted small' }, t('costNote', { input: pricing.input, output: pricing.output })),
    el('h3', {}, t('toolsHeading')),
    el('div', { class: 'cards' }, sets.map(s => el('section', { class: 'card' },
      el('div', { class: 'card-head' }, el('h4', {}, toolsetName(s.toolset)), el('span', { class: 'muted' }, t('toolsCount', { n: s.tools.length }))),
      s.tools.map(tool => el('details', { class: 'tool' }, el('summary', {}, el('code', {}, tool.name)), el('p', { class: 'tool-description' }, tool.description)))))));
}
