import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { v1Keys } from '@/lib/query-keys';
import { server } from '@/test/msw/server';

function mockKakaoKey(key: string | null) {
  server.use(
    http.get('*/api/v1/public/integrations/kakao-maps-key', () =>
      HttpResponse.json({ status: 'success', data: { kakaoMapsJsKey: key }, timestamp: '2026-10-10T00:00:00.000Z' }),
    ),
  );
}

async function renderPreview() {
  vi.resetModules();
  const { KakaoMapPreview } = await import('./kakao-map-preview');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (latitude: number, longitude: number) => (
    <QueryClientProvider client={client}>
      <KakaoMapPreview name="망원 풋살장" latitude={latitude} longitude={longitude} />
    </QueryClientProvider>
  );
  const view = render(tree(37.55, 126.9));
  return Object.assign(view, { rerenderAt: (lat: number, lng: number) => view.rerender(tree(lat, lng)) });
}

describe('KakaoMapPreview', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  beforeEach(() => {
    // jsdom 에는 IntersectionObserver 가 없다 — 없으면 컴포넌트가 즉시 로드하는 경로를 탄다.
    vi.stubGlobal('IntersectionObserver', undefined);
  });
  afterEach(() => {
    server.resetHandlers();
    vi.unstubAllGlobals();
    document.head.querySelectorAll('script[src*="dapi.kakao.com"]').forEach((el) => el.remove());
    delete (window as { kakao?: unknown }).kakao;
  });

  it('키가 캐시에 이미 있어도 첫 렌더(서버 HTML)에는 지도 상자를 그리지 않는다 — 하이드레이션 불일치 방지', async () => {
    const { KakaoMapPreview } = await import('./kakao-map-preview');
    const client = new QueryClient();
    client.setQueryData(v1Keys.publicKakaoMapsKey(), { kakaoMapsJsKey: 'cached-js-key' });
    const html = renderToString(
      <QueryClientProvider client={client}>
        <KakaoMapPreview name="망원 풋살장" latitude={37.55} longitude={126.9} />
      </QueryClientProvider>,
    );
    expect(html).not.toContain('<a');
  });

  it('SDK 가 준비되면 드래그·휠 확대를 끈 지도를 만들고 핀을 꽂는다', async () => {
    mockKakaoKey('test-js-key');
    const setMap = vi.fn();
    const MapCtor = vi.fn(() => ({}));
    Object.assign(window, {
      kakao: {
        maps: {
          load: (cb: () => void) => cb(),
          LatLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
          Map: MapCtor,
          Marker: vi.fn(() => ({ setMap })),
        },
      },
    });

    await renderPreview();

    await waitFor(() => expect(setMap).toHaveBeenCalledTimes(1));
    expect(MapCtor.mock.calls[0]).toEqual([
      expect.any(HTMLElement),
      expect.objectContaining({ draggable: false, scrollwheel: false, disableDoubleClickZoom: true }),
    ]);
    expect(screen.getByRole('link', { name: '망원 풋살장 지도 크게 보기' })).toHaveAttribute('target', '_blank');
  });

  it('좌표가 바뀌면 같은 컨테이너에 지도를 또 만들지 않고 이전 핀을 걷어 낸 뒤 새로 그린다', async () => {
    mockKakaoKey('test-js-key');
    const setMap = vi.fn();
    const container = { current: null as HTMLElement | null };
    const MapCtor = vi.fn((el: HTMLElement) => {
      container.current = el;
      el.appendChild(document.createElement('canvas'));
      return {};
    });
    Object.assign(window, {
      kakao: {
        maps: {
          load: (cb: () => void) => cb(),
          LatLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
          Map: MapCtor,
          Marker: vi.fn(() => ({ setMap })),
        },
      },
    });

    const view = await renderPreview();
    await waitFor(() => expect(MapCtor).toHaveBeenCalledTimes(1));

    view.rerenderAt(37.6, 127.0);
    await waitFor(() => expect(MapCtor).toHaveBeenCalledTimes(2));
    // 이전 핀은 지도에서 떼였고, 컨테이너에는 새 지도의 캔버스 하나만 남는다.
    expect(setMap).toHaveBeenCalledWith(null);
    expect(container.current?.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('스크립트 로드가 실패하면 상자를 접는다', async () => {
    mockKakaoKey('test-js-key');
    const { container } = await renderPreview();
    await screen.findByRole('link', { name: '망원 풋살장 지도 크게 보기' });

    const script = await waitFor(() => {
      const el = document.head.querySelector<HTMLScriptElement>('script[src*="dapi.kakao.com"]');
      if (!el) throw new Error('script not injected');
      return el;
    });
    script.onerror?.(new Event('error'));

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('JS 키가 없으면 아무것도 그리지 않는다', async () => {
    let keyRequested = false;
    server.use(
      http.get('*/api/v1/public/integrations/kakao-maps-key', () => {
        keyRequested = true;
        return HttpResponse.json({ status: 'success', data: { kakaoMapsJsKey: null }, timestamp: '2026-10-10T00:00:00.000Z' });
      }),
    );
    const { container } = await renderPreview();
    await waitFor(() => expect(keyRequested).toBe(true));
    // 응답이 쿼리 상태에 반영될 시간을 준 뒤에도 비어 있어야 "키 없음 → 렌더 없음" 이다.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
    expect(document.head.querySelector('script[src*="dapi.kakao.com"]')).toBeNull();
  });
});
