import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/server';
import type { DatasetMeta, Line } from '../shared/types.js';

export function registerResources(server: McpServer, meta: DatasetMeta, lines: Line[]): void {
  // Source mode reads repository docs; standalone dist uses copied assets. Neither depends on cwd.
  const base = import.meta.url.endsWith('.ts') ? '../../resources/' : '../resources/';
  const document = (name: string) => readFileSync(new URL(base + name + '.md', import.meta.url), 'utf8');
  const resources = [
    { name: 'lines', title: '라인 정보', mimeType: 'application/json',
      text: JSON.stringify({ dataAsOf: meta.reference_now, datasetVersion: meta.dataset_version, items: lines }) },
    { name: 'glossary', title: '생산 용어집', mimeType: 'text/markdown', text: document('glossary') },
    { name: 'anomaly-criteria', title: '이상 판단 기준', mimeType: 'text/markdown', text: document('anomaly-criteria') },
    { name: 'data-guide', title: '데이터 기준 안내', mimeType: 'text/markdown',
      text: document('data-guide') + '\n\n현재 연결 데이터 / Connected dataset\n'
        + JSON.stringify({ referenceNow: meta.reference_now, timezone: 'Asia/Seoul',
          available: { from: meta.period_start, to: meta.period_end }, datasetVersion: meta.dataset_version }, null, 2) },
  ];
  for (const r of resources) server.registerResource(r.name, 'shopfloor://' + r.name, {
    title: r.title, description: r.title + ' — 클라이언트에서 선택해 읽는 참고자료', mimeType: r.mimeType,
  }, uri => ({ contents: [{ uri: uri.href, mimeType: r.mimeType, text: r.text }] }));
}
