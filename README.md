# SFTPS

FTP / SFTP / Amazon S3 に対応した、クロスプラットフォーム（Windows / macOS）のデスクトップ FTP クライアントです。Electron 製で、アップロード時に **一文字単位の差分** を確認でき、上書き前に **自動バックアップ** を取ります。

## 特長

- **3 プロトコル対応**: FTP / FTPS（basic-ftp）、SFTP（ssh2-sftp-client）、Amazon S3（@aws-sdk/client-s3）を共通インタフェースで扱う
- **FTPS 明示/暗黙 TLS**: FTP は `ftpSecurity`（none=平文 / explicit=AUTH TLS / implicit=暗黙TLS）で選択。新規プロファイルの既定は安全側の explicit
- **一文字単位の差分ビュー**: アップロード前にローカルとリモートの差分を文字単位で色分け表示（追加=緑 / 削除=赤）。追加/削除文字数のサマリ付き。バイナリはサイズ比較に自動フォールバック
- **フォルダ再帰アップロード＋差分同期**: ローカルフォルダ配下を再帰的にたどり、変更があったファイルだけを転送。判定基準（サイズ / 更新時刻 / 両方）を選択でき、`.git`・`node_modules` 等は既定で除外。ミラー削除（余剰ファイル削除）は既定オフの明示オプション。同期プランを実行前にプレビュー可能
- **転送キュー＋リトライ**: アップロード/ダウンロード/同期をキューに投入し、同時実行数を制限しつつ処理。失敗時は指数バックオフで自動リトライ（最大試行回数まで）、進捗と状態をキューパネルに表示、まとめてキャンセル可能
- **一覧フィルタ・ソート・複数選択・D&D**: ファイルブラウザで名前フィルタ（大小無視・ディレクトリ優先）、名前/サイズ/日時の昇降ソート、チェックボックスでの複数選択と一括キュー投入、OSからのファイルドロップでアップロードキューへ追加
- **リモート操作（リネーム・削除確認・chmod）**: リモートのリネーム・削除（ディレクトリ/複数は強い確認）・パーミッション変更に対応。プロトコルの能力差（SFTP=rename+chmod / FTP=rename / S3=rename[copy+delete]、chmodはSFTPのみ）に応じてUIを出し分け
- **転送履歴ログ**: アップロード/ダウンロード/同期/リネーム/削除/chmod の成否を履歴に記録し、種別・状態でフィルタして閲覧・クリア可能。シークレットは履歴に一切残さない（ホワイトリスト構築＋混入検知）
- **ブックマーク（よく使うリモートパス）**: リモートペインから現在のパスをブックマークに登録し、一覧クリックでそのパスへ即移動。プロファイル単位で管理し、同一プロファイル内の同じパス（正規化後）は重複登録しない。並びは追加順、`userData/bookmarks.json` へ保存し、シークレットは一切書かない
- **チェックサム整合性検証**: 転送後に宛先を読み直してハッシュ比較する検証オプション（既定オフ・再readコストあり）。差分同期の比較基準に「チェックサム」を追加し、同一サイズでも内容差を厳密に検知
- **日本語 / 英語 i18n**: UI主要文言を辞書化し ja/en を切替可能（既定 日本語）。ロケール選択は localStorage に永続化、未対応ロケールは日本語へフォールバック
- **ダークモード**: ライト / ダーク / システム追従のテーマ切替。CSS 変数でトークン化し `data-theme` で切替、`prefers-color-scheme` を購読してシステム追従、選択は localStorage に永続化
- **タイムアウト・自動再接続**: プロファイルに接続タイムアウトを設定し各ライブラリのオプションへマップ。自動再接続を有効にすると、ネットワーク断/タイムアウト時に指数バックオフで接続を再確立（認証失敗など回復不能なエラーは即中止）
- **上書き前バックアップ**: 既存リモートファイルを上書きする前に自動でローカルへ退避。世代ローテーションと履歴からの復元に対応。フォルダ同期の上書きも同じくバックアップ対象
- **ダウンロード方向の差分・バックアップ**: リモートをローカルへ落とす際も、既存ローカルを上書きする前に差分プレビュー（既存ローカル=before/リモート新内容=after）とバックアップを提供。バックアップ保存先はアップロードと名前空間を分離して衝突を回避
- **安全なシークレット保管**: パスワード・秘密鍵・AWS シークレットは OS の暗号化（Windows: DPAPI / macOS: Keychain）を使う Electron `safeStorage` で暗号化して保存。プロファイル JSON には平文シークレットを一切書かない
- **プロファイル編集**: 既存プロファイルを選んでフォームに読み込み、編集して上書き保存できる。シークレット欄は編集時に読み込まず、空欄なら既存シークレットを据え置き（誤消去を防止）、入力時のみ更新
- **SFTP ホスト鍵検証（known_hosts）**: SFTP 接続時にサーバーのホスト鍵フィンガープリント（`SHA256:...`）を検証。既定は TOFU（初回のみ信頼して記録）、`strict` ポリシーでは既知の鍵のみ受理。鍵の不一致（MITM の疑い）は常に拒否。信頼済みの鍵は `userData/known_hosts.json` に保存

## 対応プロトコルと接続情報

| プロトコル | 必須項目 | シークレット（暗号化保存） |
|---|---|---|
| FTP / FTPS | host, port, user, ftpSecurity（none / explicit / implicit、既定 explicit） | password |
| SFTP | host, port, user（任意: hostKeyPolicy = tofu / strict） | password / privateKey / passphrase |
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
    download/            ダウンロード調整役（prepare/commit・方向別バックアップ名前空間）
    hostkey/             SFTP ホスト鍵検証（フィンガープリント・known_hosts・TOFU判定）
    sync/                フォルダ再帰走査・差分プランナー・実行器・除外ルール
    queue/               転送キュー（状態機械・指数バックオフ・進捗集計・並行実行）
    browse/              一覧フィルタ・ソート・選択状態・ドロップ対象解決（純粋）
    remoteops/           削除確認ガード・モード値検証・能力照会（純粋）
    history/             転送履歴ストア（append/list/clear・ローテーション・シークレット非混入・JSON）
    bookmark/            よく使うリモートパス（追加/削除/一覧/改名・重複防止・パス正規化・JSON）
    checksum/            ハッシュ計算・整合性検証（純粋）
    i18n/                翻訳辞書（ja/en）・翻訳関数・ロケール解決（純粋）
    theme/               テーマ解決（light/dark/system）・設定正規化（純粋）
    reconnect/           再接続方針・エラー分類・接続確立オーケストレーション（純粋）
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
