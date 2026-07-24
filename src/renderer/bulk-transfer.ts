import type { TransferRequest } from '../shared/ipc';
import type { DropTarget, DownloadDropTarget } from '../core/browse/index';
import type { ExtensionFilter } from '../core/upload/extension-filter';
import { isExtensionAllowed } from '../core/upload/extension-filter';

function baseName(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return trimmed.slice(idx + 1);
}

function joinPosix(dir: string, name: string): string {
  const d = dir.replace(/\/+$/, '');
  return d === '' ? `/${name}` : `${d}/${name}`;
}

/** 選択したローカルパス群を、宛先ディレクトリ配下へのアップロード要求群に変換する。 */
export function buildUploadRequests(
  profileId: string,
  localPaths: string[],
  destDir: string,
): TransferRequest[] {
  return localPaths.map((localPath) => {
    const name = baseName(localPath);
    return {
      kind: 'upload',
      profileId,
      localPath,
      remotePath: joinPosix(destDir, name),
      label: name,
    };
  });
}

/** ドロップ解決結果（DropTarget[]）を転送要求群に変換する。 */
export function buildRequestsFromDropTargets(
  profileId: string,
  targets: DropTarget[],
): TransferRequest[] {
  return targets.map((t) =>
    t.kind === 'upload'
      ? {
          kind: 'upload',
          profileId,
          localPath: t.sourcePath,
          remotePath: t.destPath,
          label: baseName(t.sourcePath),
        }
      : {
          kind: 'sync',
          profileId,
          localDir: t.sourcePath,
          remoteDir: t.destPath,
          label: `sync → ${t.destPath}`,
        },
  );
}

/**
 * upload 種別のリクエストだけに拡張子フィルタを適用し、対象外を除外する。
 * sync 種別（フォルダ同期）はフォルダ側の walkTree が判定するのでそのまま通す。
 */
export function filterUploadRequestsByExtension(
  requests: TransferRequest[],
  filter: ExtensionFilter,
): { allowed: TransferRequest[]; skipped: number } {
  let skipped = 0;
  const allowed = requests.filter((req) => {
    if (req.kind !== 'upload') return true;
    const ok = isExtensionAllowed(req.localPath, filter);
    if (!ok) skipped++;
    return ok;
  });
  return { allowed, skipped };
}

/** リモートからのダウンロードドロップ解決結果（DownloadDropTarget[]）を転送要求群に変換する。 */
export function buildDownloadRequestsFromTargets(
  profileId: string,
  targets: DownloadDropTarget[],
): TransferRequest[] {
  return targets.map((t) =>
    t.kind === 'download'
      ? {
          kind: 'download',
          profileId,
          remotePath: t.sourcePath,
          savePath: t.destPath,
          label: baseName(t.sourcePath),
        }
      : {
          kind: 'download-sync',
          profileId,
          remoteDir: t.sourcePath,
          localDir: t.destPath,
          label: `download → ${t.destPath}`,
        },
  );
}

/**
 * download 種別のリクエストだけに拡張子フィルタを適用し、対象外を除外する。
 * download-sync 種別（フォルダ同期）はフォルダ側の walkTree が判定するのでそのまま通す。
 */
export function filterDownloadRequestsByExtension(
  requests: TransferRequest[],
  filter: ExtensionFilter,
): { allowed: TransferRequest[]; skipped: number } {
  let skipped = 0;
  const allowed = requests.filter((req) => {
    if (req.kind !== 'download') return true;
    const ok = isExtensionAllowed(req.remotePath, filter);
    if (!ok) skipped++;
    return ok;
  });
  return { allowed, skipped };
}
