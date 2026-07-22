import { describe, it, expect, vi } from 'vitest';
import {
  findGitRoot,
  prepareReleaseDiff,
  createReleaseZip,
  type GitReleaseDeps,
} from './git-release';

function makeDeps(
  impl: (command: string, args: string[], options: { cwd: string }) => Promise<{ stdout: string; stderr: string }>,
): GitReleaseDeps {
  return { execFile: vi.fn(impl) };
}

describe('findGitRoot', () => {
  it('resolves the repository root via git rev-parse --show-toplevel', async () => {
    const deps = makeDeps(async (command, args) => {
      expect(command).toBe('git');
      expect(args).toEqual(['rev-parse', '--show-toplevel']);
      return { stdout: '/repo/root\n', stderr: '' };
    });
    await expect(findGitRoot('/repo/root/sub', deps)).resolves.toBe('/repo/root');
  });

  it('runs the command in the given directory', async () => {
    let capturedCwd = '';
    const deps = makeDeps(async (_command, _args, options) => {
      capturedCwd = options.cwd;
      return { stdout: '/repo\n', stderr: '' };
    });
    await findGitRoot('/repo/sub/dir', deps);
    expect(capturedCwd).toBe('/repo/sub/dir');
  });

  it('wraps the underlying git error with a friendly message', async () => {
    const deps = makeDeps(async () => {
      throw new Error('fatal: not a git repository (or any parent up to mount point /)');
    });
    await expect(findGitRoot('/not/a/repo', deps)).rejects.toThrow('gitリポジトリが見つかりません');
  });
});

describe('prepareReleaseDiff', () => {
  it('finds the repo root then classifies the name-status diff against main..HEAD', async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const deps = makeDeps(async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      if (args[0] === 'rev-parse') return { stdout: '/repo\n', stderr: '' };
      return { stdout: 'A\ta.ts\nD\told.ts\n', stderr: '' };
    });
    const result = await prepareReleaseDiff('/repo/sub', deps);
    expect(result).toEqual({ repoRoot: '/repo', files: ['a.ts'], deletedFiles: ['old.ts'] });
    expect(calls[1]).toEqual({
      command: 'git',
      args: ['diff', '--name-status', 'main', 'HEAD'],
      cwd: '/repo',
    });
  });
});

describe('createReleaseZip', () => {
  it('runs git archive HEAD with the given pathspec files, scoped to the repo root', async () => {
    let captured: { command: string; args: string[]; cwd: string } | null = null;
    const deps = makeDeps(async (command, args, options) => {
      captured = { command, args, cwd: options.cwd };
      return { stdout: '', stderr: '' };
    });
    await createReleaseZip('/repo', ['a.ts', 'b.ts'], '/tmp/release.zip', deps);
    expect(captured).toEqual({
      command: 'git',
      args: ['archive', 'HEAD', '-o', '/tmp/release.zip', '--', 'a.ts', 'b.ts'],
      cwd: '/repo',
    });
  });
});
