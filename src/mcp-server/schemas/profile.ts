import { z } from 'zod';
import { SECRET_KEYS } from '../../core/profile/index';

/** core/profile の SECRET_KEYS と一致させる（項目が増えたら両方に反映する）。 */
export const secretKeySchema = z.enum(SECRET_KEYS);

const commonFields = {
  id: z.string(),
  name: z.string(),
  connectTimeoutMs: z.number().int().optional(),
  autoReconnect: z.boolean().optional(),
};

export const ftpProfileSchema = z.object({
  ...commonFields,
  protocol: z.literal('ftp'),
  host: z.string(),
  port: z.number().int(),
  user: z.string(),
  ftpSecurity: z.enum(['none', 'explicit', 'implicit']).optional(),
  /** @deprecated ftpSecurity へ移行済み。後方互換のみ。 */
  secure: z.boolean().optional(),
  password: z.string().optional(),
});

export const sftpProfileSchema = z.object({
  ...commonFields,
  protocol: z.literal('sftp'),
  host: z.string(),
  port: z.number().int(),
  user: z.string(),
  hostKeyPolicy: z.enum(['tofu', 'strict']).optional(),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional(),
});

export const s3ProfileSchema = z.object({
  ...commonFields,
  protocol: z.literal('s3'),
  region: z.string(),
  bucket: z.string(),
  accessKeyId: z.string().optional(),
  useDefaultCredentials: z.boolean().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
});

/**
 * core/profile の Profile 判別共用体（FtpProfile/SftpProfile/S3Profile）を反映した zod スキーマ。
 * ここでの検証は構造（型）のみ。business ルール（id 形式・port 範囲・バケット名等）は
 * AppService.saveProfile 内で validateProfile（core/profile）により別途検証される。
 */
export const profileSchema = z.discriminatedUnion('protocol', [
  ftpProfileSchema,
  sftpProfileSchema,
  s3ProfileSchema,
]);

export type ProfileInput = z.infer<typeof profileSchema>;
