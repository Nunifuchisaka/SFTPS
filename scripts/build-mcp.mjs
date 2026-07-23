// MCP サーバー（src/mcp-server/index.ts）を単一ファイルへバンドルするビルドスクリプト。
//
// electron-vite の UserConfig は main/preload/renderer の3つ固定で4つ目のターゲットを
// 追加できず、かつ src/core・src/main は拡張子なしの相対 import（Rollup バンドル前提）を
// 使っているため、素の tsc 出力を node/electron で直接実行すると ERR_MODULE_NOT_FOUND になる。
// そのため esbuild で src/mcp-server/index.ts を out/mcp-server/index.mjs へバンドルする。
//
// electron 本体や basic-ftp 等の実パッケージは packages: 'external' で外部化し、
// src/core・src/main の一次コードだけをバンドルする。
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

await build({
  entryPoints: [resolve(root, 'src/mcp-server/index.ts')],
  outfile: resolve(root, 'out/mcp-server/index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
