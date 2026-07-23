# FunabinFTP

FTP / SFTP / Amazon S3 に対応した、クロスプラットフォーム（Windows / macOS）のデスクトップ FTP クライアントです。Electron 製で、アップロード時に **一文字単位の差分** を確認でき、上書き前に **自動バックアップ** を取ります。

## 特長

- **3 プロトコル対応**: FTP / FTPS（basic-ftp）、SFTP（ssh2-sftp-client）、Amazon S3（@aws-sdk/client-s3）を共通インタフェースで扱う
- **FTPS 明示/暗黙 TLS**: FTP は `ftpSecurity`（none=平文 / explicit=AUTH TLS / implicit=暗黙TLS）で選択。新規プロファイルの既定は安全側の explicit。プロファイル編集で TLS モードを切り替えると、標準ポートのままの場合のみ 21⇔990 を自動補正する（手動指定したポートは維持）
- **一文字単位の差分ビュー**: アップロード前にローカルとリモートの差分を文字単位で色分け表示（追加=緑 / 削除=赤）。追加/削除文字数のサマリ付き。バイナリはサイズ比較に自動フォールバック。文字差分には**サイズ上限**（既定 1MB・設定で変更可）があり、超えるファイルは差分を計算せず「大きすぎるため差分表示を省略しました」とサイズ比較のみ表示する
- **フォルダ再帰アップロード＋差分同期**: ローカルフォルダ配下を再帰的にたどり、変更があったファイルだけを転送。判定基準（サイズ / 更新時刻 / 両方）を選択でき、`.git`・`node_modules` 等は既定で除外。同期の実行（直接実行・キュー投入とも）は必ずプラン作成（プレビュー）を経て内容を確認してから確定する
- **ミラー削除の安全装置**: ミラー削除（余剰ファイル削除）は既定オフの明示オプション。有効時は削除件数と対象パスを提示する強い確認を必須とし、削除前にも各ファイルのバックアップを取得（深い階層から削除するため、ディレクトリ配下のファイルも取り漏らさない）。同期先が空欄（＝サーバールート起点）の場合は常に拒否し、ルート `/` 指定はミラー削除有効時に拒否・無効時は警告。この検証はメインプロセス側でも行うため、キュー経由でも回避できない
- **転送キュー＋リトライ**: アップロード/ダウンロード/同期をキューに投入し、同時実行数を制限しつつ処理。失敗時は指数バックオフで自動リトライ（最大試行回数まで）、進捗と状態をキューパネルに表示。キャンセルはキューの AbortSignal を転送処理まで伝播させ、未着手タスクは即時、実行中の同期は次のファイルへ進まずに停止する（書き込み中の 1 ファイルは完了する。この挙動は UI にも明記）。完了タスクは直近 200 件だけ保持して古いものから破棄し（長時間運用でのメモリと IPC ペイロードの単調増加を防ぐ）、破棄前に必ず転送履歴へ記録する。「完了分をクリア」で手動一括破棄も可能
- **一覧フィルタ・ソート・複数選択・D&D**: ファイルブラウザで名前フィルタ（大小無視・ディレクトリ優先）、名前/サイズ/日時の昇降ソート、チェックボックスでの複数選択と一括キュー投入、OSからのファイルドロップでアップロードキューへ追加
- **リモート操作（リネーム・削除確認・chmod）**: リモートのリネーム・削除（ディレクトリ/複数は強い確認）・パーミッション変更に対応。プロトコルの能力差（SFTP=rename+chmod / FTP=rename / S3=rename[copy+delete]、chmodはSFTPのみ）に応じてUIを出し分け
- **転送履歴ログ**: アップロード/ダウンロード/同期/リネーム/削除/chmod の成否を履歴に記録し、種別・状態でフィルタして閲覧・クリア可能。シークレットは履歴に一切残さない（ホワイトリスト構築＋混入検知）
- **ブックマーク（よく使うリモートパス）**: リモートペインから現在のパスをブックマークに登録し、一覧クリックでそのパスへ即移動。プロファイル単位で管理し、同一プロファイル内の同じパス（正規化後）は重複登録しない。並びは追加順、`userData/bookmarks.json` へ保存し、シークレットは一切書かない
- **チェックサム整合性検証**: 転送後に宛先を読み直してハッシュ比較する検証オプション（既定オフ・再readコストあり）。差分同期の比較基準に「チェックサム」を追加し、同一サイズでも内容差を厳密に検知
- **日本語 / 英語 i18n**: UI主要文言を辞書化し ja/en を切替可能（既定 日本語）。ロケール選択は localStorage に永続化、未対応ロケールは日本語へフォールバック
- **ダークモード**: ライト / ダーク / システム追従のテーマ切替。CSS 変数でトークン化し `data-theme` で切替、`prefers-color-scheme` を購読してシステム追従、選択は localStorage に永続化
- **タイムアウト・自動再接続**: プロファイルに接続タイムアウトを設定し各ライブラリのオプションへマップ。自動再接続を有効にすると、ネットワーク断/タイムアウト時に指数バックオフで接続を再確立。認証失敗に加えて **ホスト鍵検証失敗・TLS 証明書検証失敗は再試行不可**として即中止し（MITM 疑いの相手へ自動で再ダイヤルしない）、専用の警告文言で提示する
- **上書き前バックアップ＋保持ポリシー**: 既存リモートファイルを上書きする前に自動でローカルへ退避。世代ローテーションと履歴からの復元に対応。フォルダ同期の上書き・ミラー削除も同じくバックアップ対象。復元も「現行リモートの上書き」であるため、復元前に現在の内容をバックアップし、世代日時とサイズを提示して確認を取る。保持は**世代数（既定 20）と保持日数（既定 無期限）**を設定パネルから変更でき、保持日数を設定すると期限超過分は起動時と設定変更時に全名前空間を走査して削除される
- **プロファイル削除時のデータ掃除**: プロファイルを削除すると、プロファイル JSON とシークレットは必ず消える。ブックマーク・転送履歴・信頼済みホスト鍵（＝削除した接続先のパス情報）を併せて消すかは削除時に確認し、**バックアップ（ファイル本体・復旧手段）はさらに別の確認**で明示同意した場合のみ削除する。他のプロファイルがまだ使っているホスト鍵は残す
- **ダウンロード方向の差分・バックアップ**: リモートをローカルへ落とす際も、既存ローカルを上書きする前に差分プレビュー（既存ローカル=before/リモート新内容=after）とバックアップを提供。バックアップ保存先はアップロードと名前空間を分離して衝突を回避
- **安全なシークレット保管**: パスワード・秘密鍵・AWS シークレットは OS の暗号化（Windows: DPAPI / macOS: Keychain）を使う Electron `safeStorage` で暗号化して保存。プロファイル JSON には平文シークレットを一切書かない
- **プロファイル編集**: 既存プロファイルを選んでフォームに読み込み、編集して上書き保存できる。シークレット欄は編集時に読み込まず、保存時は項目ごとに既存シークレットとマージする（空欄＝据え置き / 入力＝その項目のみ更新）。保存済みシークレットを消すのはフォームの「保存済みの〜を削除」チェックによる明示操作のみで、実行前に確認ダイアログを挟む
- **SFTP ホスト鍵検証（known_hosts・明示同意）**: SFTP 接続時にサーバーのホスト鍵フィンガープリント（`SHA256:...`）を検証。既定は TOFU だが、**未知の鍵は無言で受理せず、指紋を提示するダイアログでユーザーの明示同意を得るまで接続しない**（同意しなければ接続拒否。ダイアログを出せない場合も拒否＝フェイルクローズ）。`strict` ポリシーでは確認もせず既知の鍵のみ受理。鍵の不一致（MITM の疑い）は常に拒否し、記録済み指紋と今回の指紋を併記して警告する。信頼済みの鍵は `userData/known_hosts.json` に保存
- **信頼済みホスト鍵の管理UI**: 信頼済みホスト（`host:port` と指紋）を一覧表示し、個別に信頼を取り消せる。サーバーを正当に再構築して指紋が変わった場合も、`known_hosts.json` を手編集せず「信頼を取り消す → 再接続して指紋を確認 → 再信頼」で復帰できる

## 対応プロトコルと接続情報

| プロトコル | 必須項目 | シークレット（暗号化保存） |
|---|---|---|
| FTP / FTPS | host, port, user, ftpSecurity（none / explicit / implicit、既定 explicit） | password |
| SFTP | host, port, user（任意: hostKeyPolicy = tofu / strict） | password / privateKey / passphrase |
| S3 | region, bucket, accessKeyId（または「マシンの既定資格情報を使う」の明示オプトイン） | secretAccessKey / sessionToken |

S3 で Access Key ID / Secret Access Key を設定しない場合、**「マシンの既定資格情報を使う（環境変数 / `~/.aws/credentials` / IMDS）」に明示的にチェックを入れないと接続できません**。チェックを入れると AWS SDK の既定資格情報チェーンが使われるため、意図せず広い権限のマシン資格情報で本番バケットへ書き込まないよう、対象バケットと権限を確認したうえで有効にしてください。

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
npm run build:mcp  # MCP サーバーを out/mcp-server/index.mjs へバンドル（esbuild、下記参照）
npm run start      # ビルド済みアプリをプレビュー起動（electron-vite preview）
npm run dist       # electron-builder でインストーラを生成（下記参照）
```

### インストーラ生成（`npm run dist`）

`electron-builder.yml` で以下をターゲットにしています。

- **macOS**: dmg / zip（x64 + arm64）… ※ dmg の実生成には macOS 環境が必要
- **Windows**: nsis インストーラ（x64）

Windows 上では Windows ターゲットのみ実ビルド可能です。macOS ターゲットは設定のみで、実際の dmg 生成は macOS 上で行ってください。生成物は `release/` に出力されます（`--dir` を付けるとインストーラを作らずアプリディレクトリのみ生成できます）。

## MCP サーバー

Claude Code や Codex CLI のような AI コーディングエージェントから、このアプリが管理する FTP / FTPS / SFTP / S3 接続を直接操作できるようにする MCP（Model Context Protocol）サーバーを同梱しています（`src/mcp-server/`）。GUI とは独立した**ヘッドレスな Electron メインプロセス**として動作し、標準入出力（stdio）で JSON-RPC 通信します。プロファイル・シークレット・バックアップ・転送履歴・信頼済みホスト鍵は GUI と同じ `userData` 配下のファイルを共有します（キャッシュや別データベースは持ちません）。

### ビルド

```sh
npm run build:mcp
```

`out/mcp-server/index.mjs` に単一ファイルとしてバンドルされます（esbuild、`electron` 本体や `basic-ftp` 等の実パッケージは外部化）。

### 登録方法

**重要**: `command` は必ず Electron 本体（`node_modules/.bin/electron`）を指定してください。`node` では `safeStorage`（OS 資格情報暗号化）が使えず起動できません。同様に `ELECTRON_RUN_AS_NODE=1` を設定した状態で起動することも避けてください（同じ理由で `electron` の import 自体が壊れます）。

Claude Code（`.mcp.json`、リポジトリのパスは適宜書き換えてください）:

```json
{
  "mcpServers": {
    "funabinftp": {
      "command": "/absolute/path/to/FunabinFTP/node_modules/.bin/electron",
      "args": ["/absolute/path/to/FunabinFTP/out/mcp-server/index.mjs"]
    }
  }
}
```

Codex CLI（`~/.codex/config.toml`）:

```toml
[mcp_servers.funabinftp]
command = "/absolute/path/to/FunabinFTP/node_modules/.bin/electron"
args = ["/absolute/path/to/FunabinFTP/out/mcp-server/index.mjs"]
```

### 提供ツール

- **プロファイル管理**: `list_profiles` / `save_profile` / `delete_profile`
  - `save_profile` はシークレット項目（`password` / `privateKey` / `passphrase` / `secretAccessKey` / `sessionToken`）を省略すると既存値を据え置きます（GUI と同じ挙動）。明示的に削除したい項目のみ `clearSecrets` に列挙してください
- **接続・閲覧**: `test_connection` / `list_remote`
- **転送**（プレビューとコミットを別ツールに分離）: `preview_upload` / `upload`、`preview_download` / `download`、`preview_sync` / `sync`、`rename_remote` / `delete_remote` / `chmod_remote`
- **バックアップ**: `list_backups` / `restore_backup`
- **ホスト鍵信頼**: `trust_host_key` / `remove_host_key` / `list_known_hosts`

### SFTP ホスト鍵のフェイルクローズと信頼フロー

MCP サーバーには指紋確認ダイアログがないため、未知の SFTP ホスト鍵は**常に自動拒否**します（GUI の TOFU 同意ダイアログに相当する確認手段が無い以上、無言で受理しないフェイルクローズ）。`test_connection` や `list_remote` 等の接続系ツールがホスト鍵拒否で失敗すると、エラーメッセージに `trust_host_key` の呼び出しにそのまま使えるフィンガープリント情報が含まれるので、それを使って明示的に信頼してから再実行してください。

鍵が変更されていた場合（`mismatch`。サーバー再構築や MITM の疑い）は、安全のため `trust_host_key` 単体では絶対に上書きできません。先に `remove_host_key` を呼んでから、新しい指紋で `trust_host_key` を呼ぶ 2 段階の操作が必須です。

### 履歴記録の扱い

MCP 経由の `upload` / `download` / `sync` は GUI の転送キューを経由しないため、結果を直接転送履歴へ記録します。GUI の「転送履歴」画面から MCP 経由の操作も確認できます。

## セキュリティ設計

- `contextIsolation: true` / `nodeIntegration: false` / **`sandbox: true`**
  - サンドボックス有効化のため、プリロードのみ CJS（`out/preload/index.cjs`）で出力している（サンドボックス下のレンダラは ESM プリロードを読み込めないため）。メインは従来どおり ESM（`out/main/index.mjs`）
- レンダラには `contextBridge` 経由で型付きの最小 API（`window.api`）のみを公開。レンダラから任意の FS 操作や任意コマンドは実行できない
- **遷移・新規ウィンドウの既定拒否**: `web-contents-created` で `will-navigate` と `setWindowOpenHandler` を握り、許可した宛先（パッケージ済みレンダラの `index.html`、開発時は `ELECTRON_RENDERER_URL` と同一 origin）以外への遷移と `window.open` をすべて拒否する。判定は純粋関数（`core/security/navigation.ts`）でテスト済み
- シークレットは `safeStorage` で暗号化し `userData` 配下の別ファイルへ保存。暗号化が利用できない環境では、シークレットを含むプロファイルの保存を拒否する
- プロファイル JSON は書き出し側だけでなく**読み込み側でもシークレットを除去**する（旧版・手編集で混入していても平文がレンダラへ渡らない。混入はキー名のみログに残し値は残さない）
- プロファイル ID は `[A-Za-z0-9._-]{1,64}`（`.` / `..` を除く）に制限。バックアップ保存先の名前空間側でも消毒し、`backups/` の外へ出られないようにする（二重防御）
- 永続ファイル（profiles / secrets / known_hosts / history / bookmarks）は **temp＋rename のアトミック書き込み・`mode 0o600`**。クラッシュによる切り詰め破損と、同一マシンの他ユーザーからの読み取りを防ぐ
- `known_hosts.json` の読み込みは **ENOENT（初回起動）のみ空で開始**し、破損・権限エラーは空扱いにせず起動時エラーとして提示して終了する（ピン留めの実質バイパスを防ぐ）
- **バックアップは暗号化されずローカル（`userData/backups`）に平文で保存される**。`.env` や `wp-config.php` のような資格情報入りファイルを一度でも上書きすると、その内容がバックアップとして残る。設定パネルの「バックアップ保持日数」を設定すると期限超過分を削除でき（0 で無期限）、世代数の上限も変更できる。保持ポリシーは起動時と設定変更時にバックアップ全体へ適用される
- **S3 の既定資格情報チェーンは明示オプトイン**。資格情報未設定時に AWS SDK の既定チェーン（環境変数 / `~/.aws/credentials` / IMDS）へ黙って落ちると、意図しないマシン資格情報で本番バケットへ書き込みかねないため、プロファイルで明示的に有効化しない限り接続を拒否する（フェイルクローズ）
- **差分プレビューのサイズ上限**。文字単位 diff は O(N×M) でメインプロセス上を走るため、上限（既定 1MB）を超えるファイルは差分計算を行わずサイズ比較へフォールバックする（巨大ファイルや悪意あるサーバー応答でメインプロセスを固めさせない）
- `app.requestSingleInstanceLock()` で単一インスタンス化（二重起動による永続ファイルの後勝ち破壊を防ぐ）
- レンダラ HTML に Content-Security-Policy を設定（`default-src 'self'` に加え `base-uri 'none'` / `form-action 'none'` / `object-src 'none'` / `frame-ancestors 'none'`）
  - `frame-ancestors` は仕様上 `<meta>` 経由では無視され、起動時にその旨の警告がコンソールへ出る。実効的な埋め込み防止は「外部 origin への遷移と `window.open` の既定拒否」で担保している

## プロジェクト構成

```
src/
  core/                UI/Electron 非依存の純粋ロジック（フェーズA）
    transport/           プロトコルアダプタ（Ftp/Sftp/S3/Local）+ 共通インタフェース
    diff/                一文字差分・バイナリ判定・BOM 除去・サマリ
    backup/              上書き前バックアップ・世代/期間の保持ポリシー・復元・復元確認ガード（純粋）
    profile/             接続プロファイル型・検証・シークレット分離/マージ（据え置き・更新・明示クリア）・削除計画・S3資格情報解決
    settings/            アプリ設定（バックアップ保持ポリシー・差分上限）の正規化と入出力（純粋）
    upload/              アップロード調整役（prepare/commit）
    download/            ダウンロード調整役（prepare/commit・方向別バックアップ名前空間）
    hostkey/             SFTP ホスト鍵検証（フィンガープリント・known_hosts・TOFU判定）
    sync/                フォルダ再帰走査・差分プランナー・実行器・除外ルール・同期先検証/ミラー削除確認ガード（純粋）
    queue/               転送キュー（状態機械・指数バックオフ・進捗集計・並行実行・完了保持上限・駆動器）
    browse/              一覧フィルタ・ソート・選択状態・ドロップ対象解決（純粋）
    remoteops/           削除確認ガード・モード値検証・能力照会（純粋）
    history/             転送履歴ストア（append/list/clear・ローテーション・シークレット非混入・JSON）
    bookmark/            よく使うリモートパス（追加/削除/一覧/改名・重複防止・パス正規化・JSON）
    checksum/            ハッシュ計算・整合性検証（純粋）
    i18n/                翻訳辞書（ja/en）・翻訳関数・ロケール解決（純粋）
    theme/               テーマ解決（light/dark/system）・設定正規化（純粋）
    reconnect/           再接続方針・エラー分類（認証/ホスト鍵/証明書/一過性）・接続確立（純粋）
    security/            遷移許可判定（既定拒否・ホワイトリスト）（純粋）
  main/                Electron メインプロセス
    index.ts             ウィンドウ生成・ライフサイクル・単一インスタンス・遷移制御（bootstrap を呼ぶ薄い層）
    bootstrap.ts          GUI/MCP 共通の DI 組み立て（createAppServices）
    app-service.ts       IPC ハンドラの実体（純粋・テスト可能）
    atomic-write.ts      temp+rename・mode 0600 の共通アトミック書き込み
    secret-store.ts      safeStorage による暗号化保管
    profile-store.ts     プロファイル JSON 永続化
    known-hosts-store.ts known_hosts 永続化（ENOENT 以外はフェイルクローズ）
    known-hosts-controller.ts 信頼済みホスト鍵の参照・信頼・取り消し
    settings-store.ts    アプリ設定 JSON 永続化
    settings-controller.ts 設定の現在値保持・保存・実行中アプリへの反映
    history-recorder.ts  終端タスク → 履歴入力の変換・重複排除記録（純粋）
    transport-factory.ts 実クライアント → アダプタの結線
    ipc/handlers.ts      IPC ハンドラの実体（ipcMain 非依存・テスト可能）
    ipc/register.ts      ipcMain.handle への薄い結線
  mcp-server/          ヘッドレス Electron プロセスとして動く MCP サーバー（AI エージェント向け）
    index.ts             エントリポイント（app.whenReady() → bootstrap → stdio 起動）
    server.ts             McpServer 組み立て・全ツール登録
    errors.ts              HostKeyTrustRequiredError（trust_host_key 誘導つきエラー整形）
    host-key-bridge.ts      ホスト鍵拒否イベントの一時保持・接続エラーの整形し直し
    history-bridge.ts       upload/download/sync の結果を転送履歴へ記録する橋渡し
    tools/                各ツールのハンドラ（profiles/connection/transfer/backups/host-keys）
    schemas/profile.ts      Profile 判別共用体の zod スキーマ（構造検証。業務ルールは core/profile 側）
  preload/             contextBridge による window.api 公開
  renderer/            素の TypeScript + Vite の UI
    diff-view.ts         差分セグメント → DOM 生成（純粋）
    app.ts               画面ロジック
  shared/ipc.ts        IPC 契約（型・チャンネル名）
```

## テスト方針

実サーバー接続・実アップロードは行いません。トランスポートアダプタはフェイククライアントを注入して「ライブラリ API ↔ 共通インタフェース変換」を検証し、バックアップ・差分・アップロードの統合は実ファイル I/O（`LocalTransport`）でモックなしに検証します。`safeStorage` はフェイク注入でテストします。
