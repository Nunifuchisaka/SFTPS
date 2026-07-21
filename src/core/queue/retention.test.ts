import { describe, it, expect } from 'vitest';
import { isTerminalStatus, planTaskRetention } from './retention';
import type { TransferTask } from './task';

function task(id: string, status: TransferTask['status']): TransferTask {
  return { id, kind: 'upload', status, attempts: 1 };
}

describe('isTerminalStatus', () => {
  it('treats succeeded / failed / canceled as terminal', () => {
    expect(isTerminalStatus('succeeded')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('canceled')).toBe(true);
  });

  it('treats queued / running / retrying as non terminal', () => {
    expect(isTerminalStatus('queued')).toBe(false);
    expect(isTerminalStatus('running')).toBe(false);
    expect(isTerminalStatus('retrying')).toBe(false);
  });
});

describe('planTaskRetention', () => {
  it('keeps every task when the terminal count is within the limit', () => {
    const tasks = [task('a', 'succeeded'), task('b', 'queued')];
    const plan = planTaskRetention(tasks, 5);
    expect(plan.keep.map((t) => t.id)).toEqual(['a', 'b']);
    expect(plan.removedIds).toEqual([]);
  });

  it('drops the oldest terminal tasks beyond the limit, keeping insertion order', () => {
    const tasks = [
      task('t1', 'succeeded'),
      task('t2', 'failed'),
      task('t3', 'canceled'),
      task('t4', 'succeeded'),
    ];
    const plan = planTaskRetention(tasks, 2);
    expect(plan.removedIds).toEqual(['t1', 't2']);
    expect(plan.keep.map((t) => t.id)).toEqual(['t3', 't4']);
  });

  it('never drops tasks that are still queued / running / retrying', () => {
    const tasks = [
      task('done1', 'succeeded'),
      task('run', 'running'),
      task('done2', 'succeeded'),
      task('wait', 'queued'),
    ];
    const plan = planTaskRetention(tasks, 1);
    expect(plan.removedIds).toEqual(['done1']);
    expect(plan.keep.map((t) => t.id)).toEqual(['run', 'done2', 'wait']);
  });

  it('drops every terminal task when the limit is 0 (explicit clear)', () => {
    const tasks = [task('a', 'succeeded'), task('b', 'running'), task('c', 'failed')];
    const plan = planTaskRetention(tasks, 0);
    expect(plan.removedIds).toEqual(['a', 'c']);
    expect(plan.keep.map((t) => t.id)).toEqual(['b']);
  });

  it('treats a negative limit as 0', () => {
    const plan = planTaskRetention([task('a', 'succeeded')], -3);
    expect(plan.removedIds).toEqual(['a']);
  });

  it('does not mutate the input array', () => {
    const tasks = [task('a', 'succeeded'), task('b', 'succeeded')];
    planTaskRetention(tasks, 1);
    expect(tasks.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
