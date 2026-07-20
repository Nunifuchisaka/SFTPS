/** 同期対象の1エントリ（base からの相対パスで表す）。 */
export interface SyncEntry {
  /** base からの相対 posix パス（先頭スラッシュなし。例 'sub/b.txt'）。 */
  path: string;
  type: 'file' | 'dir';
  size: number;
  modifiedAt: Date | null;
}

export type SyncActionType = 'upload' | 'create-dir' | 'skip' | 'delete-extra';

export interface SyncAction {
  type: SyncActionType;
  /** base からの相対 posix パス。 */
  path: string;
  /** 判定理由（'new' / 'size changed' / 'newer' / 'unchanged' / 'dir exists' / 'missing dir' / 'extraneous'）。 */
  reason: string;
}

/** 変更判定の基準。 */
export type CompareBy = 'size' | 'mtime' | 'size-and-mtime';

export interface PlanOptions {
  /** 変更判定基準。既定 'size-and-mtime'。 */
  compareBy?: CompareBy;
  /** true のとき、source に無い dest エントリを delete-extra に含める。既定 false（安全側）。 */
  deleteExtraneous?: boolean;
}
