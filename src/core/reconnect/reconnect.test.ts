import { describe, it, expect } from 'vitest';
import {
  classifyConnectionError,
  connectionErrorMessageKey,
  isRetryableConnectionError,
  shouldReconnect,
  establishConnection,
  type ReconnectOptions,
} from './index';

const opts: ReconnectOptions = { maxAttempts: 3, baseDelayMs: 100, factor: 2, maxDelayMs: 1000 };

describe('classifyConnectionError', () => {
  it('classifies network/timeout errors as retryable', () => {
    expect(classifyConnectionError({ code: 'ETIMEDOUT' })).toBe('retryable');
    expect(classifyConnectionError(new Error('socket hang up'))).toBe('retryable');
  });

  it('classifies authentication failures', () => {
    expect(classifyConnectionError(new Error('Authentication failed'))).toBe('auth');
    expect(classifyConnectionError(new Error('Permission denied (publickey)'))).toBe('auth');
    expect(
      classifyConnectionError(new Error('All configured authentication methods failed')),
    ).toBe('auth');
  });

  it('classifies ssh2 host key rejection (the message our verifier produces)', () => {
    expect(classifyConnectionError(new Error('Host denied (verification failed)'))).toBe('hostkey');
    expect(classifyConnectionError(new Error('Handshake failed: host key verification'))).toBe(
      'hostkey',
    );
  });

  it('classifies TLS certificate verification failures', () => {
    expect(classifyConnectionError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })).toBe('tls');
    expect(classifyConnectionError({ code: 'CERT_HAS_EXPIRED' })).toBe('tls');
    expect(classifyConnectionError(new Error('unable to verify the first certificate'))).toBe('tls');
    expect(classifyConnectionError(new Error('self-signed certificate in certificate chain'))).toBe(
      'tls',
    );
  });
});

describe('connectionErrorMessageKey', () => {
  it('maps security failures to their own warning text', () => {
    expect(connectionErrorMessageKey('hostkey')).toBe('conn.error.hostkey');
    expect(connectionErrorMessageKey('tls')).toBe('conn.error.tls');
    expect(connectionErrorMessageKey('auth')).toBe('conn.error.auth');
  });

  it('has no dedicated text for ordinary retryable errors', () => {
    expect(connectionErrorMessageKey('retryable')).toBeNull();
  });
});

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

  it('never retries a host key rejection (do not keep dialing a suspected MITM)', () => {
    expect(isRetryableConnectionError(new Error('Host denied (verification failed)'))).toBe(false);
  });

  it('never retries a certificate verification failure', () => {
    expect(isRetryableConnectionError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })).toBe(false);
    expect(isRetryableConnectionError(new Error('unable to verify the first certificate'))).toBe(
      false,
    );
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

  it('never retries a host key rejection', () => {
    expect(shouldReconnect(new Error('Host denied (verification failed)'), 1, opts)).toEqual({
      retry: false,
      delayMs: 0,
    });
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

  it('does not retry on a host key rejection (fails fast)', async () => {
    let attempts = 0;
    await expect(
      establishConnection(
        async () => {
          attempts++;
          throw new Error('Host denied (verification failed)');
        },
        opts,
        async () => {},
      ),
    ).rejects.toThrow('Host denied');
    expect(attempts).toBe(1);
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
