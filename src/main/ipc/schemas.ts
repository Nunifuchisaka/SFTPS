import { z } from 'zod';
import { profileSchema } from '../../shared/profile-schema';
import { secretKeySchema } from '../../shared/profile-schema';

export const profileIdSchema = z.string().min(1).max(64);
export const localPathSchema = z.string().min(1).max(32_768);
export const remotePathSchema = z.string().min(1).max(4096);
export const shortTextSchema = z.string().max(512);

export const syncOptionsSchema = z
  .object({
    compareBy: z.enum(['size', 'mtime', 'size-and-mtime', 'checksum']).optional(),
    deleteExtraneous: z.boolean().optional(),
    ignore: z.array(z.string().max(4096)).max(1000).optional(),
    expectedPlanToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .optional();

export const transferRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('upload'),
    profileId: profileIdSchema,
    localPath: localPathSchema,
    remotePath: remotePathSchema,
    label: shortTextSchema.optional(),
  }),
  z.object({
    kind: z.literal('download'),
    profileId: profileIdSchema,
    remotePath: remotePathSchema,
    savePath: localPathSchema,
    label: shortTextSchema.optional(),
  }),
  z.object({
    kind: z.literal('sync'),
    profileId: profileIdSchema,
    localDir: localPathSchema,
    remoteDir: remotePathSchema,
    options: syncOptionsSchema,
    label: shortTextSchema.optional(),
  }),
  z.object({
    kind: z.literal('download-sync'),
    profileId: profileIdSchema,
    remoteDir: remotePathSchema,
    localDir: localPathSchema,
    options: syncOptionsSchema,
    label: shortTextSchema.optional(),
  }),
]);

export const ipcSchemas = {
  profile: profileSchema,
  profileId: profileIdSchema,
  localPath: localPathSchema,
  remotePath: remotePathSchema,
  shortText: shortTextSchema,
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  mode: z.number().int().min(0).max(0o7777),
  timestamp: z.coerce.date(),
  stringArray: z.array(z.string().min(1).max(4096)).max(10_000),
  syncOptions: syncOptionsSchema,
  transferRequest: transferRequestSchema,
  saveProfileOptions: z
    .object({ clearSecrets: z.array(secretKeySchema).max(5).optional() })
    .optional(),
  deleteProfileOptions: z
    .object({ removeRelatedData: z.boolean().optional(), removeBackups: z.boolean().optional() })
    .optional(),
  commitOptions: z.object({ verifyAfterTransfer: z.boolean().optional() }).optional(),
  historyFilter: z
    .object({
      kind: z.enum(['upload', 'download', 'sync', 'download-sync', 'rename', 'delete', 'chmod']).optional(),
      status: z.enum(['success', 'failed']).optional(),
      profileId: profileIdSchema.optional(),
    })
    .optional(),
  bookmark: z.object({
    id: shortTextSchema.min(1),
    profileId: profileIdSchema,
    name: shortTextSchema.min(1),
    remotePath: remotePathSchema,
  }),
};
