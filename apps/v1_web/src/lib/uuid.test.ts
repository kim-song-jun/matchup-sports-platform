import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomUuid', () => {
  it('uses crypto.randomUUID when the runtime provides it', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() });

    expect(randomUuid()).toBe('11111111-1111-4111-8111-111111111111');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to getRandomValues on WebViews without randomUUID', () => {
    // 구형 Capacitor Android WebView: getRandomValues만 존재.
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xff);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const value = randomUuid();
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    // 버전(4)·variant(10xx) 비트가 RFC 4122를 만족해야 한다 — 0xff 채움이어도 마스킹된다.
    expect(value).toMatch(UUID_V4);
  });

  it('produces distinct values across calls', () => {
    let counter = 0;
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(counter++);
        return bytes;
      },
    });

    expect(randomUuid()).not.toBe(randomUuid());
  });

  it('throws instead of falling back to insecure randomness', () => {
    vi.stubGlobal('crypto', {});
    expect(() => randomUuid()).toThrow('안전한 식별자');
  });
});
