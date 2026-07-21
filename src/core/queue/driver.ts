export interface QueueDriverOptions {
  /** 未処理タスクが残っているか。 */
  hasPending: () => boolean;
  /** その時点の未処理タスクを処理する（TransferQueue.run 相当）。 */
  run: () => Promise<void>;
  /** 未処理が無くなった時点で呼ばれる（履歴記録などの後始末用）。 */
  onDrained?: () => void;
}

/**
 * 「未処理が無くなるまで run を回す」駆動器（純粋・キュー実装に非依存）。
 *
 * 実行中に投入されたタスクを取り残さないため、駆動要求は必ずフラグで受け取り、
 * 完走後にフラグが立っていれば再度回す（「実行中なら即 return」だけの実装では、
 * ループ脱出後〜実行中フラグを下ろすまでの間に来た要求が誰にも駆動されない）。
 */
export class QueueDriver {
  private inFlight = false;
  private requested = false;

  constructor(private readonly options: QueueDriverOptions) {}

  /** 駆動中か（テスト・診断用）。 */
  get running(): boolean {
    return this.inFlight;
  }

  /**
   * 駆動を要求する。すでに駆動中なら要求だけ立てて戻る（その周回が拾う）。
   * run が例外を投げた場合は呼び出し元へ伝えるが、駆動フラグは必ず戻す。
   */
  async request(): Promise<void> {
    this.requested = true;
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      while (this.requested) {
        this.requested = false;
        while (this.options.hasPending()) {
          await this.options.run();
        }
        this.options.onDrained?.();
      }
    } finally {
      this.inFlight = false;
      this.requested = false;
    }
  }
}
