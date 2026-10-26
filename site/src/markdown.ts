// A small Markdown subset parsed into plain data. render.ts turns it into DOM nodes with text only,
// so model output and memo text can never become markup. Offsets point into the source so the
// answer-key matches computed on the raw answer can be highlighted after formatting.
import type { Range } from './types.js';

export type Inline =
  | { kind: 'text'; text: string; at: number }
  | { kind: 'code'; text: string; at: number }
  | { kind: 'strong'; children: Inline[] };
export type Line = Inline[];
export interface ListItem { depth: number; ordered: boolean; number: number | null; lines: Line[] }
export type Block =
  | { kind: 'paragraph'; lines: Line[] }
  | { kind: 'heading'; level: number; line: Line }
  | { kind: 'list'; items: ListItem[] }
  | { kind: 'table'; head: Line[]; rows: Line[][] }
  | { kind: 'code'; text: string; at: number }
  | { kind: 'quote'; lines: Line[] }
  | { kind: 'rule' };

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^(\s*)(?:[-*+]|(\d+)[.)])\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export function parseInline(text: string, at: number): Line {
  const out: Line = [];
  let last = 0;
  for (const m of text.matchAll(/`([^`]+)`|\*\*(.+?)\*\*/g)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index), at: at + last });
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1], at: at + m.index + 1 });
    else out.push({ kind: 'strong', children: parseInline(m[2]!, at + m.index + 2) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last), at: at + last });
  return out;
}
const tail = (text: string, at: number, rest: string) => parseInline(rest, at + text.length - rest.length);
function cells(text: string, at: number): Line[] {
  const out: Line[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text[i] !== '|') continue;
    const raw = text.slice(start, i), lead = raw.length - raw.trimStart().length;
    out.push(parseInline(raw.trim(), at + start + lead));
    start = i + 1;
  }
  // Outer pipes leave empty first/last cells.
  if (text.trimStart().startsWith('|')) out.shift();
  if (text.trimEnd().endsWith('|')) out.pop();
  return out;
}
const startsBlock = (text: string, next: string | undefined) => FENCE.test(text) || HEADING.test(text)
  || RULE.test(text) || ITEM.test(text) || QUOTE.test(text) || (text.trimStart().startsWith('|') && TABLE_SEPARATOR.test(next ?? ''));

export function parseMarkdown(source: string): Block[] {
  const lines: { text: string; at: number }[] = [];
  let offset = 0;
  for (const raw of source.split('\n')) { lines.push({ text: raw.replace(/\r$/, ''), at: offset }); offset += raw.length + 1; }
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const { text, at } = lines[i]!;
    const next = lines[i + 1]?.text;
    let m: RegExpExecArray | null;
    if (!text.trim()) { i++; continue; }
    if (FENCE.test(text)) {
      let j = i + 1;
      while (j < lines.length && !FENCE.test(lines[j]!.text)) j++;
      const body = lines.slice(i + 1, j);
      blocks.push({ kind: 'code', text: body.map(l => l.text).join('\n'), at: body[0]?.at ?? at });
      i = j + 1;
    } else if ((m = HEADING.exec(text))) {
      blocks.push({ kind: 'heading', level: m[1]!.length, line: tail(text, at, m[2]!) }); i++;
    } else if (RULE.test(text)) {
      blocks.push({ kind: 'rule' }); i++;
    } else if (text.trimStart().startsWith('|') && TABLE_SEPARATOR.test(next ?? '')) {
      const head = cells(text, at), rows: Line[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.text.trimStart().startsWith('|')) { rows.push(cells(lines[i]!.text, lines[i]!.at)); i++; }
      blocks.push({ kind: 'table', head, rows });
    } else if (QUOTE.test(text)) {
      const quoted: Line[] = [];
      while (i < lines.length && (m = QUOTE.exec(lines[i]!.text))) { quoted.push(tail(lines[i]!.text, lines[i]!.at, m[1]!)); i++; }
      blocks.push({ kind: 'quote', lines: quoted });
    } else if (ITEM.test(text)) {
      const items: ListItem[] = [];
      while (i < lines.length && lines[i]!.text.trim()) {
        const line = lines[i]!, item = ITEM.exec(line.text);
        if (item) {
          items.push({ depth: Math.min(3, Math.floor(item[1]!.length / 2)), ordered: item[2] !== undefined,
            number: item[2] === undefined ? null : Number(item[2]), lines: [tail(line.text, line.at, item[3]!)] });
        } else if (/^\s/.test(line.text) && !startsBlock(line.text, lines[i + 1]?.text)) {
          items.at(-1)!.lines.push(tail(line.text, line.at, line.text.trimStart()));
        } else break;
        i++;
      }
      blocks.push({ kind: 'list', items });
    } else {
      const paragraph: Line[] = [];
      while (i < lines.length && lines[i]!.text.trim() && (!paragraph.length || !startsBlock(lines[i]!.text, lines[i + 1]?.text))) {
        paragraph.push(parseInline(lines[i]!.text, lines[i]!.at)); i++;
      }
      blocks.push({ kind: 'paragraph', lines: paragraph });
    }
  }
  return blocks;
}

// Splits one text run at the highlighted ranges; ranges are offsets into the original answer.
export function splitMarks(text: string, at: number, marks: readonly Range[]): { text: string; marked: boolean }[] {
  const cuts = new Set([0, text.length]);
  for (const [s, e] of marks) for (const p of [s - at, e - at]) if (p > 0 && p < text.length) cuts.add(p);
  const points = [...cuts].sort((a, b) => a - b), out: { text: string; marked: boolean }[] = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const s = points[k]!, e = points[k + 1]!;
    const marked = marks.some(([ms, me]) => ms <= at + s && at + e <= me);
    const last = out.at(-1);
    if (last && last.marked === marked) last.text += text.slice(s, e);
    else out.push({ text: text.slice(s, e), marked });
  }
  return out;
}

// Links are only ever built by the page itself; anything with a scheme other than https is dropped.
export function safeHref(url: string): string | null {
  const value = url.trim();
  if (/^https:\/\/[^\s\\]+$/i.test(value)) return value;
  if (/^(?!\/\/)[#.\w/-][^\s:\\]*$/.test(value)) return value;
  return null;
}
