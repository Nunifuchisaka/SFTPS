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
    e.preventDefault();
    depth = 0;
    el.classList.remove(highlightClass);
    const dt = (e as DragEvent).dataTransfer;
    if (dt) onDrop(dt.files);
  });
}
