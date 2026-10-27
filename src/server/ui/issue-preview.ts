import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ClientCapabilities, McpServer, RegisteredTool, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { getUiCapability, registerAppResource, registerAppTool, RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from '@modelcontextprotocol/ext-apps/server';
import { editsSchema } from '../../core/issues.js';
import { formatResult } from '../format.js';
import type { Core } from '../tools/register.js';

export const ISSUE_PREVIEW_URI = 'ui://shopfloor/issue-preview';
// The form edits only these fields; line, date and evidence stay as Claude's draft cited them.
export const confirmSchema = z.strictObject({
  draftId: z.string().min(1).max(100),
  edits: editsSchema.pick({ title: true, severity: true, description: true }).strict().optional(),
});
export function supportsMcpApps(capabilities: ClientCapabilities | undefined): boolean {
  return getUiCapability(capabilities)?.mimeTypes?.includes(RESOURCE_MIME_TYPE) === true;
}
// Text clients keep the Phase 4 surface; only a client that declared MCP Apps calls enable(), which adds the form and confirm_issue.
export function registerIssuePreview(server: McpServer, preview: RegisteredTool, human: Core['human']): { enable: () => void } {
  const html = readFileSync(new URL('./issue-preview.html', import.meta.url), 'utf8');
  const resource = registerAppResource(server, 'issue-preview', ISSUE_PREVIEW_URI,
    { title: '이슈 확정 폼', description: '사람이 이슈 초안을 확인·수정하고 확정하는 화면' },
    uri => ({ contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: html }] }));
  const inputSchema: StandardSchemaWithJSON<z.input<typeof confirmSchema>, z.output<typeof confirmSchema>> = confirmSchema;
  resource.disable();
  let enabled = false;
  return { enable: () => {
    if (enabled) return;
    enabled = true;
    resource.enable();
    preview.update({ _meta: { ui: { resourceUri: ISSUE_PREVIEW_URI }, [RESOURCE_URI_META_KEY]: ISSUE_PREVIEW_URI } });
    // Registered only here, so a text client gets "not found" rather than a disabled tool. App-only visibility
    // keeps it out of the model's tool list on the host and lets only the form call it.
    registerAppTool(server, 'confirm_issue', {
      title: '이슈 확정', description: '확정 폼의 버튼 전용. 사람이 확인한 초안 번호와 수정 항목으로 이슈를 등록합니다.',
      inputSchema, _meta: { ui: { visibility: ['app'] } },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, ({ draftId, edits }) => formatResult(human.confirmDraft(draftId, edits ?? {}), { tool: 'confirm_issue' }));
  } };
}
