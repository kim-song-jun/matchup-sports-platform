import { afterEach, describe, expect, it, vi } from 'vitest';

// The loader caches its promise at module level; a fresh module per test keeps them independent.
async function freshLoader() {
  vi.resetModules();
  return import('./kakao-js-sdk');
}

afterEach(() => {
  delete window.Kakao;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
});

function scripts() {
  return document.head.querySelectorAll('script[src^="https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/"]');
}

describe('Kakao JS SDK loader', () => {
  it('injects one pinned script with SRI and shares it between callers', async () => {
    const { KAKAO_JS_SDK_INTEGRITY, loadKakaoJsSdk } = await freshLoader();
    const first = loadKakaoJsSdk();
    const second = loadKakaoJsSdk();
    expect(scripts()).toHaveLength(1);
    const script = scripts()[0] as HTMLScriptElement;
    expect(script.integrity).toBe(KAKAO_JS_SDK_INTEGRITY);
    expect(script.crossOrigin).toBe('anonymous');

    const sdk = { init: vi.fn(), isInitialized: () => false, Auth: { authorize: vi.fn() } };
    window.Kakao = sdk;
    script.onload?.(new Event('load'));
    await expect(first).resolves.toBe(sdk);
    await expect(second).resolves.toBe(sdk);
  });

  it('clears the cache on a failed load so the next call retries', async () => {
    const { loadKakaoJsSdk } = await freshLoader();
    const failed = loadKakaoJsSdk();
    (scripts()[0] as HTMLScriptElement).onerror?.(new Event('error'));
    await expect(failed).rejects.toThrow('Failed to load Kakao JS SDK script');
    expect(scripts()).toHaveLength(0);

    void loadKakaoJsSdk();
    expect(scripts()).toHaveLength(1);
    window.Kakao = { init: vi.fn(), isInitialized: () => true, Auth: { authorize: vi.fn() } };
    (scripts()[0] as HTMLScriptElement).onload?.(new Event('load'));
  });

  it('initialises once with the key and skips init when already initialised', async () => {
    const init = vi.fn();
    let ready = false;
    window.Kakao = { init: (key: string) => { init(key); ready = true; }, isInitialized: () => ready, Auth: { authorize: vi.fn() } };
    const { getInitializedKakaoJsSdk } = await freshLoader();
    await getInitializedKakaoJsSdk('js-key');
    await getInitializedKakaoJsSdk('js-key');
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith('js-key');
  });
});
