import { app, safeStorage } from 'electron';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAppServices } from '../main/bootstrap';
import { createMcpServer } from './server';
import { createHostKeyRejectionTracker } from './host-key-bridge';

// このファイル配下では console.log を使わない。stdout は MCP の JSON-RPC 通信そのものであり、
// 余計な出力を混ぜるとクライアント側のハンドシェイクが壊れる。診断は console.error（stderr）のみ。

// GUI を持たないヘッドレスなメインプロセスのため、macOS の Dock にアイコンを出さない。
if (process.platform === 'darwin') app.dock?.hide();

void app
  .whenReady()
  .then(async () => {
    // app.whenReady() 解決後でないと safeStorage が使えないため、必ず Electron プロセスとして
    // 起動する（`electron out/mcp-server/index.mjs`。ELECTRON_RUN_AS_NODE は使わない）。
    const rejections = createHostKeyRejectionTracker();
    const services = await createAppServices({
      userData: app.getPath('userData'),
      safeStorage,
      // 開発用デフォルト値（.env）は GUI 専用の補助機能のため MCP では無効化する。
      appEnvPath: null,
      // confirmHostKey は未指定のまま（フェイルクローズ。ダイアログを出せない以上、常に拒否する）。
      onHostKeyRejected: rejections.record,
    });
    const server = createMcpServer({
      service: services.service,
      knownHosts: services.knownHosts,
      history: services.history,
      rejections,
    });
    await server.connect(new StdioServerTransport());
  })
  .catch((err: unknown) => {
    console.error('[funabinftp-mcp] fatal: failed to start', err);
    app.exit(1);
  });
