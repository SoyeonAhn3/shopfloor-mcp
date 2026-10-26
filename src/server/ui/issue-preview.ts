import { readFileSync } from 'node:fs';
import type { ClientCapabilities, McpServer, RegisteredTool } from '@modelcontextprotocol/server';
import { getUiCapability, registerAppResource, RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from '@modelcontextprotocol/ext-apps/server';

export const ISSUE_PREVIEW_URI = 'ui://shopfloor/issue-preview';
export function supportsMcpApps(capabilities: ClientCapabilities | undefined): boolean {
  return getUiCapability(capabilities)?.mimeTypes?.includes(RESOURCE_MIME_TYPE) === true;
}
// Registered disabled: text clients keep the Phase 4 surface, and only a client that declared MCP Apps calls enable().
export function registerIssuePreview(server: McpServer, preview: RegisteredTool): { enable: () => void } {
  const html = readFileSync(new URL('./issue-preview.html', import.meta.url), 'utf8');
  const resource = registerAppResource(server, 'issue-preview', ISSUE_PREVIEW_URI,
    { title: '이슈 확정 폼', description: '사람이 이슈 초안을 확인·수정하고 확정하는 화면' },
    uri => ({ contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: html }] }));
  resource.disable();
  return { enable: () => {
    resource.enable();
    preview.update({ _meta: { ui: { resourceUri: ISSUE_PREVIEW_URI }, [RESOURCE_URI_META_KEY]: ISSUE_PREVIEW_URI } });
  } };
}
