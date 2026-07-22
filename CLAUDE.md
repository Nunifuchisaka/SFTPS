# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

FunabinFTP は FTP / FTPS / SFTP / Amazon S3 に対応したクロスプラットフォーム（Windows / macOS）の Electron 製デスクトップ FTP クライアント。`electron-vite` でメイン・プリロード・レンダラの 3 ビルドを管理する TypeScript プロジェクト。

## よく使うコマンド

```sh
npm install         # 依存関係のインストール
npm run dev          # Electron + Vite の開発起動（HMR）
npm run build        # メイン/プリロード/レンダラを out/ へビルド
npm run start         # ビルド済みアプリをプレビュー起動（electron-vite preview）
npm run dist          # electron-builder でインストーラを生成（release/ へ出力）
npm test              # vitest run（全テスト実行）
npm run test:watch    # vitest（watch モード）
npm run typecheck      # tsc --noEmit
```

- 単一テストファイルの実行: `npx vitest run src/core/diff/diff.test.ts`
- テスト名で絞り込み: `npx vitest run -t "テスト名の一部"`
- テストは `src/**/*.test.ts`（および `tests/**/*.test.ts`）を対象に vitest（`environment: node`, `globals: true`）で実行する。テストファイルは実装ファイルと同じディレクトリに置く（例: `src/core/diff/diff.ts` ↔ `src/core/diff/diff.test.ts`）。

## アーキテクチャ

### レイヤー構成と依存方向

```
src/core/      UI/Electron 非依存の純粋ロジック（テストの主戦場）
src/main/      Electron メインプロセス（core をノード API に結線）
src/preload/   contextBridge 経由で window.api を公開する薄い層
src/renderer/  素の TypeScript + Vite の UI（DOM 直操作、フレームワーク不使用）
src/shared/    IPC 契約（型・チャンネル名）。main と preload/renderer の両方から参照される
```

`core/` はプロトコル別トランスポート（FTP/SFTP/S3/Local を共通インタフェース `RemoteTransport` に正規化）、差分計算、バックアップ、プロファイル、同期プランナー、転送キューなど、機能ごとにサブディレクトリを持つ。各サブディレクトリはほぼ `index.ts`（公開API）と実装・テストの組で構成され、Electron / Node の非純粋 API（fs, safeStorage 等）に依存しない設計になっている。純粋ロジックを `core/` に置き、Node 固有の実装（永続化ファイル、Electron API）は `main/` 側に置く分離が一貫している。

### プロセス間通信（IPC）

- `src/shared/ipc.ts` が IPC チャンネル名（`IPC` 定数）とレンダラに公開される型付き API（`FunabinFtpApi` インタフェース）の単一の真実源。
- `src/preload/index.ts` は `FunabinFtpApi` の各メソッドを `ipcRenderer.invoke(IPC.xxx, ...)` にそのままマッピングし、`contextBridge.exposeInMainWorld('api', api)` で `window.api` として公開する（`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`）。
- `src/main/ipc/handlers.ts` が実際のハンドラ実装（`createIpcHandlers`）、`src/main/ipc/register.ts` はそれを `ipcMain.handle` へ結線するだけの薄い層（ロジックを持たせない）。
- 新しい IPC 操作を追加する際は、`shared/ipc.ts` にチャンネル名・型を足し → `preload/index.ts` に転送コードを足し → `main/ipc/handlers.ts`（+ `register.ts`）にハンドラを足す、という 3 点セットになる。

### メインプロセスの構成（DI 結線）

`src/main/index.ts` の `boot()` が起動時の組み立て役。永続化ストア（`ProfileStore` / `SecretStore` / `HistoryFile` / `BookmarkFile` / `SettingsFile` / `KnownHostsFile`）を `app.getPath('userData')` 配下の JSON ファイルとして開き、`AppService`（`src/main/app-service.ts`）へ依存として注入する。`AppService` は Electron / `ipcMain` に依存しない純粋なアプリケーションサービスで、単体テスト可能。

- `transport-factory.ts`: プロファイルとシークレットから実際のトランスポートクライアント（basic-ftp / ssh2-sftp-client / @aws-sdk/client-s3 / ローカルFS）を組み立て、`core/transport` のアダプタでラップする。
- `transfer-queue-factory.ts`: `core/queue` の `TransferQueue` を `AppService` の転送メソッド（upload/download/sync）に結線するファクトリ。
- SFTP のホスト鍵検証（TOFU/strict）は `core/hostkey` の純粋ロジックと `main/known-hosts-store.ts` / `known-hosts-controller.ts` の永続化を組み合わせ、未知の鍵はダイアログでユーザーの明示同意を得るまで接続しない。
- 永続ファイルはすべて temp+rename のアトミック書き込み・`mode 0o600` で保存する。

### 転送キュー

`core/queue` がアップロード/ダウンロード/同期をキュー投入・並行実行数制限・指数バックオフ再試行・進捗集計まで担う状態機械（Electron 非依存）。実行本体（`runTask`）は `main/transfer-queue-factory.ts` が `AppService` のメソッドへディスパッチする形で注入される。キャンセルは `AbortSignal` をタスク実行まで伝播させる。完了タスクは保持上限（既定 200 件）を超えると破棄されるが、破棄前に `TerminalTaskRecorder`（`main/history-recorder.ts`）が転送履歴へ記録してから捨てる。

### レンダラの構成

フレームワークを使わず、素の TypeScript + DOM API で構築する。`src/renderer/app.ts` が単一の状態オブジェクト（`State`）を保持し再描画するメインループで、`diff-view.ts` / `sync-view.ts` / `history-view.ts` / `bookmark-view.ts` / `known-hosts-view.ts` / `profile-form.ts` / `bulk-transfer.ts` / `dnd.ts` などの機能別ビューモジュールに描画・入力処理を分割している。ビジネスロジック（差分整形、選択状態、D&D 判定、確認ガード等）は極力 `core/` の純粋関数をそのまま呼び出し、レンダラ側には状態管理とDOM操作のみを持たせる。`window.api`（`FunabinFtpApi`）経由でのみメインプロセスと通信する。

### ビルド出力

`electron.vite.config.ts` により、メインは ESM（`out/main/index.mjs`）、プリロードのみ CJS（`out/preload/index.cjs`）で出力する。`sandbox: true` のレンダラは ESM プリロードを読み込めないという Electron の制約のため。`electron-builder.yml` で macOS（dmg/zip, x64+arm64）と Windows（nsis, x64）向けの配布物を `release/` へ生成する。
