import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SecretStore,
  SecretEncryptionUnavailableError,
  type SafeStorageLike,
} from './secret-store';

class FakeSafeStorage implements SafeStorageLike {
  available = true;
  isEncryptionAvailable(): boolean {
    return this.available;
  }
  encryptString(plainText: string): Buffer {
    return Buffer.concat([Buffer.from('enc:'), Buffer.from(plainText, 'utf8')]);
  }
  decryptString(encrypted: Buffer): string {
    const s = encrypted.toString('utf8');
    if (!s.startsWith('enc:')) throw new Error('corrupt blob');
    return s.slice('enc:'.length);
  }
}

describe('SecretStore', () => {
  let dir: string;
  let filePath: string;
  let safe: FakeSafeStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sftps-secret-'));
    filePath = join(dir, 'secrets.json');
    safe = new FakeSafeStorage();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('encrypts and round-trips secrets without persisting plaintext', async () => {
    const store = new SecretStore({ safeStorage: safe, filePath });
    await store.setSecrets('p1', { password: 'hunter2', privateKey: 'KEYDATA' });

    expect(await store.getSecrets('p1')).toEqual({ password: 'hunter2', privateKey: 'KEYDATA' });

    const onDisk = await readFile(filePath, 'utf8');
    expect(onDisk).not.toContain('hunter2');
    expect(onDisk).not.toContain('KEYDATA');
  });

  it('returns null for an unknown profile', async () => {
    const store = new SecretStore({ safeStorage: safe, filePath });
    expect(await store.getSecrets('nope')).toBeNull();
  });

  it('keeps profiles isolated', async () => {
    const store = new SecretStore({ safeStorage: safe, filePath });
    await store.setSecrets('a', { password: 'aaa' });
    await store.setSecrets('b', { password: 'bbb' });
    expect(await store.getSecrets('a')).toEqual({ password: 'aaa' });
    expect(await store.getSecrets('b')).toEqual({ password: 'bbb' });
  });

  it('deletes a profile\'s secrets', async () => {
    const store = new SecretStore({ safeStorage: safe, filePath });
    await store.setSecrets('a', { password: 'aaa' });
    await store.setSecrets('b', { password: 'bbb' });
    await store.deleteSecrets('a');
    expect(await store.getSecrets('a')).toBeNull();
    expect(await store.getSecrets('b')).toEqual({ password: 'bbb' });
  });

  it('throws and persists nothing when encryption is unavailable', async () => {
    safe.available = false;
    const store = new SecretStore({ safeStorage: safe, filePath });
    expect(store.isAvailable()).toBe(false);
    await expect(store.setSecrets('a', { password: 'x' })).rejects.toBeInstanceOf(
      SecretEncryptionUnavailableError,
    );
    expect(existsSync(filePath)).toBe(false);
  });

  it('fails closed on malformed JSON and does not overwrite the damaged file', async () => {
    await writeFile(filePath, '{ damaged', 'utf8');
    const store = new SecretStore({ safeStorage: safe, filePath });
    await expect(store.setSecrets('a', { password: 'x' })).rejects.toThrow();
    expect(await readFile(filePath, 'utf8')).toBe('{ damaged');
  });

  it('fails closed when a decrypted profile payload is not a string record', async () => {
    const store = new SecretStore({ safeStorage: safe, filePath });
    const invalid = safe.encryptString(JSON.stringify({ password: 123 })).toString('base64');
    await writeFile(filePath, JSON.stringify({ p1: invalid }), 'utf8');
    await expect(store.getSecrets('p1')).rejects.toThrow('must be a string');
  });
});
