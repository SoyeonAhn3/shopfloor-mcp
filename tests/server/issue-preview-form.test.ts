import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../src/server/ui/issue-preview.html', import.meta.url), 'utf8');
type Element = { value: string; textContent: string; hidden: boolean; disabled: boolean; className: string;
  listeners: Record<string, () => void | Promise<void>>; addEventListener: (type: string, fn: () => void | Promise<void>) => void };
function mount() {
  const elements = new Map<string, Element>();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    const listeners: Element['listeners'] = {};
    elements.set(match[1]!, { value: '', textContent: '', hidden: false, disabled: false, className: '', listeners,
      addEventListener: (type, fn) => { listeners[type] = fn; } });
  }
  const sent: { id: number; method: string; params: { arguments: unknown } }[] = [];
  const parent = { postMessage: (message: typeof sent[number]) => sent.push(message) };
  let receive: (event: { source: typeof parent; data: unknown }) => void;
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1]!, {
    document: { getElementById: (id: string) => elements.get(id) },
    window: { parent, addEventListener: (_: string, listener: typeof receive) => { receive = listener; } },
  });
  return { sent, get: (id: string) => elements.get(id)!,
    deliver: (data: object) => receive({ source: parent, data: { jsonrpc: '2.0', ...data } }) };
}

describe('human severity selection in the actual preview script', () => {
  it.each(['medium', 'high'])('requires a choice and sends %s even when it matches the proposal', async severity => {
    const view = mount();
    view.deliver({ method: 'ui/notifications/tool-result', params: { structuredContent: {
      draftId: 'P-test', expiresAt: '2026-10-27T02:10:00Z', draft: { lineId: 'L1', relatedDate: '2026-09-30',
        title: '제목', description: '설명', severity: 'medium', evidenceRefs: ['Q-0001'] },
    } } });
    expect(view.get('severity').value).toBe('');
    expect(view.get('severity-proposal').textContent).toContain('잠정 제안: 보통');
    await view.get('confirm').listeners.click!();
    expect(view.get('result').textContent).toBe('최종 심각도를 선택하세요.');
    expect(view.sent.filter(m => m.method === 'tools/call')).toHaveLength(0);
    view.get('severity').value = severity;
    view.get('severity').listeners.input!();
    expect(view.get('changes').textContent).toContain(severity === 'medium' ? '심각도 확인: 보통' : '보통 → 높음');
    const click = view.get('confirm').listeners.click!();
    const requests = view.sent.filter(m => m.method === 'tools/call');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.params).toEqual({ name: 'confirm_issue', arguments: { draftId: 'P-test', edits: { severity } } });
    view.deliver({ id: requests[0]!.id, result: { structuredContent: { ok: true, issueId: 'I-test' } } });
    await click;
    expect(view.get('result').textContent).toContain('등록되었습니다.');
    expect(view.get('confirm').disabled).toBe(true);
  });
});
