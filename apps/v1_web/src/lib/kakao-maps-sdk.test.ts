import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadKakaoMapsSdk', () => {
  afterEach(() => {
    document.head.querySelectorAll('script[src*="dapi.kakao.com"]').forEach((el) => el.remove());
    delete (window as { kakao?: unknown }).kakao;
  });

  it('동시 호출은 maps.load 콜백이 끝난 뒤에야 둘 다 resolve 되고 그때 LatLng 을 쓸 수 있다', async () => {
    vi.resetModules();
    const { loadKakaoMapsSdk } = await import('./kakao-maps-sdk');
    let loadCallback: (() => void) | null = null;
    const maps: Record<string, unknown> = {
      load: (cb: () => void) => {
        loadCallback = cb;
      },
    };

    const first = loadKakaoMapsSdk('key');
    // autoload=false: script onload 직후엔 maps 네임스페이스만 있고 LatLng 은 아직 없다.
    Object.assign(window, { kakao: { maps } });
    document.head.querySelector<HTMLScriptElement>('script[src*="dapi.kakao.com"]')!.onload?.(new Event('load'));
    const second = loadKakaoMapsSdk('key');

    let settled = 0;
    void first.then(() => settled++);
    void second.then(() => settled++);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(0);

    maps.LatLng = vi.fn();
    loadCallback!();
    await Promise.all([first, second]);
    expect(settled).toBe(2);
    expect(typeof window.kakao?.maps.LatLng).toBe('function');
    expect(document.head.querySelectorAll('script[src*="dapi.kakao.com"]')).toHaveLength(1);
  });
});
