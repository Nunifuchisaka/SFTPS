import { describe, it, expect } from 'vitest';
import { parseNameStatus } from './index';

describe('parseNameStatus', () => {
  it('classifies added/modified files into files', () => {
    const output = 'A\tsrc/new.ts\nM\tsrc/existing.ts\n';
    expect(parseNameStatus(output)).toEqual({
      files: ['src/new.ts', 'src/existing.ts'],
      deletedFiles: [],
    });
  });

  it('classifies deleted files into deletedFiles, not files', () => {
    const output = 'D\tsrc/gone.ts\n';
    expect(parseNameStatus(output)).toEqual({ files: [], deletedFiles: ['src/gone.ts'] });
  });

  it('uses the new path (last field) for renames with a similarity score', () => {
    const output = 'R100\tsrc/old.ts\tsrc/renamed.ts\n';
    expect(parseNameStatus(output)).toEqual({ files: ['src/renamed.ts'], deletedFiles: [] });
  });

  it('uses the destination path for copies with a similarity score', () => {
    const output = 'C75\tsrc/base.ts\tsrc/copy.ts\n';
    expect(parseNameStatus(output)).toEqual({ files: ['src/copy.ts'], deletedFiles: [] });
  });

  it('ignores blank lines (trailing newline, etc.)', () => {
    const output = 'A\ta.ts\n\n';
    expect(parseNameStatus(output)).toEqual({ files: ['a.ts'], deletedFiles: [] });
  });

  it('ignores statuses outside ACMR/D (e.g. type change)', () => {
    const output = 'T\tsrc/mode-changed.ts\n';
    expect(parseNameStatus(output)).toEqual({ files: [], deletedFiles: [] });
  });

  it('returns empty results for empty output (no diff)', () => {
    expect(parseNameStatus('')).toEqual({ files: [], deletedFiles: [] });
  });

  it('handles a mix of statuses in one output', () => {
    const output = ['A\ta.ts', 'M\tb.ts', 'D\tc.ts', 'R090\told.ts\tnew.ts'].join('\n');
    expect(parseNameStatus(output)).toEqual({
      files: ['a.ts', 'b.ts', 'new.ts'],
      deletedFiles: ['c.ts'],
    });
  });
});
