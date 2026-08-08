import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppService } from '../../main/app-service';
import { withHostKeyErrorEnrichment, type HostKeyRejectionTracker } from '../host-key-bridge';
import type { McpHistoryBridge } from '../history-bridge';
import { textResult } from '../tool-result';
import {
  localPathSchema,
  modeSchema,
  profileIdSchema,
  remotePathSchema,
} from '../schemas/common';

export interface TransferToolDeps {
  service: Pick<
    AppService,
    | 'listProfiles'
    | 'prepareUpload'
    | 'commitUpload'
    | 'prepareDownload'
    | 'download'
    | 'prepareSync'
    | 'commitSync'
    | 'renameRemote'
    | 'deleteRemote'
    | 'chmodRemote'
  >;
  rejections: HostKeyRejectionTracker;
  history: McpHistoryBridge;
}

const syncOptionsShape = {
  compareBy: z.enum(['size', 'mtime', 'size-and-mtime', 'checksum']).optional(),
  deleteExtraneous: z.boolean().optional(),
  ignore: z.array(z.string().max(4096)).max(1000).optional(),
};

function syncOptionsOf(input: {
  compareBy?: 'size' | 'mtime' | 'size-and-mtime' | 'checksum';
  deleteExtraneous?: boolean;
  ignore?: string[];
  planToken?: string;
}) {
  return {
    ...(input.compareBy !== undefined ? { compareBy: input.compareBy } : {}),
    ...(input.deleteExtraneous !== undefined ? { deleteExtraneous: input.deleteExtraneous } : {}),
    ...(input.ignore !== undefined ? { ignore: input.ignore } : {}),
    ...(input.planToken !== undefined ? { expectedPlanToken: input.planToken } : {}),
  };
}

/**
 * 転送系ツール（preview/commit をそれぞれ別ツールに分離）を登録する。
 * upload/download/sync の結果は TransferQueue を経由しないため、history 経由で履歴へ記録する。
 */
export function registerTransferTools(server: McpServer, deps: TransferToolDeps): void {
  server.registerTool(
    'preview_upload',
    {
      description:
        'アップロードの差分プレビューを作成する（書き込みなし）。リモートに既存ファイルがあれば' +
        'ローカル(after)との差分を返す。実際にアップロードするには upload を呼ぶこと。',
      inputSchema: { id: profileIdSchema, localPath: localPathSchema, remotePath: remotePathSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id, localPath, remotePath }) =>
      textResult(
        await withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
          deps.service.prepareUpload(id, localPath, remotePath),
        ),
      ),
  );

  server.registerTool(
    'upload',
    {
      description:
        'ローカルファイルをリモートへアップロードする。上書きする既存リモートファイルは事前に' +
        'バックアップされる（list_backups/restore_backup で復元可能）。verifyAfterTransfer=true で' +
        '書き込み後にハッシュ比較の整合性検証を行う。',
      inputSchema: {
        id: profileIdSchema,
        localPath: localPathSchema,
        remotePath: remotePathSchema,
        verifyAfterTransfer: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ id, localPath, remotePath, verifyAfterTransfer }) =>
      textResult(
        await deps.history.run('upload', id, remotePath, () =>
          withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
            deps.service.commitUpload(
              id,
              localPath,
              remotePath,
              verifyAfterTransfer !== undefined ? { verifyAfterTransfer } : {},
            ),
          ),
        ),
      ),
  );

  server.registerTool(
    'preview_download',
    {
      description:
        'ダウンロードの差分プレビューを作成する（書き込みなし）。既存ローカル(before)とリモート新内容(after)の' +
        '差分を返す。実際にダウンロードするには download を呼ぶこと。',
      inputSchema: { id: profileIdSchema, remotePath: remotePathSchema, savePath: localPathSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id, remotePath, savePath }) =>
      textResult(
        await withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
          deps.service.prepareDownload(id, remotePath, savePath),
        ),
      ),
  );

  server.registerTool(
    'download',
    {
      description:
        'リモートファイルをローカルへダウンロードする。上書きする既存ローカルファイルは事前に' +
        'バックアップされる。verifyAfterTransfer=true で書き込み後にハッシュ比較の整合性検証を行う。',
      inputSchema: {
        id: profileIdSchema,
        remotePath: remotePathSchema,
        savePath: localPathSchema,
        verifyAfterTransfer: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ id, remotePath, savePath, verifyAfterTransfer }) =>
      textResult(
        await deps.history.run('download', id, remotePath, () =>
          withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
            deps.service.download(
              id,
              remotePath,
              savePath,
              undefined,
              verifyAfterTransfer !== undefined ? { verifyAfterTransfer } : {},
            ),
          ),
        ),
      ),
  );

  server.registerTool(
    'preview_sync',
    {
      description:
        'ローカルフォルダとリモートディレクトリの差分同期プランを算出する（書き込みなし）。' +
        '実際に同期するには sync を呼ぶこと。',
      inputSchema: {
        id: profileIdSchema,
        localDir: localPathSchema,
        remoteDir: remotePathSchema,
        ...syncOptionsShape,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ id, localDir, remoteDir, ...options }) =>
      textResult(
        await withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
          deps.service.prepareSync(id, localDir, remoteDir, syncOptionsOf(options)),
        ),
      ),
  );

  server.registerTool(
    'sync',
    {
      description:
        'ローカルフォルダをリモートディレクトリへ差分同期する。上書き・削除されるファイルは' +
        '事前にバックアップされる。deleteExtraneous=true でローカルに無いリモートファイルを削除する' +
        '（宛先が空文字やサーバールートのままの実行は拒否される）。ミラー削除時は、直前の' +
        'preview_sync が返した planToken を指定すること。プランが変化していれば実行を拒否する。',
      inputSchema: {
        id: profileIdSchema,
        localDir: localPathSchema,
        remoteDir: remotePathSchema,
        ...syncOptionsShape,
        planToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ id, localDir, remoteDir, ...options }) =>
      textResult(
        await deps.history.run('sync', id, remoteDir, () =>
          withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
            deps.service.commitSync(id, localDir, remoteDir, syncOptionsOf(options)),
          ),
        ),
      ),
  );

  server.registerTool(
    'rename_remote',
    {
      description: 'リモートファイル/ディレクトリをリネーム（移動）する。',
      inputSchema: { id: profileIdSchema, from: remotePathSchema, to: remotePathSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ id, from, to }) => {
      await withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
        deps.service.renameRemote(id, from, to),
      );
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    'delete_remote',
    {
      description: 'リモートファイル/ディレクトリを削除する。',
      inputSchema: { id: profileIdSchema, remotePath: remotePathSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, remotePath }) => {
      await withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
        deps.service.deleteRemote(id, remotePath),
      );
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    'chmod_remote',
    {
      description: 'リモートファイルのパーミッションを変更する（対応トランスポート、主に SFTP のみ）。',
      inputSchema: { id: profileIdSchema, remotePath: remotePathSchema, mode: modeSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ id, remotePath, mode }) => {
      await withHostKeyErrorEnrichment(deps.service, id, deps.rejections, () =>
        deps.service.chmodRemote(id, remotePath, mode),
      );
      return textResult({ ok: true });
    },
  );
}
