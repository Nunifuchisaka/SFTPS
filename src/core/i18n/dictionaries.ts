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
    'app.title': 'SFTPS — FTP / SFTP / S3 クライアント',
    'header.showHidden': '隠しファイル表示',
    'header.language': '言語',
    'header.theme': 'テーマ',
    'panel.profiles': '接続プロファイル',
    'panel.upload': 'アップロード',
    'panel.sync': 'フォルダ差分同期',
    'panel.backups': 'バックアップ履歴',
    'panel.queue': '転送キュー',
    'panel.history': '転送履歴',
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
  },
  en: {
    'app.title': 'SFTPS — FTP / SFTP / S3 Client',
    'header.showHidden': 'Show hidden files',
    'header.language': 'Language',
    'header.theme': 'Theme',
    'panel.profiles': 'Connection profiles',
    'panel.upload': 'Upload',
    'panel.sync': 'Folder diff sync',
    'panel.backups': 'Backup history',
    'panel.queue': 'Transfer queue',
    'panel.history': 'Transfer history',
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
  },
};
