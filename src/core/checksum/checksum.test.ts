import { describe, it, expect } from 'vitest';
import { hashBuffer, verifyIntegrity, verifyBuffers } from './index';

describe('hashBuffer', () => {
  it('computes known sha256 digests', () => {
    expect(hashBuffer(Buffer.from(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(hashBuffer(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('supports switching the algorithm', () => {
    expect(hashBuffer(Buffer.from('abc'), 'sha1')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});

describe('verifyIntegrity', () => {
  it('reports ok when the two hashes match', () => {
    expect(verifyIntegrity('deadbeef', 'deadbeef')).toEqual({ ok: true });
  });
  it('reports not ok when the hashes differ', () => {
    expect(verifyIntegrity('deadbeef', 'feedface')).toEqual({ ok: false });
  });
});

describe('verifyBuffers', () => {
  it('ok for identical content', () => {
    expect(verifyBuffers(Buffer.from('hello'), Buffer.from('hello'))).toEqual({ ok: true });
  });
  it('not ok for differing content of the same length', () => {
    expect(verifyBuffers(Buffer.from('abc'), Buffer.from('abd'))).toEqual({ ok: false });
  });
});
