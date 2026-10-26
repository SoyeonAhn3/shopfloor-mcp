// Every record string reaches the page as a Text node. Markup is only ever created from the fixed tags below.
import { parseMarkdown, safeHref, splitMarks, type Inline, type Line, type ListItem } from './markdown.js';
import { t } from './i18n.js';
import type { AutoStatus, Range, Verdict } from './types.js';

export type Child = Node | string | number | null | undefined | false | readonly Child[];
type Attrs = {
  class?: string; id?: string; title?: string; href?: string; lang?: string; role?: string; colspan?: number; rowspan?: number;
  value?: number | string; selected?: boolean; open?: boolean; hidden?: boolean; scope?: string;
  'aria-label'?: string; 'aria-current'?: string; 'aria-hidden'?: string;
  onclick?: (event: MouseEvent) => void; onchange?: (event: Event) => void;
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs) as [keyof Attrs, unknown][]) {
    if (value === undefined || value === false) continue;
    if (key === 'onclick' || key === 'onchange') { node.addEventListener(key.slice(2), value as EventListener); continue; }
    if (key === 'href') {
      const href = safeHref(String(value));
      if (href) node.setAttribute('href', href);
      if (href?.startsWith('https:')) node.setAttribute('rel', 'noopener noreferrer');
      continue;
    }
    node.setAttribute(key, value === true ? '' : String(value));
  }
  node.append(...flatten(children));
  return node;
}
function flatten(children: readonly Child[]): (Node | string)[] {
  return children.flatMap(c => c === null || c === undefined || c === false ? []
    : Array.isArray(c) ? flatten(c) : typeof c === 'number' ? [String(c)] : [c as Node | string]);
}

function inline(nodes: Line, marks: readonly Range[]): Child[] {
  return nodes.map((node: Inline): Child => {
    if (node.kind === 'strong') return el('strong', {}, inline(node.children, marks));
    const pieces = splitMarks(node.text, node.at, marks).map(p => p.marked ? el('mark', {}, p.text) : p.text);
    return node.kind === 'code' ? el('code', {}, pieces) : pieces;
  });
}
const lines = (all: Line[], marks: readonly Range[]) => all.flatMap((line, i) => [i ? el('br') : null, inline(line, marks)]);
function list(items: ListItem[], marks: readonly Range[]): HTMLElement {
  const make = (item: ListItem) => el(item.ordered ? 'ol' : 'ul');
  const root = make(items[0]!), stack = [{ depth: items[0]!.depth, node: root }];
  let last: HTMLElement | null = null;
  for (const item of items) {
    while (stack.length > 1 && item.depth < stack.at(-1)!.depth) stack.pop();
    if (item.depth > stack.at(-1)!.depth && last) {
      const nested = make(item); last.append(nested); stack.push({ depth: item.depth, node: nested });
    }
    last = el('li', item.number === null ? {} : { value: item.number }, lines(item.lines, marks));
    stack.at(-1)!.node.append(last);
  }
  return root;
}
export function markdown(source: string, marks: readonly Range[] = []): HTMLElement {
  return el('div', { class: 'md' }, parseMarkdown(source).map(block => {
    switch (block.kind) {
      case 'paragraph': return el('p', {}, lines(block.lines, marks));
      case 'heading': return el('h4', {}, inline(block.line, marks));
      case 'list': return list(block.items, marks);
      case 'quote': return el('blockquote', {}, lines(block.lines, marks));
      case 'rule': return el('hr');
      case 'code': return el('pre', {}, el('code', {}, splitMarks(block.text, block.at, marks).map(p => p.marked ? el('mark', {}, p.text) : p.text)));
      case 'table': return el('div', { class: 'scroll' }, el('table', { class: 'md-table' },
        el('thead', {}, el('tr', {}, block.head.map(cell => el('th', { scope: 'col' }, inline(cell, marks))))),
        el('tbody', {}, block.rows.map(row => el('tr', {}, row.map(cell => el('td', {}, inline(cell, marks))))))));
    }
  }));
}

export const json = (value: unknown) => el('pre', { class: 'json' }, JSON.stringify(value, null, 2));
export function verdictBadge(verdict: Verdict | AutoStatus, auto = false): HTMLElement {
  const label = auto ? (verdict === 'pass' ? t('autoPass') : verdict === 'fail' ? t('autoFail') : t('needs_review')) : t(verdict as Verdict);
  const icon = verdict === 'pass' ? '✓' : verdict === 'fail' ? '✕' : '…';
  return el('span', { class: `badge ${verdict}${auto ? ' auto' : ''}` }, el('span', { class: 'icon', 'aria-hidden': 'true' }, icon), label);
}
export const toolsetName = (toolset: string) => el('span', { class: `toolset ${toolset}` },
  el('span', { class: 'swatch', 'aria-hidden': 'true' }), toolset === 'coarse' ? t('coarse') : t('fine'));
export const short = (hash: string | null) => hash ? el('code', { title: hash }, hash.slice(0, 12)) : '—';
