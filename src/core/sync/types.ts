/** 同期対象の1エントリ（base からの相対パスで表す）。 */
export interface SyncEntry {
  /** base からの相対 posix パス（先頭スラッシュなし。例 'sub/b.txt'）。 */
  path: string;
  type: 'file' | 'dir';
  size: number;
  modifiedAt: Date | null;
  /** 内容ハッシュ（compareBy='checksum' 時に walkTree が埋める）。未計算なら undefined。 */
  hash?: string;
}

export type SyncActionType = 'upload' | 'create-dir' | 'skip' | 'delete-extra';

export interface SyncAction {
  type: SyncActionType;
  /** base からの相対 posix パス。 */
  path: string;
  /** 判定理由（'new' / 'size changed' / 'newer' / 'unchanged' / 'dir exists' / 'missing dir' / 'extraneous'）。 */
  reason: string;
  /** 対象の実体種別。delete-extra で「ファイルのみバックアップする」判定に使う。 */
  entryType?: 'file' | 'dir';
}

/** 変更判定の基準。checksum は最も厳密だが両側の内容を読むためコストが高い。 */
export type CompareBy = 'size' | 'mtime' | 'size-and-mtime' | 'checksum';

export interface PlanOptions {
  /** 変更判定基準。既定 'size-and-mtime'。 */
  compareBy?: CompareBy;
  /** true のとき、source に無い dest エントリを delete-extra に含める。既定 false（安全側）。 */
  deleteExtraneous?: boolean;
}
