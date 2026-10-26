import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMarkdown, safeHref, splitMarks, type Block, type Inline } from '../../site/src/markdown.js';

const site = new URL('../../site/', import.meta.url);
const flat = (nodes: Inline[]): string => nodes.map(n => n.kind === 'strong' ? `<b>${flat(n.children)}</b>` : n.kind === 'code' ? `\`${n.text}\`` : n.text).join('');

describe('safe rendering of record text', () => {
  it('never turns text into markup or runs inline code', () => {
    const sources = readdirSync(new URL('src/', site)).map(file => readFileSync(new URL('src/' + file, site), 'utf8'));
    for (const source of sources) {
      expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setAttribute\(\s*['"](?:on|style)/);
    }
    const html = readFileSync(new URL('index.html', site), 'utf8');
    // Scripts load only from the page's own module; a CSP blocks anything else.
    expect([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]!.trim())).toEqual(['']);
    expect(html).toContain("default-src 'self'");
  });
  it('parses the Markdown used in answers into text-only blocks', () => {
    const answer = '**전체**\n- 생산량 `minor_stop` 123개\n  - 하위 <b>x</b>\n\n| 라인 | 달성률 |\n|---|---|\n| L1 | 95.58% |\n\n<script>alert(1)</script> 끝';
    const blocks = parseMarkdown(answer);
    expect(blocks.map(b => b.kind)).toEqual(['paragraph', 'list', 'table', 'paragraph']);
    const list = blocks[1] as Extract<Block, { kind: 'list' }>;
    expect(list.items.map(i => [i.depth, flat(i.lines[0]!)])).toEqual([[0, '생산량 `minor_stop` 123개'], [1, '하위 <b>x</b>']]);
    const table = blocks[2] as Extract<Block, { kind: 'table' }>;
    expect(table.head.map(flat)).toEqual(['라인', '달성률']);
    expect(table.rows.map(r => r.map(flat))).toEqual([['L1', '95.58%']]);
    // Raw HTML in the source stays a text run; only the parser's own nodes carry structure.
    const last = blocks[3] as Extract<Block, { kind: 'paragraph' }>;
    expect(last.lines[0]).toEqual([{ kind: 'text', text: '<script>alert(1)</script> 끝', at: answer.indexOf('<script>') }]);
  });
  it('keeps highlight offsets on the original answer after formatting', () => {
    const answer = '- 정지는 **16회**, 기간 9/14~9/18';
    const marks: [number, number][] = [[answer.indexOf('16'), answer.indexOf('16') + 2], [answer.indexOf('14'), answer.indexOf('14') + 2]];
    const runs = (parseMarkdown(answer)[0] as Extract<Block, { kind: 'list' }>).items[0]!.lines[0]!;
    const texts = (nodes: Inline[]): { text: string; at: number }[] => nodes.flatMap(n => n.kind === 'strong' ? texts(n.children) : [n]);
    const marked = texts(runs).flatMap(run => splitMarks(run.text, run.at, marks).filter(p => p.marked).map(p => p.text));
    expect(marked).toEqual(['16', '14']);
    expect(splitMarks('abcdef', 10, [[11, 13], [12, 14]])).toEqual([{ text: 'a', marked: false }, { text: 'bcd', marked: true }, { text: 'ef', marked: false }]);
  });
  it('allows only relative and https links', () => {
    for (const ok of ['#/scenario/S01', 'data/index.json', 'https://github.com/SoyeonAhn3/shopfloor-mcp']) expect(safeHref(ok)).toBe(ok);
    for (const bad of ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example', 'http://example.com']) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});
