import { describe, it, expect } from 'vitest';
import { nextStatus } from './task';

describe('nextStatus (transfer task state machine)', () => {
  it('follows the happy path queued → running → succeeded', () => {
    expect(nextStatus('queued', 'start')).toBe('running');
    expect(nextStatus('running', 'succeed')).toBe('succeeded');
  });

  it('follows the retry path running → failed → retrying → running', () => {
    expect(nextStatus('running', 'fail')).toBe('failed');
    expect(nextStatus('failed', 'retry')).toBe('retrying');
    expect(nextStatus('retrying', 'start')).toBe('running');
  });

  it('allows cancel from queued, running and retrying', () => {
    expect(nextStatus('queued', 'cancel')).toBe('canceled');
    expect(nextStatus('running', 'cancel')).toBe('canceled');
    expect(nextStatus('retrying', 'cancel')).toBe('canceled');
  });

  it('rejects invalid transitions', () => {
    expect(() => nextStatus('succeeded', 'start')).toThrow();
    expect(() => nextStatus('queued', 'succeed')).toThrow();
    expect(() => nextStatus('canceled', 'start')).toThrow();
    expect(() => nextStatus('failed', 'succeed')).toThrow();
  });
});
