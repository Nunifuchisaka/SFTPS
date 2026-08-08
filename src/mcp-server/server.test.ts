import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { SftpProfile, Profile } from '../core/profile/index';
import type { HistoryInput } from '../core/history/index';
import { createMcpServer, type McpAppService, type McpKnownHosts } from './server';
import { createHostKeyRejectionTracker } from './host-key-bridge';

const sftpProfile: SftpProfile = {
  id: 's1',
  name: 'My SFTP',
  protocol: 'sftp',
  host: 'sftp.example.com',
  port: 22,
  user: 'bob',
};

function fakeAppService(overrides: Partial<McpAppService> = {}): McpAppService {
  return {
    listProfiles: vi.fn(async () => [sftpProfile] as Profile[]),
    saveProfile: vi.fn(async (input: Profile) => input),
    deleteProfile: vi.fn(async () => ({
      removedBookmarks: 0,
      removedHistory: 0,
      removedKnownHosts: 0,
      purgedBackupNamespaces: 0,
    })),
    testConnection: vi.fn(async () => ({ ok: true })),
    listRemote: vi.fn(async () => []),
    prepareUpload: vi.fn(async () => ({
      localPath: '/local',
      remotePath: '/remote',
      isNew: true,
      binary: false,
      afterSize: 3,
    })),
    commitUpload: vi.fn(async () => ({ backupPath: null, bytesWritten: 3 })),
    prepareDownload: vi.fn(async () => ({
      localPath: '/local',
      remotePath: '/remote',
      isNew: true,
      binary: false,
      afterSize: 3,
    })),
    download: vi.fn(async () => ({ backupPath: null, bytesWritten: 3 })),
    prepareSync: vi.fn(async () => ({
      plan: [],
      summary: { upload: 0, createDir: 0, skip: 0, deleteExtra: 0 },
      planToken: 'a'.repeat(64),
    })),
    commitSync: vi.fn(async () => ({
      result: { uploaded: 0, createdDirs: 0, skipped: 0, deleted: 0, backups: [], canceled: false },
      summary: { upload: 0, createDir: 0, skip: 0, deleteExtra: 0 },
    })),
    renameRemote: vi.fn(async () => undefined),
    deleteRemote: vi.fn(async () => undefined),
    chmodRemote: vi.fn(async () => undefined),
    listBackups: vi.fn(async () => []),
    restoreBackup: vi.fn(async () => ({ bytesWritten: 3, backupPath: null })),
    ...overrides,
  };
}

function fakeKnownHosts(overrides: Partial<McpKnownHosts> = {}): McpKnownHosts {
  return {
    list: vi.fn(() => []),
    lookup: vi.fn(() => null),
    trust: vi.fn(async () => undefined),
    remove: vi.fn(async () => true),
    ...overrides,
  };
}

async function connectedClient(deps: {
  service?: McpAppService;
  knownHosts?: McpKnownHosts;
  history?: { append: (input: HistoryInput) => void };
}) {
  const rejections = createHostKeyRejectionTracker();
  const server = createMcpServer({
    service: deps.service ?? fakeAppService(),
    knownHosts: deps.knownHosts ?? fakeKnownHosts(),
    history: deps.history ?? { append: () => undefined },
    rejections,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, rejections };
}

function firstText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  const first = content[0];
  if (!first || first.type !== 'text' || typeof first.text !== 'string') {
    throw new Error('expected a text content block');
  }
  return first.text;
}

describe('createMcpServer tools', () => {
  it('exposes every tool from the plan', async () => {
    const { client } = await connectedClient({});
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'chmod_remote',
        'delete_profile',
        'delete_remote',
        'download',
        'list_backups',
        'list_known_hosts',
        'list_profiles',
        'list_remote',
        'preview_download',
        'preview_sync',
        'preview_upload',
        'remove_host_key',
        'rename_remote',
        'restore_backup',
        'save_profile',
        'sync',
        'test_connection',
        'trust_host_key',
        'upload',
      ].sort(),
    );
  });

  it('list_profiles returns the profiles from AppService as JSON', async () => {
    const { client } = await connectedClient({});
    const result = await client.callTool({ name: 'list_profiles', arguments: {} });
    expect(JSON.parse(firstText(result))).toEqual([sftpProfile]);
  });

  it('save_profile forwards clearSecrets only when provided', async () => {
    const service = fakeAppService();
    const { client } = await connectedClient({ service });
    await client.callTool({
      name: 'save_profile',
      arguments: { profile: { ...sftpProfile, password: 'x' } },
    });
    expect(service.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), {});

    await client.callTool({
      name: 'save_profile',
      arguments: { profile: { ...sftpProfile }, clearSecrets: ['password'] },
    });
    expect(service.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
      { clearSecrets: ['password'] },
    );
  });

  it('delete_profile rejects an unknown protocol via zod before reaching AppService', async () => {
    const service = fakeAppService();
    const { client } = await connectedClient({ service });
    const result = await client.callTool({ name: 'delete_profile', arguments: { id: 's1' } });
    expect(result.isError).toBeFalsy();
    expect(service.deleteProfile).toHaveBeenCalledWith('s1', {});
  });

  it('test_connection enriches a hostkey failure into a HostKeyTrustRequiredError message', async () => {
    const service = fakeAppService({
      testConnection: vi.fn(async () => ({ ok: false, error: 'Host denied (verification failed)' })),
    });
    const { client, rejections } = await connectedClient({ service });
    rejections.record({
      host: 'sftp.example.com',
      port: 22,
      fingerprint: 'SHA256:abc',
      verdict: 'unknown',
      knownFingerprint: null,
    });

    const result = await client.callTool({ name: 'test_connection', arguments: { id: 's1' } });
    const parsed = JSON.parse(firstText(result)) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('trust_host_key');
    expect(parsed.error).toContain('SHA256:abc');
  });

  it('list_remote surfaces a HostKeyTrustRequiredError as a tool error when hostkey-rejected', async () => {
    const service = fakeAppService({
      listRemote: vi.fn(async () => {
        throw new Error('Host denied (verification failed)');
      }),
    });
    const { client, rejections } = await connectedClient({ service });
    rejections.record({
      host: 'sftp.example.com',
      port: 22,
      fingerprint: 'SHA256:abc',
      verdict: 'unknown',
      knownFingerprint: null,
    });

    const result = await client.callTool({ name: 'list_remote', arguments: { id: 's1', remoteDir: '/' } });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('trust_host_key');
  });

  it('upload records a success entry in history via the append gateway', async () => {
    const entries: HistoryInput[] = [];
    const { client } = await connectedClient({ history: { append: (input) => entries.push(input) } });

    await client.callTool({
      name: 'upload',
      arguments: { id: 's1', localPath: '/local/a.txt', remotePath: '/a.txt' },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'upload', profileId: 's1', path: '/a.txt', status: 'success' });
  });

  it('upload records a failure entry and surfaces the error when commitUpload throws', async () => {
    const entries: HistoryInput[] = [];
    const service = fakeAppService({
      commitUpload: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });
    const { client } = await connectedClient({ service, history: { append: (input) => entries.push(input) } });

    const result = await client.callTool({
      name: 'upload',
      arguments: { id: 's1', localPath: '/local/a.txt', remotePath: '/a.txt' },
    });

    expect(result.isError).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'upload', profileId: 's1', status: 'failed', error: 'disk full' });
  });

  it('trust_host_key rejects overwriting a different recorded fingerprint (mismatch guard)', async () => {
    const known = `SHA256:${'o'.repeat(43)}`;
    const requested = `SHA256:${'n'.repeat(43)}`;
    const knownHosts = fakeKnownHosts({ lookup: vi.fn(() => known) });
    const { client } = await connectedClient({ knownHosts });

    const result = await client.callTool({
      name: 'trust_host_key',
      arguments: { host: 'sftp.example.com', port: 22, fingerprint: requested },
    });

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('remove_host_key');
    expect(knownHosts.trust).not.toHaveBeenCalled();
  });

  it('trust_host_key succeeds for a genuinely unknown host', async () => {
    const requested = `SHA256:${'n'.repeat(43)}`;
    const knownHosts = fakeKnownHosts();
    const { client } = await connectedClient({ knownHosts });

    const result = await client.callTool({
      name: 'trust_host_key',
      arguments: { host: 'sftp.example.com', port: 22, fingerprint: requested },
    });

    expect(result.isError).toBeFalsy();
    expect(knownHosts.trust).toHaveBeenCalledWith('sftp.example.com', 22, requested);
  });

  it('remove_host_key and list_known_hosts pass through to the gateway', async () => {
    const knownHosts = fakeKnownHosts({ list: vi.fn(() => [{ host: 'h', port: 22, fingerprint: 'SHA256:x' }]) });
    const { client } = await connectedClient({ knownHosts });

    const listResult = await client.callTool({ name: 'list_known_hosts', arguments: {} });
    expect(JSON.parse(firstText(listResult))).toEqual([{ host: 'h', port: 22, fingerprint: 'SHA256:x' }]);

    const removeResult = await client.callTool({ name: 'remove_host_key', arguments: { host: 'h', port: 22 } });
    expect(JSON.parse(firstText(removeResult))).toEqual({ host: 'h', port: 22, removed: true });
    expect(knownHosts.remove).toHaveBeenCalledWith('h', 22);
  });
});
