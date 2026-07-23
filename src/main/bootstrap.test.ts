import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SftpProfile } from '../core/profile/index';
import type { HostKeyPromptRequest } from '../core/hostkey/index';
import type { SafeStorageLike } from './secret-store';
import { createAppServices, createSftpHostVerifierFactory, type HostKeyGateway } from './bootstrap';
import { KnownHostsLoadError } from './known-hosts-store';

class FakeSafeStorage implements SafeStorageLike {
  isEncryptionAvailable() {
    return true;
  }
  encryptString(s: string) {
    return Buffer.concat([Buffer.from('enc:'), Buffer.from(s, 'utf8')]);
  }
  decryptString(b: Buffer) {
    return b.toString('utf8').slice('enc:'.length);
  }
}

const sftpProfile: SftpProfile = {
  id: 's1',
  name: 'My SFTP',
  protocol: 'sftp',
  host: 'sftp.example.com',
  port: 22,
  user: 'bob',
  hostKeyPolicy: 'tofu',
};

describe('createSftpHostVerifierFactory', () => {
  function fakeGateway(overrides: Partial<HostKeyGateway> = {}): HostKeyGateway {
    return {
      verify: () => 'unknown',
      lookup: () => null,
      trust: async () => undefined,
      ...overrides,
    };
  }

  it('rejects (fail closed) an unknown host key when confirmHostKey is not provided', async () => {
    const gateway = fakeGateway();
    const factory = createSftpHostVerifierFactory({}, gateway);
    const verifier = factory(sftpProfile);

    const accepted = await new Promise<boolean>((resolve) => {
      verifier(Buffer.from('key-bytes'), resolve);
    });
    expect(accepted).toBe(false);
  });

  it('calls onHostKeyRejected for an unknown host key even without confirmHostKey', async () => {
    const gateway = fakeGateway();
    const onHostKeyRejected = vi.fn<(request: HostKeyPromptRequest) => void>();
    const factory = createSftpHostVerifierFactory({ onHostKeyRejected }, gateway);
    const verifier = factory(sftpProfile);

    await new Promise<boolean>((resolve) => verifier(Buffer.from('key-bytes'), resolve));
    expect(onHostKeyRejected).toHaveBeenCalledTimes(1);
    expect(onHostKeyRejected.mock.calls[0][0]).toMatchObject({
      host: 'sftp.example.com',
      port: 22,
      verdict: 'unknown',
    });
  });

  it('calls onHostKeyRejected for a mismatched host key regardless of confirmHostKey', async () => {
    const gateway = fakeGateway({
      verify: () => 'mismatch',
      lookup: () => 'SHA256:known',
    });
    const onHostKeyRejected = vi.fn<(request: HostKeyPromptRequest) => void>();
    const confirmHostKey = vi.fn(async () => true);
    const factory = createSftpHostVerifierFactory({ confirmHostKey, onHostKeyRejected }, gateway);
    const verifier = factory(sftpProfile);

    const accepted = await new Promise<boolean>((resolve) => verifier(Buffer.from('key-bytes'), resolve));
    expect(accepted).toBe(false);
    expect(confirmHostKey).not.toHaveBeenCalled();
    expect(onHostKeyRejected.mock.calls[0][0]).toMatchObject({ verdict: 'mismatch' });
  });

  it('accepts and records trust when confirmHostKey consents to an unknown key', async () => {
    const trust = vi.fn(async () => undefined);
    const gateway = fakeGateway({ trust });
    const factory = createSftpHostVerifierFactory({ confirmHostKey: async () => true }, gateway);
    const verifier = factory(sftpProfile);

    const accepted = await new Promise<boolean>((resolve) => verifier(Buffer.from('key-bytes'), resolve));
    expect(accepted).toBe(true);
    expect(trust).toHaveBeenCalledWith('sftp.example.com', 22, expect.stringMatching(/^SHA256:/));
  });
});

describe('createAppServices', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'funabinftp-bootstrap-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('wires a working AppService without any GUI-only dependency', async () => {
    const services = await createAppServices({
      userData: dir,
      safeStorage: new FakeSafeStorage(),
      appEnvPath: null,
    });

    expect(await services.service.listProfiles()).toEqual([]);
    expect(services.profileDefaults).toBeNull();
    expect(services.knownHosts.list()).toEqual([]);
  });

  it('propagates KnownHostsLoadError instead of silently starting with zero trust', async () => {
    await writeFile(join(dir, 'known_hosts.json'), '{not valid json');

    await expect(
      createAppServices({ userData: dir, safeStorage: new FakeSafeStorage(), appEnvPath: null }),
    ).rejects.toBeInstanceOf(KnownHostsLoadError);
  });

  it('loads profileDefaults only when appEnvPath is given', async () => {
    await writeFile(join(dir, '.env'), 'FUNABIN_DEFAULT_HOST=example.com\n');

    const services = await createAppServices({
      userData: dir,
      safeStorage: new FakeSafeStorage(),
      appEnvPath: join(dir, '.env'),
    });

    expect(services.profileDefaults).not.toBeNull();
  });

  it('reports persistence failures through reportStoreError instead of throwing', async () => {
    const reportStoreError = vi.fn();
    const services = await createAppServices({
      userData: dir,
      safeStorage: new FakeSafeStorage(),
      appEnvPath: null,
      reportStoreError,
    });

    services.history.append({ id: 'h1', kind: 'upload', profileId: 'p1', path: '/a', status: 'success' });
    expect(services.history.list()).toHaveLength(1);
  });
});
