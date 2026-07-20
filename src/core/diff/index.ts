import { diffChars as jsDiffChars } from 'diff';

export type DiffSegmentType = 'equal' | 'added' | 'removed';

export interface DiffSegment {
  type: DiffSegmentType;
  value: string;
}

export interface DiffSummary {
  added: number;
  removed: number;
}

export type DiffContentResult =
  | { binary: false; segments: DiffSegment[]; summary: DiffSummary }
  | { binary: true; beforeSize: number; afterSize: number };

/** 一文字単位の差分を計算する。 */
export function diffChars(before: string, after: string): DiffSegment[] {
  return jsDiffChars(before, after).map((change) => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'equal',
    value: change.value,
  }));
}

/** NUL バイトの有無でバイナリかどうかを判定する（先頭 8000 バイトを走査）。 */
export function isBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/** UTF-8 BOM（Buffer）または先頭 U+FEFF（string）を剥がして文字列を返す。 */
export function stripBom(input: string | Buffer): string {
  if (Buffer.isBuffer(input)) {
    if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
      return input.subarray(3).toString('utf8');
    }
    return input.toString('utf8');
  }
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/** 差分セグメントから追加/削除の文字数を集計する。 */
export function summarize(segments: DiffSegment[]): DiffSummary {
  let added = 0;
  let removed = 0;
  for (const seg of segments) {
    const count = [...seg.value].length;
    if (seg.type === 'added') added += count;
    else if (seg.type === 'removed') removed += count;
  }
  return { added, removed };
}

/**
 * バッファ同士の差分を計算する。
 * どちらかがバイナリならサイズ比較に落とし、文字差分は行わない。
 * テキストなら BOM を剥がしたうえで一文字単位の差分とサマリを返す。
 */
export function diffContent(before: Buffer, after: Buffer): DiffContentResult {
  if (isBinary(before) || isBinary(after)) {
    return { binary: true, beforeSize: before.length, afterSize: after.length };
  }
  const segments = diffChars(stripBom(before), stripBom(after));
  return { binary: false, segments, summary: summarize(segments) };
}
