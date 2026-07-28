import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getTournamentPostEventCards, getVenueNavigationLinks } from './tournament-venue-retention-model';
import { TournamentPostEventHubSection, TournamentVenuePrepSection } from './tournament-venue-retention-sections';
import type { V1TournamentFixture } from '@/types/api';

// TournamentVenueMap fetches the Kakao Maps JS key via this hook — 이 스위트에서는
// "키가 없다"는 (그래서 지도 임베드가 스킵되는) 상태를 고정해 규약대로 검증한다.
// 키가 있는 경로(실제 지도 렌더)는 tournament-venue-map.test.tsx에서 별도로 검증.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

describe('getTournamentPostEventCards', () => {
  it('links completed tournament fixtures to the review inbox instead of an upcoming placeholder', () => {
    const cards = getTournamentPostEventCards({
      status: 'completed',
      hasCompletedFixture: true,
      hasAnnouncements: false,
      sponsorCount: 0,
      announcements: [],
    });

    expect(cards.find((card) => card.key === 'reviews')).toMatchObject({
      title: '리뷰·매너 기록',
      status: 'available',
      actionLabel: '리뷰 작성',
      href: '/my/reviews',
    });
  });
});

describe('getVenueNavigationLinks', () => {
  it('builds correctly formatted kakao/naver/tmap route deep links + web fallbacks from venue + coordinates', () => {
    const links = getVenueNavigationLinks('잠실종합운동장', 37.5, 127.07);

    expect(links.find((l) => l.key === 'kakao')).toMatchObject({
      appHref: 'kakaomap://route?ep=37.5,127.07&by=CAR',
      fallbackHref: `https://map.kakao.com/link/to/${encodeURIComponent('잠실종합운동장')},37.5,127.07`,
    });
    expect(links.find((l) => l.key === 'naver')).toMatchObject({
      appHref: `nmap://route/car?dlat=37.5&dlng=127.07&dname=${encodeURIComponent('잠실종합운동장')}&appname=${encodeURIComponent('teameet.kr')}`,
      fallbackHref: 'https://map.naver.com/v5/directions/-/-/-/car?destination=127.07,37.5',
    });
    expect(links.find((l) => l.key === 'tmap')).toMatchObject({
      appHref: `tmap://route?goalx=127.07&goaly=37.5&goalname=${encodeURIComponent('잠실종합운동장')}`,
    });
  });

  it('picks the iOS App Store link for tmap fallback on iOS, Android Play Store link otherwise', () => {
    const iosLinks = getVenueNavigationLinks('장소', 37.5, 127.07, 'ios');
    const androidLinks = getVenueNavigationLinks('장소', 37.5, 127.07, 'android');
    const unknownLinks = getVenueNavigationLinks('장소', 37.5, 127.07, 'unknown');

    expect(iosLinks.find((l) => l.key === 'tmap')?.fallbackHref).toContain('apps.apple.com');
    expect(androidLinks.find((l) => l.key === 'tmap')?.fallbackHref).toContain('play.google.com');
    // 알 수 없는 플랫폼은 안드로이드(Play Store)로 안전하게 폴백한다.
    expect(unknownLinks.find((l) => l.key === 'tmap')?.fallbackHref).toContain('play.google.com');
  });
});

describe('TournamentVenuePrepSection — rendered venue info (regression guard for #위치/지도 정보 요청)', () => {
  it('renders the venue name with an external 지도에서 보기 link to a Naver map search when venue is set', () => {
    render(
      createElement(TournamentVenuePrepSection, {
        venue: '데일리그라운드 청라국제도시점',
        announcements: [],
      }),
    );

    expect(screen.getByText('데일리그라운드 청라국제도시점')).toBeInTheDocument();
    const mapLink = screen.getByRole('link', { name: '지도에서 보기' });
    expect(mapLink).toHaveAttribute(
      'href',
      'https://map.naver.com/v5/search/' + encodeURIComponent('데일리그라운드 청라국제도시점'),
    );
    expect(mapLink).toHaveAttribute('target', '_blank');
    expect(mapLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps showing the venue + map link and adds the operator notice as a supplementary line (notice never hides venue info)', () => {
    render(
      createElement(TournamentVenuePrepSection, {
        venue: '데일리그라운드 청라국제도시점',
        announcements: [{ id: 'ann-venue', title: '주차·입장·경기 준비 안내', category: 'venue' }],
      }),
    );

    expect(screen.getByRole('link', { name: '지도에서 보기' })).toBeInTheDocument();
    expect(screen.getByText('공지: 주차·입장·경기 준비 안내')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '공지 보기' })).toHaveAttribute('href', '#announcement-ann-venue');
  });

  it('falls back to the operator-notice-only copy when venue is null (rare edge case)', () => {
    render(createElement(TournamentVenuePrepSection, { venue: null, announcements: [] }));

    expect(screen.getByText('운영진 공지 확인')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '지도에서 보기' })).not.toBeInTheDocument();
  });

  it('coordinates present but no Kakao Maps JS key configured → 지도에서 보기 link is dropped, no map renders, but the navigation button still appears (key-less graceful fallback)', () => {
    render(
      createElement(TournamentVenuePrepSection, {
        venue: '잠실종합운동장',
        announcements: [],
        latitude: 37.5,
        longitude: 127.07,
      }),
    );

    expect(screen.getByText('잠실종합운동장')).toBeInTheDocument();
    // 좌표가 있으면 네이버 검색 링크(텍스트 검색)는 더 이상 노출하지 않는다 — 실제 지도/내비 버튼으로 대체.
    expect(screen.queryByRole('link', { name: '지도에서 보기' })).not.toBeInTheDocument();
    // JS 키가 없으므로(useV1PublicKakaoMapsKey mock이 null 반환) 지도 임베드 자체는 렌더되지 않는다.
    expect(screen.queryByRole('img', { name: /위치 지도/ })).not.toBeInTheDocument();
    // 하지만 좌표만 있으면 내비게이션 버튼은 키 유무와 무관하게 항상 노출된다.
    expect(screen.getByRole('button', { name: /내비게이션 앱으로 길찾기/ })).toBeInTheDocument();
  });

  it('no coordinates (venue-only, geocoding disabled/failed) → keeps the pre-existing Naver search fallback and shows no navigation button (regression guard)', () => {
    render(
      createElement(TournamentVenuePrepSection, {
        venue: '데일리그라운드 청라국제도시점',
        announcements: [],
        latitude: null,
        longitude: null,
      }),
    );

    expect(screen.getByRole('link', { name: '지도에서 보기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /내비게이션 앱으로 길찾기/ })).not.toBeInTheDocument();
  });

  it('clicking the navigation button reveals kakao/naver/tmap deep links with correctly formatted hrefs', () => {
    render(
      createElement(TournamentVenuePrepSection, {
        venue: '잠실종합운동장',
        announcements: [],
        latitude: 37.5,
        longitude: 127.07,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /내비게이션 앱으로 길찾기/ }));

    expect(screen.getByRole('menuitem', { name: '카카오맵' })).toHaveAttribute('href', 'kakaomap://route?ep=37.5,127.07&by=CAR');
    expect(screen.getByRole('menuitem', { name: '네이버지도' })).toHaveAttribute(
      'href',
      `nmap://route/car?dlat=37.5&dlng=127.07&dname=${encodeURIComponent('잠실종합운동장')}&appname=${encodeURIComponent('teameet.kr')}`,
    );
    expect(screen.getByRole('menuitem', { name: '티맵' })).toHaveAttribute(
      'href',
      `tmap://route?goalx=127.07&goaly=37.5&goalname=${encodeURIComponent('잠실종합운동장')}`,
    );
    // 웹/설치 폴백 링크도 함께 노출된다("웹으로 보기" x2 카카오+네이버, "설치하기" x1 티맵).
    expect(screen.getAllByRole('link', { name: '웹으로 보기' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: '설치하기' })).toBeInTheDocument();
  });
});

const NO_FIXTURES: V1TournamentFixture[] = [];

describe('TournamentPostEventHubSection — completed action list vs default hub (regression guard)', () => {
  it('renders the 3-row completed action list with correct hrefs for a completed tournament', () => {
    render(
      createElement(TournamentPostEventHubSection, {
        tournamentId: 'tour-42',
        status: 'completed',
        fixtures: NO_FIXTURES,
        hasAnnouncements: false,
        sponsorCount: 0,
        announcements: [],
      }),
    );

    expect(screen.getByRole('link', { name: /최종 결과·시상/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/results',
    );
    expect(screen.getByRole('link', { name: /대진표·조별 순위/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/bracket',
    );
    expect(screen.getByRole('link', { name: /후기·매너 평가/ })).toHaveAttribute('href', '/my/reviews');
    expect(screen.getByText('대회 후 더보기')).toBeInTheDocument();
  });

  it('renders nothing for draft/open/closed tournaments — too early for any "대회 후" content', () => {
    for (const status of ['draft', 'open', 'closed'] as const) {
      const { container, unmount } = render(
        createElement(TournamentPostEventHubSection, {
          tournamentId: 'tour-42',
          status,
          fixtures: NO_FIXTURES,
          hasAnnouncements: false,
          sponsorCount: 0,
          announcements: [],
        }),
      );

      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('renders nothing for an in_progress tournament with no completed fixtures/announcements/sponsors — nothing real to show yet', () => {
    const { container } = render(
      createElement(TournamentPostEventHubSection, {
        tournamentId: 'tour-42',
        status: 'in_progress',
        fixtures: NO_FIXTURES,
        hasAnnouncements: false,
        sponsorCount: 0,
        announcements: [],
      }),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders only the genuinely available rows (not "준비 중" placeholders) for an in_progress tournament with a completed fixture', () => {
    const fixtures: V1TournamentFixture[] = [
      {
        id: 'f1',
        groupId: null,
        round: '조별 1라운드',
        status: 'completed',
        homeRegistrationId: 'r1',
        awayRegistrationId: 'r2',
        homeTeamName: '팀A',
        awayTeamName: '팀B',
        result: { homeScore: 2, awayScore: 1, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
      } as V1TournamentFixture,
    ];

    render(
      createElement(TournamentPostEventHubSection, {
        tournamentId: 'tour-42',
        status: 'in_progress',
        fixtures,
        hasAnnouncements: false,
        sponsorCount: 0,
        announcements: [],
      }),
    );

    expect(screen.getByText('대회 현황')).toBeInTheDocument();
    // 결과·순위, 리뷰 등 "available" 상태 카드만 뜨고, "하이라이트 영상" 같은 upcoming
    // placeholder는 나오지 않는다.
    expect(screen.queryByText('하이라이트 영상')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /리뷰·매너 기록/ })).toHaveAttribute('href', '/my/reviews');
  });
});
