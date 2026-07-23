import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** ツールの戻り値を MCP の CallToolResult（text content）へ整形する。 */
export function textResult(data: unknown): CallToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}
