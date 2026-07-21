import { describe, it, expect } from 'vitest';
import { QueueDriver } from './driver';

/** run() 一回で「その時点の待ち行列」だけを処理する、TransferQueue.run() を模したフェイク。 */
function makeFakeQueue() {
  const queued: string[] = [];
  const processed: string[] = [];
  let runs = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const hooks: Record<string, () => void> = {};

  return {
    processed,
    hooks,
    get runs() {
      return runs;
    },
    get maxConcurrent() {
      return maxConcurrent;
    },
    enqueue(id: string): void {
      queued.push(id);
    },
    hasPending: (): boolean => queued.length > 0,
    run: async (): Promise<void> => {
      runs++;
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      const batch = queued.splice(0, queued.length);
      for (const id of batch) {
        await Promise.resolve();
        processed.push(id);
        hooks[id]?.();
      }
      concurrent--;
    },
  };
}

describe('QueueDriver', () => {
  it('runs until nothing is pending', async () => {
    const q = makeFakeQueue();
    const driver = new QueueDriver({ hasPending: q.hasPending, run: q.run });
    q.enqueue('a');
    q.enqueue('b');
    await driver.request();
    expect(q.processed).toEqual(['a', 'b']);
    expect(q.hasPending()).toBe(false);
  });

  it('does nothing when there is no pending task', async () => {
    const q = makeFakeQueue();
    const driver = new QueueDriver({ hasPending: q.hasPending, run: q.run });
    await driver.request();
    expect(q.runs).toBe(0);
  });

  it('picks up a task enqueued while a run is in flight (no orphaned task)', async () => {
    const q = makeFakeQueue();
    const driver = new QueueDriver({ hasPending: q.hasPending, run: q.run });
    q.enqueue('a');
    // 'a' の処理中に 'b' を投入し、同時に駆動を要求する（元実装ではここで取り残されていた）。
    q.hooks['a'] = () => {
      q.enqueue('b');
      void driver.request();
    };
    await driver.request();
    expect(q.processed).toEqual(['a', 'b']);
    expect(q.hasPending()).toBe(false);
  });

  it('never runs the queue concurrently even under repeated requests', async () => {
    const q = makeFakeQueue();
    const driver = new QueueDriver({ hasPending: q.hasPending, run: q.run });
    for (const id of ['a', 'b', 'c']) q.enqueue(id);
    await Promise.all([driver.request(), driver.request(), driver.request()]);
    expect(q.maxConcurrent).toBe(1);
    expect(q.processed).toEqual(['a', 'b', 'c']);
  });

  it('reports whether a drain loop is in flight', async () => {
    const q = makeFakeQueue();
    const driver = new QueueDriver({ hasPending: q.hasPending, run: q.run });
    q.enqueue('a');
    q.hooks['a'] = () => {
      expect(driver.running).toBe(true);
    };
    expect(driver.running).toBe(false);
    await driver.request();
    expect(driver.running).toBe(false);
  });

  it('calls onDrained after the queue goes idle, including after a late enqueue', async () => {
    const q = makeFakeQueue();
    const drained: number[] = [];
    const driver = new QueueDriver({
      hasPending: q.hasPending,
      run: q.run,
      onDrained: () => drained.push(q.processed.length),
    });
    q.enqueue('a');
    q.hooks['a'] = () => {
      q.enqueue('b');
      void driver.request();
    };
    await driver.request();
    expect(drained.at(-1)).toBe(2);
  });

  it('keeps draining after a run throws, and rejects the caller', async () => {
    const q = makeFakeQueue();
    let boom = true;
    const driver = new QueueDriver({
      hasPending: q.hasPending,
      run: async () => {
        if (boom) {
          boom = false;
          throw new Error('run failed');
        }
        await q.run();
      },
    });
    q.enqueue('a');
    await expect(driver.request()).rejects.toThrow('run failed');
    expect(driver.running).toBe(false);
    // 例外後もドライバは再駆動できる（フラグが立ちっぱなしにならない）。
    await driver.request();
    expect(q.processed).toEqual(['a']);
  });
});
