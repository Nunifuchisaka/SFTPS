import { describe, it, expect } from 'vitest';
import { parseMode, isActionAvailable } from './permissions';

describe('parseMode', () => {
  it('parses valid octal permission strings to numbers', () => {
    expect(parseMode('644')).toBe(0o644);
    expect(parseMode('755')).toBe(0o755);
    expect(parseMode('600')).toBe(0o600);
    expect(parseMode('0644')).toBe(0o644);
  });

  it('rejects invalid mode strings', () => {
    expect(parseMode('999')).toBeNull(); // 9 is not an octal digit
    expect(parseMode('abc')).toBeNull();
    expect(parseMode('')).toBeNull();
    expect(parseMode('8000')).toBeNull();
    expect(parseMode('64')).toBeNull(); // too short
  });
});

describe('isActionAvailable', () => {
  it('sftp supports rename, chmod and delete', () => {
    expect(isActionAvailable('sftp', 'rename')).toBe(true);
    expect(isActionAvailable('sftp', 'chmod')).toBe(true);
    expect(isActionAvailable('sftp', 'delete')).toBe(true);
  });

  it('ftp supports rename and delete but not chmod', () => {
    expect(isActionAvailable('ftp', 'rename')).toBe(true);
    expect(isActionAvailable('ftp', 'chmod')).toBe(false);
    expect(isActionAvailable('ftp', 'delete')).toBe(true);
  });

  it('s3 supports rename (copy+delete) and delete but not chmod', () => {
    expect(isActionAvailable('s3', 'rename')).toBe(true);
    expect(isActionAvailable('s3', 'chmod')).toBe(false);
    expect(isActionAvailable('s3', 'delete')).toBe(true);
  });
});
