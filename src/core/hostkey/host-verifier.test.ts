import { describe, it, expect } from 'vitest';
import {
  planHostKeyAction,
  resolveHostKeyAction,
  buildHostKeyPrompt,
  isPromptConsent,
  createHostVerifier,
  type HostKeyPromptRequest,
} from './host-verifier';
import type { HostKeyVerdict } from './known-hosts';

describe('planHostKeyAction', () => {
  it('accepts a trusted key outright, under either policy', () => {
    expect(planHostKeyAction('trusted', 'tofu')).toEqual({
      outcome: 'accept',
      recordOnConsent: false,
      reason: 'trusted',
    });
    expect(planHostKeyAction('trusted', 'strict')).toEqual({
      outcome: 'accept',
      recordOnConsent: false,
      reason: 'trusted',
    });
  });

  it('always rejects a mismatched key (possible MITM)', () => {
    expect(planHostKeyAction('mismatch', 'tofu')).toEqual({
      outcome: 'reject',
      recordOnConsent: false,
      reason: 'mismatch',
    });
    expect(planHostKeyAction('mismatch', 'strict')).toEqual({
      outcome: 'reject',
      recordOnConsent: false,
      reason: 'mismatch',
    });
  });

  it('asks the user before trusting an unknown key under TOFU', () => {
    expect(planHostKeyAction('unknown', 'tofu')).toEqual({
      outcome: 'prompt',
      recordOnConsent: true,
      reason: 'unknown',
    });
  });

  it('rejects an unknown key under strict without asking', () => {
    expect(planHostKeyAction('unknown', 'strict')).toEqual({
      outcome: 'reject',
      recordOnConsent: false,
      reason: 'policy',
    });
  });
});

describe('resolveHostKeyAction', () => {
  it('accepts without recording when the plan is accept', () => {
    const plan = planHostKeyAction('trusted', 'tofu');
    expect(resolveHostKeyAction(plan, true)).toEqual({ accept: true, record: false });
    expect(resolveHostKeyAction(plan, false)).toEqual({ accept: true, record: false });
  });

  it('rejects regardless of consent when the plan is reject', () => {
    const plan = planHostKeyAction('mismatch', 'tofu');
    expect(resolveHostKeyAction(plan, true)).toEqual({ accept: false, record: false });
  });

  it('records only when the user consented to a prompt', () => {
    const plan = planHostKeyAction('unknown', 'tofu');
    expect(resolveHostKeyAction(plan, true)).toEqual({ accept: true, record: true });
    expect(resolveHostKeyAction(plan, false)).toEqual({ accept: false, record: false });
  });
});

const t = (key: string, params?: Record<string, string | number>): string =>
  params
    ? `${key}|${Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')}`
    : key;

describe('buildHostKeyPrompt', () => {
  const unknownReq: HostKeyPromptRequest = {
    host: 'example.com',
    port: 22,
    fingerprint: 'SHA256:FIXEDFP',
    verdict: 'unknown',
    knownFingerprint: null,
  };

  it('presents the SHA256 fingerprint and offers accept/reject for an unknown key', () => {
    const content = buildHostKeyPrompt(unknownReq, t);
    expect(content.message).toBe('hostkey.prompt.unknown.message|host=example.com,port=22');
    expect(content.detail).toContain('SHA256:FIXEDFP');
    expect(content.buttons).toHaveLength(2);
    expect(content.acceptId).toBe(1);
  });

  it('defaults to the rejecting button (fail closed)', () => {
    const content = buildHostKeyPrompt(unknownReq, t);
    expect(content.defaultId).toBe(0);
    expect(content.cancelId).toBe(0);
    expect(content.defaultId).not.toBe(content.acceptId);
  });

  it('warns without offering acceptance for a mismatched key', () => {
    const content = buildHostKeyPrompt(
      { ...unknownReq, verdict: 'mismatch', knownFingerprint: 'SHA256:OLDFP' },
      t,
    );
    expect(content.message).toBe('hostkey.prompt.mismatch.message|host=example.com,port=22');
    expect(content.detail).toContain('SHA256:OLDFP');
    expect(content.detail).toContain('SHA256:FIXEDFP');
    expect(content.buttons).toHaveLength(1);
    expect(content.acceptId).toBe(-1);
  });
});

describe('isPromptConsent', () => {
  it('is true only for the accept button index', () => {
    const content = buildHostKeyPrompt(
      { host: 'h', port: 22, fingerprint: 'SHA256:X', verdict: 'unknown', knownFingerprint: null },
      t,
    );
    expect(isPromptConsent(content, content.acceptId)).toBe(true);
    expect(isPromptConsent(content, 0)).toBe(false);
  });

  it('is never true when acceptance is not offered', () => {
    const content = buildHostKeyPrompt(
      { host: 'h', port: 22, fingerprint: 'SHA256:X', verdict: 'mismatch', knownFingerprint: 'SHA256:Y' },
      t,
    );
    expect(isPromptConsent(content, -1)).toBe(false);
    expect(isPromptConsent(content, 0)).toBe(false);
  });
});

interface Recorded {
  host: string;
  port: number;
  fingerprint: string;
}

function makeCtx(
  verdict: HostKeyVerdict,
  policy: 'tofu' | 'strict',
  confirm?: (request: HostKeyPromptRequest) => Promise<boolean>,
) {
  const recorded: Recorded[] = [];
  const verifiedWith: string[] = [];
  const rejected: HostKeyPromptRequest[] = [];
  const asked: HostKeyPromptRequest[] = [];
  const verifier = createHostVerifier({
    host: 'example.com',
    port: 22,
    policy,
    fingerprintOf: () => 'SHA256:FIXEDFP',
    verify: (_h, _p, fp) => {
      verifiedWith.push(fp);
      return verdict;
    },
    knownFingerprintOf: () => (verdict === 'mismatch' ? 'SHA256:OLDFP' : null),
    ...(confirm
      ? {
          confirm: (req: HostKeyPromptRequest) => {
            asked.push(req);
            return confirm(req);
          },
        }
      : {}),
    onAccept: (host, port, fingerprint) => recorded.push({ host, port, fingerprint }),
    onReject: (req) => rejected.push(req),
  });
  return { verifier, recorded, verifiedWith, rejected, asked };
}

function run(verifier: (key: Buffer, cb: (ok: boolean) => void) => void): Promise<boolean> {
  return new Promise((resolve) => {
    verifier(Buffer.from('key'), resolve);
  });
}

describe('createHostVerifier', () => {
  it('TOFU: asks the user about an unknown key and records it once consented', async () => {
    const { verifier, recorded, verifiedWith, asked } = makeCtx('unknown', 'tofu', async () => true);
    await expect(run(verifier)).resolves.toBe(true);
    expect(asked).toEqual([
      {
        host: 'example.com',
        port: 22,
        fingerprint: 'SHA256:FIXEDFP',
        verdict: 'unknown',
        knownFingerprint: null,
      },
    ]);
    expect(recorded).toEqual([{ host: 'example.com', port: 22, fingerprint: 'SHA256:FIXEDFP' }]);
    expect(verifiedWith).toEqual(['SHA256:FIXEDFP']);
  });

  it('TOFU: rejects and records nothing when the user declines', async () => {
    const { verifier, recorded, rejected } = makeCtx('unknown', 'tofu', async () => false);
    await expect(run(verifier)).resolves.toBe(false);
    expect(recorded).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it('rejects an unknown key when no confirm handler is wired (fail closed)', async () => {
    const { verifier, recorded } = makeCtx('unknown', 'tofu');
    await expect(run(verifier)).resolves.toBe(false);
    expect(recorded).toEqual([]);
  });

  it('rejects when the confirm handler throws', async () => {
    const { verifier, recorded } = makeCtx('unknown', 'tofu', async () => {
      throw new Error('dialog failed');
    });
    await expect(run(verifier)).resolves.toBe(false);
    expect(recorded).toEqual([]);
  });

  it('strict: rejects an unknown key without asking', async () => {
    const { verifier, recorded, asked } = makeCtx('unknown', 'strict', async () => true);
    await expect(run(verifier)).resolves.toBe(false);
    expect(asked).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it('always rejects a mismatched key without asking, and reports it', async () => {
    const { verifier, recorded, asked, rejected } = makeCtx('mismatch', 'tofu', async () => true);
    await expect(run(verifier)).resolves.toBe(false);
    expect(asked).toEqual([]);
    expect(recorded).toEqual([]);
    expect(rejected[0].knownFingerprint).toBe('SHA256:OLDFP');
  });

  it('accepts a trusted key without asking or recording', async () => {
    const { verifier, recorded, asked } = makeCtx('trusted', 'tofu', async () => true);
    await expect(run(verifier)).resolves.toBe(true);
    expect(asked).toEqual([]);
    expect(recorded).toEqual([]);
  });
});
