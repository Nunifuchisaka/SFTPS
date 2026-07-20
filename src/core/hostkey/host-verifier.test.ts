import { describe, it, expect } from 'vitest';
import { decideHostKeyAction, createHostVerifier } from './host-verifier';
import type { HostKeyVerdict } from './known-hosts';

describe('decideHostKeyAction', () => {
  it('accepts a trusted key without recording, under either policy', () => {
    expect(decideHostKeyAction('trusted', 'tofu')).toEqual({ accept: true, record: false });
    expect(decideHostKeyAction('trusted', 'strict')).toEqual({ accept: true, record: false });
  });

  it('always rejects a mismatched key (possible MITM)', () => {
    expect(decideHostKeyAction('mismatch', 'tofu')).toEqual({ accept: false, record: false });
    expect(decideHostKeyAction('mismatch', 'strict')).toEqual({ accept: false, record: false });
  });

  it('accepts and records an unknown key under TOFU', () => {
    expect(decideHostKeyAction('unknown', 'tofu')).toEqual({ accept: true, record: true });
  });

  it('rejects an unknown key under strict', () => {
    expect(decideHostKeyAction('unknown', 'strict')).toEqual({ accept: false, record: false });
  });
});

interface Recorded {
  host: string;
  port: number;
  fingerprint: string;
}

function makeCtx(verdict: HostKeyVerdict, policy: 'tofu' | 'strict') {
  const recorded: Recorded[] = [];
  const verifiedWith: string[] = [];
  const verifier = createHostVerifier({
    host: 'example.com',
    port: 22,
    policy,
    fingerprintOf: () => 'SHA256:FIXEDFP',
    verify: (_h, _p, fp) => {
      verifiedWith.push(fp);
      return verdict;
    },
    onAccept: (host, port, fingerprint) => recorded.push({ host, port, fingerprint }),
  });
  return { verifier, recorded, verifiedWith };
}

function run(verifier: (key: Buffer, cb: (ok: boolean) => void) => void): boolean {
  let result = false;
  verifier(Buffer.from('key'), (ok) => {
    result = ok;
  });
  return result;
}

describe('createHostVerifier', () => {
  it('TOFU: accepts an unknown key and records it', () => {
    const { verifier, recorded, verifiedWith } = makeCtx('unknown', 'tofu');
    expect(run(verifier)).toBe(true);
    expect(recorded).toEqual([{ host: 'example.com', port: 22, fingerprint: 'SHA256:FIXEDFP' }]);
    expect(verifiedWith).toEqual(['SHA256:FIXEDFP']);
  });

  it('strict: rejects an unknown key and records nothing', () => {
    const { verifier, recorded } = makeCtx('unknown', 'strict');
    expect(run(verifier)).toBe(false);
    expect(recorded).toEqual([]);
  });

  it('always rejects a mismatched key and records nothing', () => {
    const { verifier, recorded } = makeCtx('mismatch', 'tofu');
    expect(run(verifier)).toBe(false);
    expect(recorded).toEqual([]);
  });

  it('accepts a trusted key without recording', () => {
    const { verifier, recorded } = makeCtx('trusted', 'tofu');
    expect(run(verifier)).toBe(true);
    expect(recorded).toEqual([]);
  });
});
