import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** 永続ファイルのパーミッション（所有者のみ読み書き。同一マシンの他ユーザーに読ませない）。 */
export const STORE_FILE_MODE = 0o600;

let seq = 0;

/**
 * 同一ディレクトリの一時ファイルへ書いてから rename で置き換える（アトミック書き込み）。
 * 途中でクラッシュしても対象ファイルは旧内容のまま残り、切り詰め破損しない。
 * rename は同一ボリューム内であればアトミックなため temp は必ず対象と同じディレクトリに作る。
 */
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${seq++}.tmp`);
  await writeFile(tmp, data, { encoding: 'utf8', mode: STORE_FILE_MODE });
  try {
    await rename(tmp, filePath);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
