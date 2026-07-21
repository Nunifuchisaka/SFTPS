import type { UploadPreview } from '../core/upload/index';

export type TransferDirection = 'upload' | 'download';

/**
 * 差分の向きラベル。取り違え防止用。
 * - upload: before=リモート既存, after=ローカル新
 * - download: before=ローカル既存, after=リモート新
 * removed(赤)=before側にのみ存在, added(緑)=after側にのみ存在。
 */
export function diffOrientationLabels(direction: TransferDirection): {
  beforeLabel: string;
  afterLabel: string;
} {
  return direction === 'download'
    ? { beforeLabel: 'ローカル(既存)', afterLabel: 'リモート(新)' }
    : { beforeLabel: 'リモート(既存)', afterLabel: 'ローカル(新)' };
}

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

  if (preview.tooLarge) {
    // 巨大ファイルで文字差分を走らせるとメインプロセスが固まるため、省略した旨を明示する。
    const notice = document.createElement('div');
    notice.className = 'diff_1__toolarge';
    const limit = preview.diffLimitBytes ?? 0;
    notice.textContent =
      `大きすぎるため差分表示を省略しました（上限 ${limit} バイト）: ` +
      `${preview.beforeSize ?? 0} → ${preview.afterSize} バイト`;
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
