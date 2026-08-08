import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppService } from '../../main/app-service';
import { profileSchema, secretKeySchema } from '../schemas/profile';
import { textResult } from '../tool-result';
import { profileIdSchema } from '../schemas/common';

export interface ProfileToolDeps {
  service: Pick<AppService, 'listProfiles' | 'saveProfile' | 'deleteProfile'>;
}

/** list_profiles / save_profile / delete_profile を登録する。 */
export function registerProfileTools(server: McpServer, deps: ProfileToolDeps): void {
  server.registerTool(
    'list_profiles',
    {
      description: '登録済みの接続プロファイル一覧を返す（パスワード等のシークレットは含まれない）。',
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => textResult(await deps.service.listProfiles()),
  );

  server.registerTool(
    'save_profile',
    {
      description:
        '接続プロファイルを新規作成・更新する（id が既存なら上書き）。' +
        'シークレット項目（password/privateKey/passphrase/secretAccessKey/sessionToken）を' +
        '省略した場合は既存値をそのまま保持する（誤消去防止のための既存挙動）。' +
        '明示的に削除したい項目のみ clearSecrets に列挙すること。',
      inputSchema: {
        profile: profileSchema,
        clearSecrets: z.array(secretKeySchema).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ profile, clearSecrets }) =>
      textResult(
        await deps.service.saveProfile(profile, clearSecrets !== undefined ? { clearSecrets } : {}),
      ),
  );

  server.registerTool(
    'delete_profile',
    {
      description:
        'プロファイルを削除する。プロファイル本体とシークレットは常に削除される。' +
        'removeRelatedData=true でブックマーク・履歴・信頼済みホスト鍵も削除、' +
        'removeBackups=true でバックアップ（復旧手段）も削除する（既定はどちらも削除しない）。',
      inputSchema: {
        id: profileIdSchema,
        removeRelatedData: z.boolean().optional(),
        removeBackups: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id, removeRelatedData, removeBackups }) =>
      textResult(
        await deps.service.deleteProfile(id, {
          ...(removeRelatedData !== undefined ? { removeRelatedData } : {}),
          ...(removeBackups !== undefined ? { removeBackups } : {}),
        }),
      ),
  );
}
