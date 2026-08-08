import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { KnownHostsController } from '../../main/known-hosts-controller';
import { textResult } from '../tool-result';
import { fingerprintSchema, hostSchema, portSchema } from '../schemas/common';

export interface HostKeyToolDeps {
  knownHosts: Pick<KnownHostsController, 'list' | 'lookup' | 'trust' | 'remove'>;
}

/** list_known_hosts / trust_host_key / remove_host_key を登録する。 */
export function registerHostKeyTools(server: McpServer, deps: HostKeyToolDeps): void {
  server.registerTool(
    'list_known_hosts',
    {
      description: '信頼済み SFTP ホスト鍵の一覧（host、port、SHA256 指紋）を、接続せずに確認する。',
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => textResult(deps.knownHosts.list()),
  );

  server.registerTool(
    'trust_host_key',
    {
      description:
        '未知の SFTP ホスト鍵を信頼済みとして記録する（test_connection 等が返す指紋情報をそのまま渡すこと）。' +
        '既に別の指紋が記録済み（鍵変更 = mismatch）の場合は、安全のため単純な上書きはせず拒否する。' +
        'その場合は先に remove_host_key を呼んでから、このツールで新しい指紋を登録すること。',
      inputSchema: { host: hostSchema, port: portSchema, fingerprint: fingerprintSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ host, port, fingerprint }) => {
      const known = deps.knownHosts.lookup(host, port);
      if (known !== null && known !== fingerprint) {
        throw new Error(
          `host key for ${host}:${port} is already trusted with a different fingerprint ` +
            `(known: ${known}, requested: ${fingerprint}). This looks like a host key change (possible MITM); ` +
            `call remove_host_key first if you are certain this change is legitimate, then retry trust_host_key.`,
        );
      }
      await deps.knownHosts.trust(host, port, fingerprint);
      return textResult({ host, port, fingerprint, trusted: true });
    },
  );

  server.registerTool(
    'remove_host_key',
    {
      description: '信頼済み SFTP ホスト鍵を削除する。次回接続時に指紋の確認をやり直す。',
      inputSchema: { host: hostSchema, port: portSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ host, port }) => textResult({ host, port, removed: await deps.knownHosts.remove(host, port) }),
  );
}
