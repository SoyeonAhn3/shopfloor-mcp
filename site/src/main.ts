import { compare } from './compare.js';
import { lang, num, setLang, t } from './i18n.js';
import { el, short } from './render.js';
import { results, type Filter } from './results.js';
import { scenario } from './scenario.js';
import { TOOLSETS, type ScenarioDetail, type SiteIndex } from './types.js';

const byId = (id: string) => document.getElementById(id)!;
const view = byId('view'), details = new Map<string, Promise<ScenarioDetail>>();
const TABS = [['results', 'tabResults'], ['compare', 'tabCompare'], ['demo', 'tabDemo']] as const;
let index: SiteIndex | null = null, filter: Filter = 'all';

async function load<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return await response.json() as T;
}
const route = () => {
  const [page = 'results', id = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { page, id };
};

function conditions(data: SiteIndex): HTMLElement {
  const c = data.conditions, l = c.limits;
  const reviews = data.scenarios.flatMap(r => TOOLSETS.map(ts => r.results[ts].verdict));
  const rows: [string, Node | string][] = [
    [t('model'), el('code', {}, c.model)], [t('dataset'), el('code', {}, c.datasetVersion)],
    [t('scenarioSet'), short(c.scenarioSetHash)], [t('descriptions'), short(c.descriptionsHash)],
    [t('policy'), short(c.policyHash)], [t('grader'), short(c.graderHash)], [t('repeat'), `N=${c.repeat}`],
    [t('limits'), t('limitsValue', { calls: l.maxModelCalls, tools: l.maxToolCalls, tokens: num(l.maxOutputTokens), seconds: l.timeoutMs / 1000 })],
    [t('review'), t('reviewValue', { done: reviews.filter(v => v !== 'pending').length, total: reviews.length, names: c.reviewers.join(', ') })],
    [t('source'), short(data.sourceHash)],
  ];
  return el('div', {},
    el('h2', { class: 'section-title' }, t('conditions')),
    el('dl', { class: 'grid' }, rows.map(([name, value]) => el('div', {}, el('dt', {}, name), el('dd', {}, value)))),
    c.systemPrompts.map(p => el('details', { class: 'prompt' }, el('summary', {}, t('systemPrompt', { role: p.role })), el('pre', {}, p.text))));
}

function chrome(data: SiteIndex, page: string): void {
  document.documentElement.lang = lang;
  document.title = t('title');
  byId('title').textContent = t('title');
  byId('lede').textContent = t('lede');
  byId('lang').textContent = t('switchLang');
  byId('conditions').replaceChildren(conditions(data));
  const active = page === 'scenario' ? 'results' : page;
  byId('tabs').replaceChildren(...TABS.map(([name, key]) =>
    el('a', { href: `#/${name}`, class: 'tab', ...(name === active ? { 'aria-current': 'page' } : {}) }, t(key))));
  byId('footer').replaceChildren(t('footer'), ' ', el('a', { href: data.repoUrl }, t('repo')));
}

async function render(scroll: boolean): Promise<void> {
  if (!index) return;
  const data = index, { page, id } = route();
  chrome(data, page);
  if (page === 'scenario') {
    if (!data.scenarios.some(s => s.scenarioId === id)) { view.replaceChildren(el('p', { class: 'error' }, t('notFound'))); return; }
    if (!details.has(id)) details.set(id, load<ScenarioDetail>(`data/scenarios/${id}.json`));
    view.replaceChildren(el('p', { class: 'muted' }, t('loading')));
    try {
      const detail = await details.get(id)!;
      // A later navigation may have replaced this view while the file was loading.
      if (route().id === id) view.replaceChildren(scenario(data, detail));
    } catch {
      details.delete(id);
      view.replaceChildren(el('p', { class: 'error' }, t('loadError')));
    }
  } else if (page === 'compare') view.replaceChildren(compare(data));
  else if (page === 'demo') view.replaceChildren(el('section', { class: 'view' },
    el('h2', {}, t('demoTitle')), el('p', { class: 'placeholder' }, t('demoPending'))));
  else view.replaceChildren(results(data, filter, next => { filter = next; void render(false); }));
  if (scroll) window.scrollTo(0, 0);
}

byId('lang').addEventListener('click', () => { setLang(lang === 'ko' ? 'en' : 'ko'); void render(false); });
window.addEventListener('hashchange', () => void render(true));
load<SiteIndex>('data/index.json')
  .then(data => { index = data; return render(false); })
  .catch(() => view.replaceChildren(el('p', { class: 'error' }, t('loadError'))));
