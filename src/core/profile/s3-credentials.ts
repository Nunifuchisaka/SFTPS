import type { S3Profile } from './index';

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export type S3CredentialResolution =
  | { mode: 'explicit'; credentials: S3Credentials }
  | { mode: 'default' }
  | { mode: 'missing'; reason: string };

function value(input: string | undefined): string | null {
  const trimmed = (input ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * S3 接続に使う資格情報を決める純粋関数。
 *
 * 資格情報が揃っていないときに黙って AWS SDK の既定チェーン（環境変数・
 * ~/.aws/credentials・IMDS）へ落ちると、意図しないマシン資格情報
 * （往々にしてより広い権限）で本番バケットへ書き込みかねない。
 * そのため既定チェーンの利用は profile.useDefaultCredentials の明示オプトイン時のみとし、
 * オプトインしていなければ接続を拒否する（フェイルクローズ）。
 */
export function resolveS3Credentials(
  profile: S3Profile,
  secrets: Record<string, string>,
): S3CredentialResolution {
  const accessKeyId = value(profile.accessKeyId);
  const secretAccessKey = value(secrets['secretAccessKey']);

  if (accessKeyId && secretAccessKey) {
    const sessionToken = value(secrets['sessionToken']);
    return {
      mode: 'explicit',
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    };
  }

  if (profile.useDefaultCredentials === true) return { mode: 'default' };

  return {
    mode: 'missing',
    reason:
      'S3 credentials are not configured. Enter an Access Key ID and Secret Access Key, ' +
      'or explicitly enable "use the machine default credentials" for this profile.',
  };
}
