import type { TransferRequest } from '../shared/ipc';
import type { DropTarget } from '../core/browse/index';

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
