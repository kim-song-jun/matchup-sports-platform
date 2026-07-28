/**
 * tournament-venue-map.test.tsx
 *
 * Contract tests for the WebPushService-style graceful-disable pattern applied to the
 * Kakao map embed: no JS key (env var nor admin setting) → renders nothing, ever; key
 * present → injects the SDK script with the right URL and draws a marker at the venue's
 * coordinates once the SDK reports ready; SDK load failure → falls back to nothing.
 *
 * The module under test caches its SDK-load promise at module scope (loads the script
 * only once per page), so each test re-imports a fresh module instance via
 * vi.resetModules() to avoid one test's cached load state leaking into the next.
 */
import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TournamentVenueMap as TournamentVenueMapType } from './tournament-venue-map';

const kakaoMapsKeyMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicKakaoMapsKey: () => kakaoMapsKeyMock(),
}));

async function freshTournamentVenueMap(): Promise<typeof TournamentVenueMapType> {
  vi.resetModules();
  const mod = await import('./tournament-venue-map');
  return mod.TournamentVenueMap;
}

function clearInjectedScripts() {
  document.head.querySelectorAll('script[src*="dapi.kakao.com"]').forEach((el) => el.remove());
}

describe('TournamentVenueMap', () => {
  beforeEach(() => {
    kakaoMapsKeyMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearInjectedScripts();
    delete (window as { kakao?: unknown }).kakao;
  });

  it('no JS key configured (env var nor admin setting) → renders nothing', async () => {
    kakaoMapsKeyMock.mockReturnValue({ data: { kakaoMapsJsKey: null } });
    const TournamentVenueMap = await freshTournamentVenueMap();

    const { container } = render(
      createElement(TournamentVenueMap, { venue: '잠실종합운동장', latitude: 37.5, longitude: 127.07 }),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('JS key present → injects the Kakao Maps SDK script with the key in the URL and renders the map container', async () => {
    kakaoMapsKeyMock.mockReturnValue({ data: { kakaoMapsJsKey: 'test-js-key' } });
    const TournamentVenueMap = await freshTournamentVenueMap();

    render(createElement(TournamentVenueMap, { venue: '잠실종합운동장', latitude: 37.5, longitude: 127.07 }));

    expect(screen.getByRole('img', { name: '잠실종합운동장 위치 지도' })).toBeInTheDocument();
    const scriptEl = document.head.querySelector('script[src*="dapi.kakao.com"]') as HTMLScriptElement;
    expect(scriptEl).toBeTruthy();
    expect(scriptEl.src).toContain('dapi.kakao.com/v2/maps/sdk.js');
    expect(scriptEl.src).toContain('appkey=test-js-key');
    expect(scriptEl.src).toContain('autoload=false');
  });

  it('SDK reports ready → constructs a map centered on the venue coordinates and drops a marker', async () => {
    kakaoMapsKeyMock.mockReturnValue({ data: { kakaoMapsJsKey: 'test-js-key' } });
    const TournamentVenueMap = await freshTournamentVenueMap();

    const setMap = vi.fn();
    const MarkerCtor = vi.fn(() => ({ setMap }));
    const MapCtor = vi.fn(() => ({}));
    const LatLngCtor = vi.fn((lat: number, lng: number) => ({ lat, lng }));

    render(createElement(TournamentVenueMap, { venue: '잠실종합운동장', latitude: 37.5, longitude: 127.07 }));

    // Simulate the real dapi.kakao.com script downloading + firing onload, at which
    // point window.kakao becomes available and the SDK's own maps.load() callback runs.
    const scriptEl = document.head.querySelector('script[src*="dapi.kakao.com"]') as HTMLScriptElement;
    (window as unknown as { kakao: unknown }).kakao = {
      maps: {
        load: (cb: () => void) => cb(),
        LatLng: LatLngCtor,
        Map: MapCtor,
        Marker: MarkerCtor,
      },
    };
    scriptEl.onload?.(new Event('load'));

    await waitFor(() => expect(MapCtor).toHaveBeenCalled());
    expect(LatLngCtor).toHaveBeenCalledWith(37.5, 127.07);
    expect(MarkerCtor).toHaveBeenCalledWith(expect.objectContaining({ position: { lat: 37.5, lng: 127.07 } }));
    expect(setMap).toHaveBeenCalled();
  });

  it('SDK script fails to load → falls back to rendering nothing (never leaves a broken/empty map box)', async () => {
    kakaoMapsKeyMock.mockReturnValue({ data: { kakaoMapsJsKey: 'test-js-key' } });
    const TournamentVenueMap = await freshTournamentVenueMap();

    const { container } = render(
      createElement(TournamentVenueMap, { venue: '잠실종합운동장', latitude: 37.5, longitude: 127.07 }),
    );
    expect(screen.getByRole('img', { name: /위치 지도/ })).toBeInTheDocument();

    const scriptEl = document.head.querySelector('script[src*="dapi.kakao.com"]') as HTMLScriptElement;
    scriptEl.onerror?.(new Event('error'));

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
