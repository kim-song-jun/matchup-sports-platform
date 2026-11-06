import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomIndex } from './random-index';

afterEach(() => vi.restoreAllMocks());

describe('uniform random index', () => {
  it('rejects the extra outcome rather than mapping it onto the first team', () => {
    const samples = [0xffffffff, 2];
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint32Array)[0] = samples.shift()!;
      return array;
    });
    expect(randomIndex(3)).toBe(2);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('preserves every index for a power-of-two team count', () => {
    for (let index = 0; index < 64; index++) {
      vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
        (array as Uint32Array)[0] = index;
        return array;
      });
      expect(randomIndex(64)).toBe(index);
    }
  });

  it('handles a single outcome and rejects invalid bounds', () => {
    expect(randomIndex(1)).toBe(0);
    for (const bound of [0, -1, 1.5, NaN, Infinity, 0x100000001]) {
      expect(() => randomIndex(bound)).toThrow(RangeError);
    }
  });

  it('keeps the full unsigned 32-bit range', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint32Array)[0] = 0xffffffff;
      return array;
    });
    expect(randomIndex(0x100000000)).toBe(0xffffffff);
  });
});
