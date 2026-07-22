import { describe, it, expect } from 'vitest';
import { parseDotenv, buildProfileDefaults } from './index';

describe('parseDotenv', () => {
  it('parses KEY=VALUE lines', () => {
    expect(parseDotenv('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('skips blank lines and comments', () => {
    expect(parseDotenv('# comment\n\nFOO=bar\n  # indented comment\n')).toEqual({ FOO: 'bar' });
  });

  it('trims whitespace around key and value', () => {
    expect(parseDotenv('  FOO  =  bar  ')).toEqual({ FOO: 'bar' });
  });

  it('strips matching surrounding quotes', () => {
    expect(parseDotenv('FOO="bar"\nBAZ=\'qux\'')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('ignores lines without =', () => {
    expect(parseDotenv('not-a-line\nFOO=bar')).toEqual({ FOO: 'bar' });
  });

  it('allows = inside the value', () => {
    expect(parseDotenv('FOO=a=b=c')).toEqual({ FOO: 'a=b=c' });
  });

  it('returns empty object for empty content', () => {
    expect(parseDotenv('')).toEqual({});
  });
});

describe('buildProfileDefaults', () => {
  it('extracts known non-secret fields', () => {
    const defaults = buildProfileDefaults({
      FUNABIN_DEFAULT_PROTOCOL: 'sftp',
      FUNABIN_DEFAULT_HOST: 'example.com',
      FUNABIN_DEFAULT_PORT: '22',
      FUNABIN_DEFAULT_USER: 'someuser',
      FUNABIN_DEFAULT_HOST_KEY_POLICY: 'strict',
      FUNABIN_DEFAULT_CONNECT_TIMEOUT_MS: '5000',
      FUNABIN_DEFAULT_AUTO_RECONNECT: 'true',
    });
    expect(defaults).toEqual({
      protocol: 'sftp',
      host: 'example.com',
      port: 22,
      user: 'someuser',
      hostKeyPolicy: 'strict',
      connectTimeoutMs: 5000,
      autoReconnect: true,
    });
  });

  it('ignores unknown or invalid protocol values', () => {
    expect(buildProfileDefaults({ FUNABIN_DEFAULT_PROTOCOL: 'telnet' })).toEqual({});
  });

  it('ignores invalid ftpSecurity/hostKeyPolicy values', () => {
    expect(
      buildProfileDefaults({
        FUNABIN_DEFAULT_FTP_SECURITY: 'weird',
        FUNABIN_DEFAULT_HOST_KEY_POLICY: 'weird',
      }),
    ).toEqual({});
  });

  it('ignores non-numeric port/timeout values', () => {
    expect(
      buildProfileDefaults({
        FUNABIN_DEFAULT_PORT: 'not-a-number',
        FUNABIN_DEFAULT_CONNECT_TIMEOUT_MS: 'nope',
      }),
    ).toEqual({});
  });

  it('never reads secret-shaped keys (password etc. are simply not in the map)', () => {
    // password/privateKey/passphrase/secretAccessKey/sessionToken に対応する
    // ENV キーは存在しないため、それらしき値を混ぜても抽出結果に出てこないことを確認する。
    const defaults = buildProfileDefaults({
      FUNABIN_DEFAULT_PASSWORD: 'should-not-appear',
      FUNABIN_DEFAULT_HOST: 'example.com',
    });
    expect(defaults).toEqual({ host: 'example.com' });
    expect(JSON.stringify(defaults)).not.toContain('should-not-appear');
  });

  it('returns empty object when nothing is set', () => {
    expect(buildProfileDefaults({})).toEqual({});
  });
});
