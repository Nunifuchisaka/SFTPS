export type Locale = 'ja' | 'en';

export const LOCALES: Locale[] = ['ja', 'en'];

export type Dictionary = Record<string, string>;
export type Dictionaries = Record<string, Dictionary>;

/**
 * UI 主要文言の辞書。ja と en は同一キー集合を保つこと（整合性テストで担保）。
 * 全文言の完全外部化は範囲が大きいため、主要どころ（見出し・主要ボタン・言語切替）を対象とする。
 */
export const dictionaries: Record<Locale, Dictionary> = {
  ja: {
    'app.title': 'FunabinFTP — FTP / SFTP / S3 クライアント',
    'header.showHidden': '隠しファイル表示',
    'header.language': '言語',
    'header.theme': 'テーマ',
    'panel.profiles': '接続プロファイル',
    'panel.upload': 'アップロード',
    'panel.sync': 'フォルダ差分同期',
    'panel.backups': 'バックアップ履歴',
    'panel.queue': '転送キュー',
    'panel.history': '転送履歴',
    'panel.bookmarks': 'ブックマーク',
    'panel.settings': '設定',
    'settings.backupMaxGenerations': 'バックアップ世代数',
    'settings.backupMaxAgeDays': 'バックアップ保持日数（0 で無期限）',
    'settings.diffMaxBytes': '差分プレビュー上限（バイト）',
    'settings.note':
      'バックアップは暗号化されずローカルに保存されます。資格情報を含むファイル（.env / wp-config.php 等）を扱う場合は保持日数を短くしてください。差分プレビュー上限を超えるファイルは文字差分を行わずサイズ比較のみ表示します。',
    'settings.saved': '設定を保存しました',
    'btn.clearCompleted': '完了分をクリア',
    'profile.deleteConfirm': 'プロファイル {id} を削除します。よろしいですか？',
    'profile.deleteRelatedConfirm':
      '{id} に紐づくブックマーク・転送履歴・信頼済みホスト鍵も削除しますか？（キャンセルすると、これらは残ります）',
    'profile.deleteBackupsConfirm':
      '{id} のバックアップ（上書き前に退避したファイル本体）も削除しますか？削除すると復元できなくなります。',
    'profile.s3UseDefaultCredentials':
      'マシンの既定資格情報を使う（環境変数 / ~/.aws / IMDS）',
    'btn.addBookmark': '現在のパスをブックマーク',
    'bookmark.namePrompt': 'ブックマーク名を入力してください',
    'browser.local': 'ローカル',
    'browser.remoteDropHint': 'リモート（ここにOSからファイルをドロップでUL）',
    'btn.connect': '接続',
    'btn.edit': '編集',
    'btn.delete': '削除',
    'btn.save': '保存',
    'btn.new': '新規',
    'btn.up': '..上へ',
    'form.newProfile': 'プロファイル新規追加',
    'form.editProfile': 'プロファイル編集: {id}',
    'hostkey.prompt.title': 'ホスト鍵の確認',
    'hostkey.prompt.unknown.message': '{host}:{port} のホスト鍵は未登録です。信頼しますか？',
    'hostkey.prompt.unknown.detail':
      'SHA256 指紋: {fingerprint}\n\nこの指紋がサーバー管理者から提示された値と一致することを確認してください。一致しない場合、通信が中間者に傍受されている可能性があります。',
    'hostkey.prompt.mismatch.message': '{host}:{port} のホスト鍵が変更されています。接続を中止しました。',
    'hostkey.prompt.mismatch.detail':
      '記録済みの指紋: {knownFingerprint}\n今回提示された指紋: {fingerprint}\n\n中間者攻撃の可能性があります。サーバーを正当に再構築した場合のみ、「信頼済みホスト鍵」から該当ホストを削除してから接続し直してください。',
    'hostkey.prompt.accept': '信頼して接続',
    'hostkey.prompt.reject': '接続しない',
    'hostkey.prompt.close': '閉じる',
    'panel.knownHosts': '信頼済みホスト鍵',
    'knownHosts.empty': '登録なし',
    'knownHosts.remove': '信頼を取り消す',
    'knownHosts.removeConfirm':
      '{host}:{port} の信頼済みホスト鍵を削除します。次回接続時に指紋の確認をやり直します。よろしいですか？',
    'knownHosts.reload': '再読込',
    'conn.error.hostkey': 'ホスト鍵の検証に失敗しました。中間者攻撃の可能性があるため再接続しません。',
    'conn.error.tls': 'サーバー証明書の検証に失敗しました。通信の安全性を確認できないため再接続しません。',
    'conn.error.auth': '認証に失敗しました。',
    'store.loadFailed': '{file} を読み込めませんでした。ファイルが破損しているか、権限がありません。',
    'store.saveFailed': '{file} を保存できませんでした。',
  },
  en: {
    'app.title': 'FunabinFTP — FTP / SFTP / S3 Client',
    'header.showHidden': 'Show hidden files',
    'header.language': 'Language',
    'header.theme': 'Theme',
    'panel.profiles': 'Connection profiles',
    'panel.upload': 'Upload',
    'panel.sync': 'Folder diff sync',
    'panel.backups': 'Backup history',
    'panel.queue': 'Transfer queue',
    'panel.history': 'Transfer history',
    'panel.bookmarks': 'Bookmarks',
    'panel.settings': 'Settings',
    'settings.backupMaxGenerations': 'Backup generations',
    'settings.backupMaxAgeDays': 'Backup retention in days (0 = unlimited)',
    'settings.diffMaxBytes': 'Diff preview limit (bytes)',
    'settings.note':
      'Backups are stored locally without encryption. Keep the retention short when you edit files that carry credentials (.env, wp-config.php and the like). Files larger than the diff preview limit are shown as a size comparison instead of a character diff.',
    'settings.saved': 'Settings saved',
    'btn.clearCompleted': 'Clear finished',
    'profile.deleteConfirm': 'Delete profile {id}?',
    'profile.deleteRelatedConfirm':
      'Also delete the bookmarks, transfer history and trusted host key that belong to {id}? (Cancel keeps them.)',
    'profile.deleteBackupsConfirm':
      'Also delete the backups of {id} (the saved copies of overwritten files)? They cannot be restored afterwards.',
    'profile.s3UseDefaultCredentials':
      'Use the machine default credentials (env vars / ~/.aws / IMDS)',
    'btn.addBookmark': 'Bookmark current path',
    'bookmark.namePrompt': 'Enter a bookmark name',
    'browser.local': 'Local',
    'browser.remoteDropHint': 'Remote (drop OS files here to upload)',
    'btn.connect': 'Connect',
    'btn.edit': 'Edit',
    'btn.delete': 'Delete',
    'btn.save': 'Save',
    'btn.new': 'New',
    'btn.up': '..Up',
    'form.newProfile': 'Add new profile',
    'form.editProfile': 'Edit profile: {id}',
    'hostkey.prompt.title': 'Host key verification',
    'hostkey.prompt.unknown.message': 'The host key of {host}:{port} is not known. Trust it?',
    'hostkey.prompt.unknown.detail':
      'SHA256 fingerprint: {fingerprint}\n\nMake sure this fingerprint matches the one published by the server administrator. If it does not, the connection may be intercepted by a man in the middle.',
    'hostkey.prompt.mismatch.message':
      'The host key of {host}:{port} has changed. The connection was aborted.',
    'hostkey.prompt.mismatch.detail':
      'Recorded fingerprint: {knownFingerprint}\nOffered fingerprint: {fingerprint}\n\nThis may be a man-in-the-middle attack. Only if the server was legitimately rebuilt, remove the host from "Trusted host keys" and connect again.',
    'hostkey.prompt.accept': 'Trust and connect',
    'hostkey.prompt.reject': 'Do not connect',
    'hostkey.prompt.close': 'Close',
    'panel.knownHosts': 'Trusted host keys',
    'knownHosts.empty': 'No entries',
    'knownHosts.remove': 'Revoke trust',
    'knownHosts.removeConfirm':
      'Remove the trusted host key for {host}:{port}? The fingerprint will be verified again on the next connection.',
    'knownHosts.reload': 'Reload',
    'conn.error.hostkey':
      'Host key verification failed. Not reconnecting, as this may be a man-in-the-middle attack.',
    'conn.error.tls':
      'Server certificate verification failed. Not reconnecting, as the connection cannot be trusted.',
    'conn.error.auth': 'Authentication failed.',
    'store.loadFailed': 'Could not read {file}. It may be corrupted or inaccessible.',
    'store.saveFailed': 'Could not save {file}.',
  },
};
