/** ACMR（追加・コピー・変更・リネーム）対象と D（削除）対象の分類結果。 */
export interface NameStatusResult {
  files: string[];
  deletedFiles: string[];
}

/**
 * `git diff --name-status main HEAD` の生出力をパースし、
 * ACMR系（zip対象候補）と D系（リモート側手動削除の警告対象）に分類する。
 * リネーム・コピー（`R100` / `C75` など類似度スコア付き）は最後のフィールド（宛先パス）を使う。
 */
export function parseNameStatus(output: string): NameStatusResult {
  const files: string[] = [];
  const deletedFiles: string[] = [];

  for (const line of output.split('\n')) {
    if (line.trim().length === 0) continue;
    const fields = line.split('\t');
    const statusChar = fields[0]?.[0];
    const path = fields[fields.length - 1];
    if (!path) continue;

    switch (statusChar) {
      case 'D':
        deletedFiles.push(path);
        break;
      case 'A':
      case 'C':
      case 'M':
      case 'R':
        files.push(path);
        break;
      default:
        // ACMR/D 以外のステータス（例: T=モード変更）は対象外。
        break;
    }
  }

  return { files, deletedFiles };
}
