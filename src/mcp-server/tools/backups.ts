import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppService } from '../../main/app-service';
import { withHostKeyErrorEnrichment, type HostKeyRejectionTracker } from '../host-key-bridge';
import { textResult } from '../tool-result';

export interface BackupToolDeps {
  service: Pick<AppService, 'listProfiles' | 'listBackups' | 'restoreBackup'>;
  rejections: HostKeyRejectionTracker;
}

/** list_backups / restore_backup を登録する。 */
export function registerBackupTools(server: McpServer, deps: BackupToolDeps): void {
  server.registerTool(
    'list_backups',
    {
      description: '指定したリモートパスに対するバックアップ世代（タイムスタンプ・サイズ）を新しい順に返す。',
      inputSchema: { id: z.string(), remotePath: z.string() },
    },
    async ({ id, remotePath }) => textResult(await deps.service.listBackups(id, remotePath)),
  );

  server.registerTool(
    'restore_backup',
    {
      description:
        'バックアップ内容をリモートへ書き戻す（timestamp 省略時は最新世代）。' +
        '復元前に現在のリモート内容も自動でバックアップされる（誤った世代を選んでも直前の状態へ戻せる）。' +
        'timestamp は ISO 8601 形式の文字列（例: "2026-01-01T00:00:00.000Z"）で指定する。',
      inputSchema: { id: z.string(), remotePath: z.string(), timestamp: z.string().optional() },
    },
    async ({ id, remotePath, timestamp }) =>
      textResult(
        await withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
          deps.service.restoreBackup(id, remotePath, timestamp !== undefined ? new Date(timestamp) : undefined),
        ),
      ),
  );
}
