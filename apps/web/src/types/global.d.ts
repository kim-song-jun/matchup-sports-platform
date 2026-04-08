declare global {
  interface Window {
    Capacitor?: {
      getPlatform?: () => string;
    };
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        Marker: new (options: { position: KakaoLatLng; map?: KakaoMap }) => KakaoMarker;
        InfoWindow: new (options: { content: string; removable?: boolean }) => KakaoInfoWindow;
        event: {
          addListener: (target: KakaoMap | KakaoMarker, type: string, handler: () => void) => void;
        };
      };
    };
  }

  interface KakaoMapOptions {
    center: KakaoLatLng;
    level: number;
  }

  interface KakaoLatLng {
    getLat: () => number;
    getLng: () => number;
  }

  interface KakaoMap {
    setCenter: (latlng: KakaoLatLng) => void;
  }

  interface KakaoMarker {
    setMap: (map: KakaoMap | null) => void;
  }

  interface KakaoInfoWindow {
    open: (map: KakaoMap, marker: KakaoMarker) => void;
    close: () => void;
  }
}

export {};
