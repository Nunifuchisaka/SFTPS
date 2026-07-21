import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// メイン / プリロード / レンダラの3ビルドを一括管理する。
// メインは ESM(.mjs)、プリロードは CJS(.cjs) で出力する。
// sandbox: true のレンダラでは ESM プリロードを読み込めないため（Electron の制約）、
// プリロードのみ CommonJS に落としてサンドボックスを有効化している。
// ランタイム依存（basic-ftp 等）は externalizeDepsPlugin で外部化する。
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve('src/main/index.ts'),
        output: { entryFileNames: 'index.mjs', format: 'es' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: { entryFileNames: 'index.cjs', format: 'cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
});
