import { describe, it, expect } from 'vitest';
import { TransferQueue } from './queue';
import type { RetryOptions } from './retry';
import type { TaskProgress } from './progress';

const noRetry: RetryOptions = { maxAttempts: 1, baseDelayMs: 1, factor: 2, maxDelayMs: 10 };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('TransferQueue execution', () => {
  it('runs tasks sequentially in order at concurrency 1', async () => {
    const order: string[] = [];
    const q = new TransferQueue({ runTask: async (t) => void order.push(t.id), retry: noRetry, concurrency: 1 });
    q.add({ id: 'a', kind: 'upload' });
    q.add({ id: 'b', kind: 'upload' });
    q.add({ id: 'c', kind: 'upload' });
    await q.run();
    expect(order).toEqual(['a', 'b', 'c']);
    expect(q.list().every((t) => t.status === 'succeeded')).toBe(true);
  });

  it('never exceeds the configured concurrency', async () => {
    let active = 0;
    let max = 0;
    const q = new TransferQueue({
      runTask: async () => {
        active++;
        max = Math.max(max, active);
        await sleep(10);
        active--;
      },
      retry: noRetry,
      concurrency: 2,
    });
    for (const id of ['a', 'b', 'c', 'd', 'e']) q.add({ id, kind: 'upload' });
    await q.run();
    expect(max).toBeLessThanOrEqual(2);
    expect(q.list().every((t) => t.status === 'succeeded')).toBe(true);
  });
});

describe('TransferQueue retry', () => {
  it('retries a flaky task and eventually succeeds', async () => {
    const seen: Record<string, number> = {};
    const q = new TransferQueue({
      runTask: async (t) => {
        seen[t.id] = (seen[t.id] ?? 0) + 1;
        if (seen[t.id] < 3) throw new Error('boom');
      },
      retry: { maxAttempts: 3, baseDelayMs: 1, factor: 2, maxDelayMs: 10 },
      delay: () => Promise.resolve(),
    });
    q.add({ id: 'flaky', kind: 'upload' });
    await q.run();
    const task = q.list()[0];
    expect(seen['flaky']).toBe(3);
    expect(task.status).toBe('succeeded');
    expect(task.attempts).toBe(3);
  });

  it('gives up as failed after maxAttempts', async () => {
    const q = new TransferQueue({
      runTask: async () => {
        throw new Error('always');
      },
      retry: { maxAttempts: 3, baseDelayMs: 1, factor: 2, maxDelayMs: 10 },
      delay: () => Promise.resolve(),
    });
    q.add({ id: 'bad', kind: 'upload' });
    await q.run();
    const task = q.list()[0];
    expect(task.status).toBe('failed');
    expect(task.attempts).toBe(3);
  });

  it('waits with exponential backoff between retries (injected delay)', async () => {
    const delays: number[] = [];
    let n = 0;
    const q = new TransferQueue({
      runTask: async () => {
        n++;
        if (n < 3) throw new Error('boom');
      },
      retry: { maxAttempts: 3, baseDelayMs: 100, factor: 2, maxDelayMs: 1000 },
      delay: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    q.add({ id: 'flaky', kind: 'upload' });
    await q.run();
    expect(delays).toEqual([100, 200]);
  });
});

describe('TransferQueue cancel', () => {
  it('cancels a still-queued task so it never runs', async () => {
    const ran: string[] = [];
    let q!: TransferQueue;
    q = new TransferQueue({
      runTask: async (t) => {
        if (t.id === 'a') q.cancel('b');
        ran.push(t.id);
      },
      retry: noRetry,
      concurrency: 1,
    });
    q.add({ id: 'a', kind: 'upload' });
    q.add({ id: 'b', kind: 'upload' });
    await q.run();
    expect(ran).toEqual(['a']);
    expect(q.list().find((t) => t.id === 'b')?.status).toBe('canceled');
  });

  it('cancelAll marks every pending task canceled', async () => {
    const ran: string[] = [];
    const q = new TransferQueue({ runTask: async (t) => void ran.push(t.id), retry: noRetry });
    for (const id of ['a', 'b', 'c']) q.add({ id, kind: 'upload' });
    q.cancelAll();
    expect(q.list().every((t) => t.status === 'canceled')).toBe(true);
    await q.run();
    expect(ran).toEqual([]);
  });
});

describe('TransferQueue progress', () => {
  it('forwards per-task progress and aggregates overall progress', async () => {
    const seen: Array<[string, TaskProgress]> = [];
    const q = new TransferQueue({
      runTask: async (_t, ctx) => {
        ctx.reportProgress({ transferred: 50, total: 100 });
      },
      retry: noRetry,
      onProgress: (id, p) => seen.push([id, p]),
    });
    q.add({ id: 'a', kind: 'upload' });
    await q.run();
    expect(seen).toContainEqual(['a', { transferred: 50, total: 100 }]);
    expect(q.overall().transferred).toBe(50);
  });
});
