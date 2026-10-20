import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeagueInfoExtras } from './league-info-extras';

const league = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatch: () => league.value,
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1UpdateLeagueCoverImage: () => ({ mutate: vi.fn(), isPending: false }),
  useV1UpdateLeagueVenue: () => ({ mutate: vi.fn(), isPending: false }),
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false, error: null }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

describe('LeagueInfoExtras', () => {
  it('리그 이미지와 기본 장소를 리그 정보 폼 아래에 둔다', () => {
    league.value = { data: { leagueId: 'league-1', sportCode: 'futsal', coverImageUrl: '/uploads/detail.webp', listImageUrl: '/uploads/list.webp', defaultPlace: null, recentVenues: [] } };
    render(<LeagueInfoExtras leagueId="league-1" />);

    expect(screen.getByRole('region', { name: '리그 이미지' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '목록 이미지 미리보기' }).style.backgroundImage).toContain('/uploads/list.webp');
    expect(screen.getByRole('img', { name: '상세 이미지 미리보기' }).style.backgroundImage).toContain('/uploads/detail.webp');
    expect(screen.getByRole('region', { name: '기본 장소' })).toBeInTheDocument();
  });

  it('리그 정보가 오기 전에는 아무것도 그리지 않는다', () => {
    league.value = { data: undefined };
    const { container } = render(<LeagueInfoExtras leagueId="league-1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
