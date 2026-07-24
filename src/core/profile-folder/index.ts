import type { Profile } from '../profile/index';

/** プロファイル一覧画面のフォルダ分け（純粋データ）。 */
export interface ProfileFolder {
  id: string;
  name: string;
  /** フォルダ同士の表示順。 */
  order: number;
}

/**
 * フォルダ id に許可する文字。core/profile の PROFILE_ID_RE と同じ制約
 * （安全な識別子であればよく、パス構成要素として使うわけではないが揃えておく）。
 */
const FOLDER_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function isValidFolderId(id: string): boolean {
  if (typeof id !== 'string') return false;
  if (id === '.' || id === '..') return false;
  return FOLDER_ID_RE.test(id);
}

/** フォルダを検証し、問題があればエラーメッセージ配列を返す（空配列 = 妥当）。 */
export function validateProfileFolder(folder: ProfileFolder): string[] {
  const errors: string[] = [];
  if (!folder.id?.trim()) errors.push('id is required');
  else if (!isValidFolderId(folder.id)) {
    errors.push('id must be 1-64 chars of A-Z a-z 0-9 . _ - (no path separators)');
  }
  if (!folder.name?.trim()) errors.push('name is required');
  if (!Number.isInteger(folder.order)) errors.push('order must be an integer');
  return errors;
}

/** 表示順（order 昇順）に整列した複製を返す。 */
export function sortFolders(folders: ProfileFolder[]): ProfileFolder[] {
  return [...folders].sort((a, b) => a.order - b.order);
}

/**
 * フォルダ一覧内で指定 id のフォルダを targetIndex の位置へ移動し、
 * order を 0 始まりの連番へ振り直した新しい配列を返す（ドラッグ&ドロップ並び替え）。
 * 存在しない id を渡した場合は元の配列をそのまま返す。
 */
export function reorderFolders(
  folders: ProfileFolder[],
  id: string,
  targetIndex: number,
): ProfileFolder[] {
  const sorted = sortFolders(folders);
  const from = sorted.findIndex((f) => f.id === id);
  if (from === -1) return folders;
  const [moved] = sorted.splice(from, 1);
  const clamped = Math.max(0, Math.min(targetIndex, sorted.length));
  sorted.splice(clamped, 0, moved);
  return sorted.map((f, i) => ({ ...f, order: i }));
}

/** プロファイルの所属グループ key（フォルダ id、未整理は null）。 */
function groupKeyOf(p: Profile): string | null {
  return p.folderId ?? null;
}

/** 指定グループ（フォルダ id、未整理は null）に属するプロファイルを order 昇順で返す。 */
export function profilesInGroup(profiles: Profile[], folderId: string | null): Profile[] {
  return profiles
    .filter((p) => groupKeyOf(p) === folderId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * プロファイルを targetFolderId グループの targetIndex 位置へ移動し、
 * 移動元・移動先の各グループの order を振り直した新しい配列を返す（他プロファイルは不変）。
 * フォルダ間移動・同一フォルダ内の並び替えの両方をこの一関数でカバーする。
 * 存在しない profileId を渡した場合は元の配列をそのまま返す。
 */
export function moveProfileToFolder(
  profiles: Profile[],
  profileId: string,
  targetFolderId: string | null,
  targetIndex: number,
): Profile[] {
  const moving = profiles.find((p) => p.id === profileId);
  if (!moving) return profiles;
  const sourceFolderId = groupKeyOf(moving);

  const targetGroup = profilesInGroup(profiles, targetFolderId).filter((p) => p.id !== profileId);
  const clamped = Math.max(0, Math.min(targetIndex, targetGroup.length));
  targetGroup.splice(clamped, 0, moving);
  const targetOrder = new Map(targetGroup.map((p, i) => [p.id, i]));

  const sourceOrder =
    sourceFolderId === targetFolderId
      ? null
      : new Map(
          profilesInGroup(profiles, sourceFolderId)
            .filter((p) => p.id !== profileId)
            .map((p, i) => [p.id, i]),
        );

  return profiles.map((p) => {
    if (targetOrder.has(p.id)) {
      const order = targetOrder.get(p.id) as number;
      return p.id === profileId ? { ...p, folderId: targetFolderId ?? undefined, order } : { ...p, order };
    }
    if (sourceOrder?.has(p.id)) {
      return { ...p, order: sourceOrder.get(p.id) as number };
    }
    return p;
  });
}

/**
 * フォルダ削除時、そのフォルダに属していたプロファイルを未整理グループへ移す
 * （既存の未整理プロファイルの末尾に追加し、順序を維持する）。
 */
export function removeFolderAssignment(profiles: Profile[], folderId: string): Profile[] {
  let nextOrder = profilesInGroup(profiles, null).length;
  return profiles.map((p) => {
    if (groupKeyOf(p) !== folderId) return p;
    return { ...p, folderId: undefined, order: nextOrder++ };
  });
}

/** ドラッグ中の行を、ドロップ先の行の前/後どちらに挿入するかをカーソル位置から判定する。 */
export function resolveDropSide(rowTop: number, rowHeight: number, clientY: number): 'before' | 'after' {
  return clientY < rowTop + rowHeight / 2 ? 'before' : 'after';
}

export function serializeProfileFolders(folders: ProfileFolder[]): string {
  return JSON.stringify(sortFolders(folders), null, 2);
}

export function parseProfileFolders(json: string): ProfileFolder[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error('profile folders JSON must be an array');
  return raw.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`profileFolder[${index}] is not an object`);
    }
    const folder = item as ProfileFolder;
    const errors = validateProfileFolder(folder);
    if (errors.length > 0) {
      throw new Error(`profileFolder[${index}] is invalid: ${errors.join(', ')}`);
    }
    return { id: folder.id, name: folder.name.trim(), order: folder.order };
  });
}
