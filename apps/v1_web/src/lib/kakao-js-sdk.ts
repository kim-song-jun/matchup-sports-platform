// Kakao JS SDK (talk login) — separate from the Maps SDK (`window.kakao`); this one is `window.Kakao`.
export interface KakaoAuthorizeOptions {
  redirectUri: string;
  state: string;
  scope?: string;
  throughTalk?: boolean;
}

interface KakaoJsSdk {
  init: (appKey: string) => void;
  isInitialized: () => boolean;
  Auth: { authorize: (options: KakaoAuthorizeOptions) => void };
}

declare global {
  interface Window {
    Kakao?: KakaoJsSdk;
  }
}

export const KAKAO_JS_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
export const KAKAO_JS_SDK_INTEGRITY = 'sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy';

let sdkLoadPromise: Promise<KakaoJsSdk> | null = null;

/** One <script> per page; a failed load clears the cache so the next click retries. */
export function loadKakaoJsSdk(): Promise<KakaoJsSdk> {
  if (window.Kakao) return Promise.resolve(window.Kakao);
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<KakaoJsSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = KAKAO_JS_SDK_URL;
    script.integrity = KAKAO_JS_SDK_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.async = true;
    const fail = (error: Error) => {
      sdkLoadPromise = null;
      script.remove();
      reject(error);
    };
    script.onload = () => {
      if (window.Kakao) resolve(window.Kakao);
      else fail(new Error('Kakao JS SDK loaded but window.Kakao is missing'));
    };
    script.onerror = () => fail(new Error('Failed to load Kakao JS SDK script'));
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

/** Loads the SDK and initialises it once with the public JS key. */
export async function getInitializedKakaoJsSdk(appKey: string): Promise<KakaoJsSdk> {
  const sdk = await loadKakaoJsSdk();
  if (!sdk.isInitialized()) sdk.init(appKey);
  return sdk;
}
