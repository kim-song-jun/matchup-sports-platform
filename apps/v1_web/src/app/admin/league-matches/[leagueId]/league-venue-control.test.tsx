import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueVenueControl } from './league-venue-control';

const { saveMutate, canWrite } = vi.hoisted(() => ({ saveMutate: vi.fn(), canWrite: { value: true } }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => canWrite.value }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1UpdateLeagueVenue: () => ({ mutate: saveMutate, isPending: false }),
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false, error: null }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

const SANGAM = {
  name: '상암 풋살파크',
  address: '서울 마포구 월드컵로 240',
  latitude: 37.5683,
  longitude: 126.8972,
  provider: 'kakao' as const,
  providerPlaceId: 'kakao-sangam',
};
const MANGWON = { name: '망원 유수지', address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null };

describe('LeagueVenueControl', () => {
  beforeEach(() => {
    saveMutate.mockReset();
    canWrite.value = true;
  });

  it('기본 장소가 없으면 안내와 "장소 정하기" 만 보이고 지우기는 없다', () => {
    render(<LeagueVenueControl leagueId="league-1" defaultPlace={null} />);
    expect(screen.getByText('기본 장소가 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '장소 정하기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '지우기' })).toBeNull();
  });

  it('바꾸기로 최근 장소를 고르면 이름·주소·좌표 스냅샷으로 PATCH 하고 저장 안내를 보인다', () => {
    render(<LeagueVenueControl leagueId="league-1" defaultPlace={MANGWON} recentVenues={[SANGAM]} />);
    expect(screen.getByText('망원 유수지')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    fireEvent.click(screen.getByRole('button', { name: /상암 풋살파크/ }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(saveMutate.mock.calls[0][0]).toEqual({
      venue: '상암 풋살파크',
      venueAddress: '서울 마포구 월드컵로 240',
      venueLatitude: 37.5683,
      venueLongitude: 126.8972,
      venueProvider: 'kakao',
      venueProviderId: 'kakao-sangam',
    });
    act(() => saveMutate.mock.calls[0][1].onSuccess());
    expect(screen.getByRole('status')).toHaveTextContent('기본 장소를 저장했어요.');
  });

  it('지우기는 venue: null 만 보내고, 서버가 거부하면 메시지를 보인다', () => {
    render(<LeagueVenueControl leagueId="league-1" defaultPlace={SANGAM} />);
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));

    expect(saveMutate.mock.calls[0][0]).toEqual({ venue: null });
    act(() => saveMutate.mock.calls[0][1].onError(new Error('권한이 없어요.')));
    expect(screen.getByRole('alert')).toHaveTextContent('권한이 없어요.');
  });

  it('쓰기 권한이 없으면 바꾸기·지우기 버튼이 없다', () => {
    canWrite.value = false;
    render(<LeagueVenueControl leagueId="league-1" defaultPlace={SANGAM} />);
    expect(screen.queryByRole('button', { name: '바꾸기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '지우기' })).toBeNull();
  });
});
