import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseNameStatus } from '../core/release/index';

const execFileAsync = promisify(execFile);

/** git コマンド実行を差し替え可能にするための依存注入口（単体テスト用）。 */
export interface GitReleaseDeps {
  execFile(
    command: string,
    args: string[],
    options: { cwd: string },
  ): Promise<{ stdout: string; stderr: string }>;
}

export const defaultGitReleaseDeps: GitReleaseDeps = {
  execFile: (command, args, options) => execFileAsync(command, args, options),
};

export interface PrepareReleaseDiffResult {
  repoRoot: string;
  files: string[];
  deletedFiles: string[];
}

/**
 * `localDir` の祖先を遡って git リポジトリのルートを特定する。
 * `.git` を持たない場合は `git rev-parse` 自体が失敗するため、その旨のエラーにして伝える。
 */
export async function findGitRoot(
  localDir: string,
  deps: GitReleaseDeps = defaultGitReleaseDeps,
): Promise<string> {
  try {
    const { stdout } = await deps.execFile('git', ['rev-parse', '--show-toplevel'], {
      cwd: localDir,
    });
    return stdout.trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`gitリポジトリが見つかりません: ${message}`);
  }
}

/**
 * リポジトリルートを特定したうえで `main..HEAD` の name-status diff を取得し、
 * ACMR系（zip対象候補）と D系（削除警告対象）に分類する。
 */
export async function prepareReleaseDiff(
  localDir: string,
  deps: GitReleaseDeps = defaultGitReleaseDeps,
): Promise<PrepareReleaseDiffResult> {
  const repoRoot = await findGitRoot(localDir, deps);
  const { stdout } = await deps.execFile('git', ['diff', '--name-status', 'main', 'HEAD'], {
    cwd: repoRoot,
  });
  const { files, deletedFiles } = parseNameStatus(stdout);
  return { repoRoot, files, deletedFiles };
}

/** `git archive HEAD -o <savePath> -- <files...>` を実行し、選択ファイルだけを zip 化する。 */
export async function createReleaseZip(
  repoRoot: string,
  files: string[],
  savePath: string,
  deps: GitReleaseDeps = defaultGitReleaseDeps,
): Promise<void> {
  await deps.execFile('git', ['archive', 'HEAD', '-o', savePath, '--', ...files], {
    cwd: repoRoot,
  });
}
