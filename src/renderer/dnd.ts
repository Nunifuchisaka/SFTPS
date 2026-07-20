/**
 * 要素をドロップゾーンにする最小配線。
 * dragover を preventDefault してドロップを許可し、drop 時に dataTransfer.files を渡す。
 * OS パスの解決（webUtils.getPathForFile 等）は呼び出し側で行う。
 */
export function attachDropZone(el: HTMLElement, onDrop: (files: FileList) => void): void {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const dt = (e as DragEvent).dataTransfer;
    if (dt) onDrop(dt.files);
  });
}
