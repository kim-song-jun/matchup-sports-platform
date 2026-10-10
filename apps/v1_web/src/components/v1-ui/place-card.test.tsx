import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw/server';
import type { V1PlaceView } from '@/types/api';
import { PlaceCard } from './place-card';

const withCoords: V1PlaceView = {
  name: '망원한강공원 풋살장',
  address: '서울 마포구 마포나루길 467',
  latitude: 37.5558,
  longitude: 126.8985,
  provider: 'kakao',
  providerPlaceId: 'kakao-1',
};
const nameOnly: V1PlaceView = {
  name: '동네 운동장',
  address: null,
  latitude: null,
  longitude: null,
  provider: null,
  providerPlaceId: null,
};

function renderCard(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function mockKakaoKey(key: string | null) {
  server.use(
    http.get('*/api/v1/public/integrations/kakao-maps-key', () =>
      HttpResponse.json({ status: 'success', data: { kakaoMapsJsKey: key }, timestamp: '2026-10-10T00:00:00.000Z' }),
    ),
  );
}

describe('PlaceCard', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    document.head.querySelectorAll('script[src*="dapi.kakao.com"]').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  it('좌표가 있으면 모바일에서 앱 길찾기 버튼 3개와 지도 미리보기 링크를 보여 준다', async () => {
    mockKakaoKey('test-js-key');
    renderCard(<PlaceCard place={withCoords} platform="android" />);

    expect(screen.getByRole('link', { name: '카카오맵으로 길찾기' })).toHaveAttribute('href', 'kakaomap://route?ep=37.5558,126.8985&by=CAR');
    expect(screen.getByRole('link', { name: '네이버맵으로 길찾기' }).getAttribute('href')).toContain('nmap://route/car?dlat=37.5558&dlng=126.8985');
    expect(screen.getByRole('link', { name: '티맵으로 길찾기' }).getAttribute('href')).toContain('tmap://route?goalx=126.8985&goaly=37.5558');
    const map = await screen.findByRole('link', { name: '망원한강공원 풋살장 지도 크게 보기' });
    expect(map.getAttribute('href')).toContain('https://map.kakao.com/link/map/');
    expect(screen.queryByText(/정확한 위치가 등록되지 않았어요/)).not.toBeInTheDocument();
  });

  it('데스크톱에서는 웹 URL 버튼 2개만 보여 준다(티맵은 웹 대상이 없다)', () => {
    renderCard(<PlaceCard place={withCoords} platform="web" />);
    expect(screen.getByRole('link', { name: '카카오맵으로 길찾기' }).getAttribute('href')).toContain('https://map.kakao.com/link/to/');
    expect(screen.queryByRole('link', { name: /티맵/ })).not.toBeInTheDocument();
  });

  it('좌표가 없으면 지도 없이 안내 문구와 이름 검색 버튼을 보여 준다', async () => {
    mockKakaoKey('test-js-key');
    renderCard(<PlaceCard place={nameOnly} platform="ios" />);

    expect(screen.getByText(/정확한 위치가 등록되지 않았어요/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /지도 크게 보기/ })).not.toBeInTheDocument();
    const kakao = screen.getByRole('link', { name: '카카오맵에서 이름 검색' });
    expect(kakao).toHaveAttribute('href', `kakaomap://search?q=${encodeURIComponent('동네 운동장')}`);
    expect(screen.queryByRole('button', { name: /주소 복사/ })).not.toBeInTheDocument();
  });

  it('지도 키가 없으면 지도 칸만 접히고 버튼은 그대로 동작한다', async () => {
    mockKakaoKey(null);
    renderCard(<PlaceCard place={withCoords} platform="android" />);
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3));
    expect(screen.queryByRole('link', { name: /지도 크게 보기/ })).not.toBeInTheDocument();
  });

  it('주소 복사를 누르면 클립보드에 주소를 쓰고 결과를 안내한다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderCard(<PlaceCard place={withCoords} platform="web" />);

    fireEvent.click(screen.getByRole('button', { name: /주소 복사/ }));

    await waitFor(() => expect(screen.getByText('주소를 복사했어요.')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith('서울 마포구 마포나루길 467');
  });

  it('클립보드 쓰기가 거절되면 직접 복사하라는 문구를 보여 준다', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderCard(<PlaceCard place={withCoords} platform="web" />);

    fireEvent.click(screen.getByRole('button', { name: /주소 복사/ }));

    expect(await screen.findByText(/주소를 복사하지 못했어요/)).toBeInTheDocument();
  });

  it('badge 슬롯을 이름 아래에 그린다', () => {
    renderCard(<PlaceCard place={withCoords} badge={<span>이 경기만 장소가 달라요</span>} platform="web" />);
    expect(screen.getByText('이 경기만 장소가 달라요')).toBeInTheDocument();
  });
});
