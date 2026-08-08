import { z } from 'zod';
import { SECRET_KEYS } from '../core/profile/index';

export const secretKeySchema = z.enum(SECRET_KEYS);

const shortText = z.string().max(256);
const secretText = z.string().max(1024 * 1024);

const commonFields = {
  id: z.string().min(1).max(64),
  name: shortText.min(1),
  connectTimeoutMs: z.number().int().positive().max(600_000).optional(),
  autoReconnect: z.boolean().optional(),
};

export const ftpProfileSchema = z.object({
  ...commonFields,
  protocol: z.literal('ftp'),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  user: shortText.min(1),
  ftpSecurity: z.enum(['none', 'explicit', 'implicit']).optional(),
  secure: z.boolean().optional(),
  password: secretText.optional(),
});

export const sftpProfileSchema = z.object({
  ...commonFields,
  protocol: z.literal('sftp'),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  user: shortText.min(1),
  hostKeyPolicy: z.enum(['tofu', 'strict']).optional(),
  password: secretText.optional(),
  privateKey: secretText.optional(),
  passphrase: secretText.optional(),
});

export const s3ProfileSchema = z.object({
  ...commonFields,
  protocol: z.literal('s3'),
  region: shortText.min(1),
  bucket: z.string().min(3).max(63),
  accessKeyId: shortText.optional(),
  useDefaultCredentials: z.boolean().optional(),
  secretAccessKey: secretText.optional(),
  sessionToken: secretText.optional(),
});

export const profileSchema = z.discriminatedUnion('protocol', [
  ftpProfileSchema,
  sftpProfileSchema,
  s3ProfileSchema,
]);

export type ProfileInput = z.infer<typeof profileSchema>;
