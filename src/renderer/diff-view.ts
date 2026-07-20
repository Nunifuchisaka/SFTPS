import type { UploadPreview } from '../core/upload/index';

/**
 * アップロードプレビューから差分表示用の DOM を生成する純粋関数。
 * - テキスト: 一文字単位のセグメントを is_added / is_removed / is_equal で色分け表示
 * - バイナリ: サイズ比較のみ
 * - 新規: 新規アップロードの通知
 */
export function createDiffView(preview: UploadPreview): HTMLElement {
  const root = document.createElement('div');
  root.className = 'diff_1';

  if (preview.isNew) {
    const notice = document.createElement('div');
    notice.className = 'diff_1__new';
    notice.textContent =
      `新規アップロード: ${preview.afterSize} バイト` + (preview.binary ? '（バイナリ）' : '');
    root.appendChild(notice);
    return root;
  }

  if (preview.binary) {
    const binary = document.createElement('div');
    binary.className = 'diff_1__binary';
    binary.textContent = `バイナリファイル: ${preview.beforeSize ?? 0} → ${preview.afterSize} バイト`;
    root.appendChild(binary);
    return root;
  }

  const summary = document.createElement('div');
  summary.className = 'diff_1__summary';
  const s = preview.summary ?? { added: 0, removed: 0 };
  summary.textContent = `+${s.added} -${s.removed}`;
  root.appendChild(summary);

  const body = document.createElement('pre');
  body.className = 'diff_1__body';
  for (const seg of preview.segments ?? []) {
    const span = document.createElement('span');
    span.className = `diff_1__seg is_${seg.type}`;
    span.textContent = seg.value;
    body.appendChild(span);
  }
  root.appendChild(body);
  return root;
}
