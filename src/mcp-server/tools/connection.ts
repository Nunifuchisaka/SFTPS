import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppService } from '../../main/app-service';
import { enrichConnectionResult, withHostKeyErrorEnrichment, type HostKeyRejectionTracker } from '../host-key-bridge';
import { textResult } from '../tool-result';
import { profileIdSchema, remotePathSchema } from '../schemas/common';

export interface ConnectionToolDeps {
  service: Pick<AppService, 'listProfiles' | 'testConnection' | 'listRemote'>;
  rejections: HostKeyRejectionTracker;
}

/** test_connection / list_remote を登録する。 */
export function registerConnectionTools(server: McpServer, deps: ConnectionToolDeps): void {
  server.registerTool(
    'test_connection',
    {
      description:
        'プロファイルへの疎通確認を行う（副作用なし）。SFTP で未知/変更されたホスト鍵が原因の場合は、' +
        'trust_host_key の呼び出しにそのまま使える指紋情報つきのエラーメッセージを返す。',
      inputSchema: { id: profileIdSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id }) => {
      const result = await deps.service.testConnection(id);
      return textResult(await enrichConnectionResult(deps.service, id, deps.rejections, result));
    },
  );

  server.registerTool(
    'list_remote',
    {
      description: 'リモートディレクトリの一覧（ファイル/ディレクトリ、サイズ、更新日時）を取得する。',
      inputSchema: { id: profileIdSchema, remoteDir: remotePathSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id, remoteDir }) =>
      textResult(
        await withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
          deps.service.listRemote(id, remoteDir),
        ),
      ),
  );
}
