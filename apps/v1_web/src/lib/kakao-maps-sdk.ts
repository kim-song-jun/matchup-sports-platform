// 카카오맵 JS SDK 최소 타입 shim(실제로 쓰는 부분만)과 앱당 한 번 로더.
interface KakaoLatLng {}
interface KakaoMapInstance {
  relayout: () => void;
  setCenter: (latlng: KakaoLatLng) => void;
}
interface KakaoMarkerInstance {
  setMap: (map: KakaoMapInstance | null) => void;
}

export interface KakaoMapOptions {
  center: KakaoLatLng;
  level: number;
  draggable?: boolean;
  scrollwheel?: boolean;
  disableDoubleClick?: boolean;
  disableDoubleClickZoom?: boolean;
}

interface KakaoMapsNamespace {
  maps: {
    load: (callback: () => void) => void;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMapInstance;
    Marker: new (options: { position: KakaoLatLng }) => KakaoMarkerInstance;
  };
}

declare global {
  interface Window {
    kakao?: KakaoMapsNamespace;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

/** 중복 <script> 삽입을 막고 여러 지도 인스턴스가 한 번의 로드를 공유한다. 실패하면 캐시를 비워 다음 호출이 다시 시도한다. */
export function loadKakaoMapsSdk(appKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  // autoload=false 이면 script onload 직후 maps 는 있어도 maps.load 콜백 전에는 LatLng 이 없다 — 준비 판정은 LatLng 으로.
  if (typeof window.kakao?.maps?.LatLng === 'function') return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    const fail = (error: Error) => {
      sdkLoadPromise = null;
      script.remove();
      reject(error);
    };
    script.onload = () => {
      if (!window.kakao) {
        fail(new Error('Kakao Maps SDK loaded but window.kakao is missing'));
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => fail(new Error('Failed to load Kakao Maps SDK script'));
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}
