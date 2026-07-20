import { describe, it, expect } from 'vitest';
import { nextRetryDelay, type RetryOptions } from './retry';

const opts: RetryOptions = { maxAttempts: 3, baseDelayMs: 100, factor: 2, maxDelayMs: 1000 };

describe('nextRetryDelay', () => {
  it('grows exponentially with the attempt number', () => {
    expect(nextRetryDelay(1, opts)).toBe(100); // 100 * 2^0
    expect(nextRetryDelay(2, opts)).toBe(200); // 100 * 2^1
  });

  it('returns null once maxAttempts is reached (no more retries)', () => {
    expect(nextRetryDelay(3, opts)).toBeNull();
    expect(nextRetryDelay(4, opts)).toBeNull();
  });

  it('clamps the delay to maxDelayMs', () => {
    const clampy: RetryOptions = { maxAttempts: 5, baseDelayMs: 100, factor: 10, maxDelayMs: 500 };
    expect(nextRetryDelay(1, clampy)).toBe(100);
    expect(nextRetryDelay(2, clampy)).toBe(500); // 1000 clamped
    expect(nextRetryDelay(3, clampy)).toBe(500); // 10000 clamped
  });
});
