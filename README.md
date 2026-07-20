# SFTPS

FTP / SFTP / Amazon S3 に対応した、クロスプラットフォーム（Windows / macOS）のデスクトップ FTP クライアントです。Electron 製で、アップロード時に **一文字単位の差分** を確認でき、上書き前に **自動バックアップ** を取ります。

## 特長

- **3 プロトコル対応**: FTP / FTPS（basic-ftp）、SFTP（ssh2-sftp-client）、Amazon S3（@aws-sdk/client-s3）を共通インタフェースで扱う
- **一文字単位の差分ビュー**: アップロード前にローカルとリモートの差分を文字単位で色分け表示（追加=緑 / 削除=赤）。追加/削除文字数のサマリ付き。バイナリはサイズ比較に自動フォールバック
- **上書き前バックアップ**: 既存リモートファイルを上書きする前に自動でローカルへ退避。世代ローテーションと履歴からの復元に対応
- **安全なシークレット保管**: パスワード・秘密鍵・AWS シークレットは OS の暗号化（Windows: DPAPI / macOS: Keychain）を使う Electron `safeStorage` で暗号化して保存。プロファイル JSON には平文シークレットを一切書かない

## 対応プロトコルと接続情報

| プロトコル | 必須項目 | シークレット（暗号化保存） |
|---|---|---|
| FTP / FTPS | host, port, user, secure | password |
| SFTP | host, port, user | password / privateKey / passphrase |
| S3 | region, bucket, accessKeyId | secretAccessKey / sessionToken |

## 動作要件

- Node.js 24 以上（開発時）
- Windows 10/11 または macOS

## セットアップ

```sh
npm install
```

## 開発

```sh
npm run dev        # Electron + Vite の開発起動（HMR）
npm test           # Vitest でテスト実行
npm run typecheck  # tsc --noEmit で型チェック
```

## ビルド

```sh
npm run build      # メイン / プリロード / レンダラを out/ へバンドル（electron-vite）
npm run start      # ビルド済みアプリをプレビュー起動（electron-vite preview）
npm run dist       # electron-builder でインストーラを生成（下記参照）
```

### インストーラ生成（`npm run dist`）

`electron-builder.yml` で以下をターゲットにしています。

- **macOS**: dmg / zip（x64 + arm64）… ※ dmg の実生成には macOS 環境が必要
- **Windows**: nsis インストーラ（x64）

Windows 上では Windows ターゲットのみ実ビルド可能です。macOS ターゲットは設定のみで、実際の dmg 生成は macOS 上で行ってください。生成物は `release/` に出力されます（`--dir` を付けるとインストーラを作らずアプリディレクトリのみ生成できます）。

## セキュリティ設計

- `contextIsolation: true` / `nodeIntegration: false`
- レンダラには `contextBridge` 経由で型付きの最小 API（`window.api`）のみを公開。レンダラから任意の FS 操作や任意コマンドは実行できない
- シークレットは `safeStorage` で暗号化し `userData` 配下の別ファイルへ保存。暗号化が利用できない環境では、シークレットを含むプロファイルの保存を拒否する
- レンダラ HTML に Content-Security-Policy を設定

## プロジェクト構成

```
src/
  core/                UI/Electron 非依存の純粋ロジック（フェーズA）
    transport/           プロトコルアダプタ（Ftp/Sftp/S3/Local）+ 共通インタフェース
    diff/                一文字差分・バイナリ判定・BOM 除去・サマリ
    backup/              上書き前バックアップ・世代管理・復元
    profile/             接続プロファイル型・検証・シークレット分離
    upload/              アップロード調整役（prepare/commit）
  main/                Electron メインプロセス
    index.ts             ウィンドウ生成・ライフサイクル・DI 結線
    app-service.ts       IPC ハンドラの実体（純粋・テスト可能）
    secret-store.ts      safeStorage による暗号化保管
    profile-store.ts     プロファイル JSON 永続化
    transport-factory.ts 実クライアント → アダプタの結線
    ipc/register.ts      ipcMain.handle への薄い結線
  preload/             contextBridge による window.api 公開
  renderer/            素の TypeScript + Vite の UI
    diff-view.ts         差分セグメント → DOM 生成（純粋）
    app.ts               画面ロジック
  shared/ipc.ts        IPC 契約（型・チャンネル名）
```

## テスト方針

実サーバー接続・実アップロードは行いません。トランスポートアダプタはフェイククライアントを注入して「ライブラリ API ↔ 共通インタフェース変換」を検証し、バックアップ・差分・アップロードの統合は実ファイル I/O（`LocalTransport`）でモックなしに検証します。`safeStorage` はフェイク注入でテストします。
