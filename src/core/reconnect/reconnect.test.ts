import { describe, it, expect } from 'vitest';
import {
  isRetryableConnectionError,
  shouldReconnect,
  establishConnection,
  type ReconnectOptions,
} from './index';

const opts: ReconnectOptions = { maxAttempts: 3, baseDelayMs: 100, factor: 2, maxDelayMs: 1000 };

describe('isRetryableConnectionError', () => {
  it('treats network/timeout errors as retryable', () => {
    expect(isRetryableConnectionError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableConnectionError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isRetryableConnectionError(new Error('socket hang up'))).toBe(true);
    expect(isRetryableConnectionError(new Error('Connection timed out'))).toBe(true);
  });

  it('treats authentication failures as non-retryable', () => {
    expect(isRetryableConnectionError(new Error('Authentication failed'))).toBe(false);
    expect(isRetryableConnectionError(new Error('Permission denied (publickey)'))).toBe(false);
  });
});

describe('shouldReconnect', () => {
  it('retries a network error with exponential backoff until maxAttempts', () => {
    expect(shouldReconnect({ code: 'ETIMEDOUT' }, 1, opts)).toEqual({ retry: true, delayMs: 100 });
    expect(shouldReconnect({ code: 'ETIMEDOUT' }, 2, opts)).toEqual({ retry: true, delayMs: 200 });
    expect(shouldReconnect({ code: 'ETIMEDOUT' }, 3, opts)).toEqual({ retry: false, delayMs: 0 });
  });

  it('never retries an auth error', () => {
    expect(shouldReconnect(new Error('Authentication failed'), 1, opts)).toEqual({ retry: false, delayMs: 0 });
  });
});

describe('establishConnection', () => {
  it('retries a flaky connect and eventually succeeds', async () => {
    let attempts = 0;
    const delays: number[] = [];
    await establishConnection(
      async () => {
        attempts++;
        if (attempts < 3) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      },
      opts,
      async (ms) => {
        delays.push(ms);
      },
    );
    expect(attempts).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

  it('gives up after maxAttempts and rethrows', async () => {
    let attempts = 0;
    await expect(
      establishConnection(
        async () => {
          attempts++;
          throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
        },
        opts,
        async () => {},
      ),
    ).rejects.toThrow('refused');
    expect(attempts).toBe(3);
  });

  it('does not retry on an auth error (fails fast)', async () => {
    let attempts = 0;
    await expect(
      establishConnection(
        async () => {
          attempts++;
          throw new Error('Authentication failed');
        },
        opts,
        async () => {},
      ),
    ).rejects.toThrow('Authentication failed');
    expect(attempts).toBe(1);
  });
});
