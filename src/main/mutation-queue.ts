/** 同一永続資源へのread-modify-writeを呼び出し順に直列化する。 */
export class MutationQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tail = previous.then(() => gate);
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  async idle(): Promise<void> {
    await this.tail;
  }
}
