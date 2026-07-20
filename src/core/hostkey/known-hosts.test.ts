import { describe, it, expect } from 'vitest';
import { KnownHostsStore, serializeKnownHosts, parseKnownHosts } from './known-hosts';

const FP_A = 'SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const FP_B = 'SHA256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('KnownHostsStore.verify', () => {
  it('returns "unknown" for a host that has never been seen', () => {
    const store = new KnownHostsStore();
    expect(store.verify('example.com', 22, FP_A)).toBe('unknown');
  });

  it('returns "trusted" when the fingerprint matches the stored one', () => {
    const store = new KnownHostsStore();
    store.add('example.com', 22, FP_A);
    expect(store.verify('example.com', 22, FP_A)).toBe('trusted');
  });

  it('returns "mismatch" when the host is known but the fingerprint differs', () => {
    const store = new KnownHostsStore();
    store.add('example.com', 22, FP_A);
    expect(store.verify('example.com', 22, FP_B)).toBe('mismatch');
  });

  it('keys entries by host and port (different port is a different host)', () => {
    const store = new KnownHostsStore();
    store.add('example.com', 22, FP_A);
    expect(store.verify('example.com', 2222, FP_A)).toBe('unknown');
  });
});

describe('known_hosts JSON round-trip', () => {
  it('serializes and parses back to an equivalent store', () => {
    const store = new KnownHostsStore();
    store.add('a.example', 22, FP_A);
    store.add('b.example', 2222, FP_B);

    const json = serializeKnownHosts(store);
    const restored = parseKnownHosts(json);

    expect(restored.verify('a.example', 22, FP_A)).toBe('trusted');
    expect(restored.verify('b.example', 2222, FP_B)).toBe('trusted');
    expect(restored.lookup('a.example', 22)).toBe(FP_A);
  });
});
