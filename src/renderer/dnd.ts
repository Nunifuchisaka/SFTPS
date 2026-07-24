/** ローカル一覧の行をリモートパネルへドラッグしたことを示すカスタム MIME タイプ（アップロード）。 */
export const LOCAL_DRAG_MIME = 'application/x-funabinftp-local-entries';
/** リモート一覧の行をローカルパネルへドラッグしたことを示すカスタム MIME タイプ（ダウンロード）。 */
export const REMOTE_DRAG_MIME = 'application/x-funabinftp-remote-entries';
/** プロファイル一覧内での行ドラッグ（フォルダ間移動・並び替え）を示すカスタム MIME タイプ。 */
export const PROFILE_DRAG_MIME = 'application/x-funabinftp-profile-entry';
/** プロファイル一覧内でのフォルダ見出しドラッグ（フォルダ並び替え）を示すカスタム MIME タイプ。 */
export const PROFILE_FOLDER_DRAG_MIME = 'application/x-funabinftp-profile-folder';

/**
 * 要素をドロップゾーンにする最小配線。
 * dragover を preventDefault してドロップを許可し、drop 時に dataTransfer.files を渡す。
 * ファイルのドラッグ中は highlightClass を付与して受け入れ可能であることを示す。
 * OS パスの解決（webUtils.getPathForFile 等）は呼び出し側で行う。
 */
export function attachDropZone(
  el: HTMLElement,
  onDrop: (files: FileList) => void,
  highlightClass = 'is_dragover',
): void {
  // dragenter/dragleave は子要素の通過でも発火するため、深さを数えて実際の出入りを判定する。
  let depth = 0;
  el.addEventListener('dragenter', (e) => {
    e.preventDefault();
    const types = (e as DragEvent).dataTransfer?.types;
    if (!types || !Array.from(types).includes('Files')) return;
    depth++;
    if (depth === 1) el.classList.add(highlightClass);
  });
  el.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) el.classList.remove(highlightClass);
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  el.addEventListener('drop', (e) => {
    const dt = (e as DragEvent).dataTransfer;
    if (!dt || !Array.from(dt.types).includes('Files')) return;
    e.preventDefault();
    depth = 0;
    el.classList.remove(highlightClass);
    onDrop(dt.files);
  });
}

/**
 * アプリ内ドラッグ（ローカル⇔リモートの行ドラッグ）用のドロップゾーン配線。
 * attachDropZone と同じ骨格だが、指定した mimeType のみを見て、
 * drop 時に dataTransfer.getData(mimeType)（JSON文字列）を渡す。
 * 同一要素に attachDropZone と併用しても、それぞれ自分の types しか見ないため干渉しない。
 */
export function attachInternalDropZone(
  el: HTMLElement,
  mimeType: string,
  onDrop: (data: string) => void,
  highlightClass = 'is_dragover',
): void {
  let depth = 0;
  el.addEventListener('dragenter', (e) => {
    e.preventDefault();
    const types = (e as DragEvent).dataTransfer?.types;
    if (!types || !Array.from(types).includes(mimeType)) return;
    depth++;
    if (depth === 1) el.classList.add(highlightClass);
  });
  el.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) el.classList.remove(highlightClass);
  });
  el.addEventListener('dragover', (e) => {
    const types = (e as DragEvent).dataTransfer?.types;
    if (types && Array.from(types).includes(mimeType)) e.preventDefault();
  });
  el.addEventListener('drop', (e) => {
    const dt = (e as DragEvent).dataTransfer;
    if (!dt || !Array.from(dt.types).includes(mimeType)) return;
    e.preventDefault();
    depth = 0;
    el.classList.remove(highlightClass);
    const data = dt.getData(mimeType);
    if (data) onDrop(data);
  });
}
