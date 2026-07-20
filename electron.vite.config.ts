import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// メイン / プリロード / レンダラの3ビルドを一括管理する。
// メイン・プリロードは ESM(.mjs) で出力し（Electron 43 は ESM 対応）、
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
        output: { entryFileNames: 'index.mjs', format: 'es' },
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
