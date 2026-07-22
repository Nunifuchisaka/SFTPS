import { readFile } from 'node:fs/promises';
import { buildProfileDefaults, parseDotenv, type ProfileDefaults } from '../core/env/index';

/**
 * 開発用デフォルト値を .env ファイルから読み込む（機密情報は扱わない）。
 * ファイルが存在しない・読めない・有効な項目が無い場合は null を返す
 * （SecretStore 等と異なりフェイルクローズは不要な補助機能のため、失敗時は素直に未設定として扱う）。
 */
export async function loadProfileDefaults(envFilePath: string): Promise<ProfileDefaults | null> {
  let raw: string;
  try {
    raw = await readFile(envFilePath, 'utf8');
  } catch {
    return null;
  }
  const defaults = buildProfileDefaults(parseDotenv(raw));
  return Object.keys(defaults).length > 0 ? defaults : null;
}
