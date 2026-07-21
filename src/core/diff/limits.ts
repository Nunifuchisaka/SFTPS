/**
 * 文字差分を計算する既定の上限バイト数（1MB）。
 * diffChars は O(N×M) でメインプロセス上を走るため、上限なしでは
 * 巨大ファイル 1 つで OOM・無応答に持ち込める（DoS）。
 *
 * 定数だけを持つモジュールに分けてあるのは、設定・レンダラ側が
 * diff ライブラリ本体を巻き込まずにこの値を参照できるようにするため。
 */
export const DEFAULT_MAX_DIFF_BYTES = 1024 * 1024;

export interface DiffContentOptions {
  /** 文字差分を行う上限バイト数。0 以下で無制限。未指定なら DEFAULT_MAX_DIFF_BYTES。 */
  maxBytes?: number;
}
