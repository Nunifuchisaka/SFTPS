export type RemoteEntryType = 'file' | 'dir';

export interface RemoteEntry {
  /** ベース名（末尾の要素） */
  name: string;
  /** ルートからの posix パス（先頭スラッシュ始まり） */
  path: string;
  type: RemoteEntryType;
  /** バイト数。ディレクトリでは 0 の場合がある。 */
  size: number;
  /** 最終更新日時。取得できない場合は null。 */
  modifiedAt: Date | null;
}

export interface RemoteTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  list(remoteDir: string): Promise<RemoteEntry[]>;
  readFile(remotePath: string): Promise<Buffer>;
  writeFile(remotePath: string, data: Buffer): Promise<void>;
  exists(remotePath: string): Promise<boolean>;
  /** ディレクトリの存在判定。判定不能な通信・権限エラーはfalseにせず例外にする。 */
  directoryExists?(remotePath: string): Promise<boolean>;
  delete(remotePath: string): Promise<void>;
  mkdir(remotePath: string): Promise<void>;
  /** リネーム/移動。プロトコル非対応の場合は未実装（undefined）。 */
  rename?(from: string, to: string): Promise<void>;
  /** パーミッション変更。プロトコル非対応の場合は未実装（undefined）。 */
  chmod?(remotePath: string, mode: number): Promise<void>;
}
