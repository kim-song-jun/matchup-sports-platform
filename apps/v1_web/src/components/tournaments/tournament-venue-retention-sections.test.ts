import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getTournamentPostEventCards, getVenueNavigationLinks } from './tournament-venue-retention-model';
import {
  TournamentFixtureReviewEntrySection,
  TournamentPostEventHubSection,
  TournamentVenuePrepSection,
} from './tournament-venue-retention-sections';
import type { V1ReviewListItem, V1TournamentFixture } from '@/types/api';

// TournamentVenueMap fetches the Kakao Maps JS key via this hook — 이 스위트에서는
// "키가 없다"는 (그래서 지도 임베드가 스킵되는) 상태를 고정해 규약대로 검증한다.
// 키가 있는 경로(실제 지도 렌더)는 tournament-venue-map.test.tsx에서 별도로 검증.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

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

  it('renders the tournament-managed parking info below the venue and hides it when cleared', () => {
    const { unmount } = render(
      createElement(TournamentVenuePrepSection, {
        venue: '데일리그라운드 청라국제도시점',
        parkingInfo: '건물 지하 주차장 2시간 무료\n만차 시 인근 공영주차장을 이용해 주세요.',
        announcements: [],
      }),
    );

    expect(screen.getByText(/건물 지하 주차장 2시간 무료/)).toBeInTheDocument();
    unmount();

    render(
      createElement(TournamentVenuePrepSection, {
        venue: '데일리그라운드 청라국제도시점',
        parkingInfo: null,
        announcements: [],
      }),
    );

    expect(screen.queryByText('주차와 입장 동선은 지도에서 확인해요.')).not.toBeInTheDocument();
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

  it('shows no "확인 가능" status badge on the venue row — the venue name + map link are already unconditionally visible, so the badge added no information (user feedback fix)', () => {
    render(
      createElement(TournamentVenuePrepSection, {
        venue: '데일리그라운드 청라국제도시점',
        announcements: [],
      }),
    );

    expect(screen.getByText('데일리그라운드 청라국제도시점')).toBeInTheDocument();
    expect(screen.queryByText('확인 가능')).not.toBeInTheDocument();
  });

  it('keeps the status badge for the rare no-venue fallback row, where the badge label genuinely varies with notice presence (out of this fix\'s scope)', () => {
    const { unmount } = render(
      createElement(TournamentVenuePrepSection, { venue: null, announcements: [] }),
    );
    expect(screen.getByText('공지 대기')).toBeInTheDocument();
    unmount();

    render(
      createElement(TournamentVenuePrepSection, {
        venue: null,
        announcements: [{ id: 'ann-venue', title: '주차 안내', category: 'venue' }],
      }),
    );
    expect(screen.getByText('확인 가능')).toBeInTheDocument();
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

    const navigationMenu = screen.getByRole('menu');
    expect(navigationMenu).toHaveStyle({
      bottom: 'calc(100% + 8px)',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
    });
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

    // 행마다 라벨이 약속하는 화면으로 가야 한다 — 한때 "최종 결과·시상"이 경기별 결과
    // 목록(/results)으로, "대회 후기"가 시상 화면(/awards)으로 가서 두 행이 서로의
    // 화면을 가리키고 있었다(오너 지적: "이건 대회 후기를 보러가는거고").
    expect(screen.getByRole('link', { name: /최종 결과·시상/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/awards',
    );
    expect(screen.getByRole('link', { name: /대진표·조별 순위/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/bracket',
    );
    expect(screen.getByRole('link', { name: /경기별 결과·기록/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/results',
    );
    // 후기 행은 대회 컨텍스트를 유지해야 한다 — 예전엔 '/my/reviews'로 보내 "어느 대회의
    // 후기를 쓰려던 건지"가 사라졌고, 사용자가 목록에서 대회를 다시 찾아야 했다.
    expect(screen.getByRole('link', { name: /대회 후기/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/reviews',
    );
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

  // 경기별 후기 진입은 후기 화면(/tournaments/:id/reviews)으로 옮겼다 — 대회 상세에
  // 후기 입구가 둘("대회 후기" 행 + "리뷰할 수 있는 경기" 섹션)이라 어디로 가야 하는지
  // 헷갈렸다. 한때 시상 화면(/awards)에 뒀는데, 그러면 후기를 쓰러 온 사람이 "최종
  // 결과·시상"을 눌러야 해서 라벨과 내용이 다시 어긋났다. 여기서는 대회 상세가 더 이상
  // 그 섹션을 렌더하지 않는다는 것만 고정한다.
  it('대회 상세는 경기별 후기 섹션을 더 이상 렌더하지 않는다 (후기 화면으로 이동)', () => {
    const fixtures = [
      {
        id: 'f1',
        round: '조별 1라운드',
        status: 'completed',
        homeTeamName: '팀A',
        awayTeamName: '팀B',
        result: { homeScore: 2, awayScore: 1, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
      } as V1TournamentFixture,
    ];

    for (const status of ['in_progress', 'completed'] as const) {
      const { unmount } = render(
        createElement(TournamentPostEventHubSection, {
          tournamentId: 'tour-42',
          status,
          fixtures,
          hasAnnouncements: false,
          sponsorCount: 0,
          announcements: [],
        }),
      );
      expect(screen.queryByText('리뷰할 수 있는 경기')).not.toBeInTheDocument();
      unmount();
    }
  });

});

/**
 * 이 섹션은 대회 상세 → 시상 화면(`/awards`) → 후기 화면(`/tournaments/:id/reviews`)으로
 * 두 번 옮겨졌는데 그동안 자기 렌더 계약을 고정한 테스트가 없었다. 다음에 또 옮기더라도
 * "어떤 경기가, 몇 개 남았고, 어디로 가는지"는 그대로여야 한다.
 */
describe('TournamentFixtureReviewEntrySection', () => {
  const COMPLETED_FIXTURE = {
    id: 'fixture-9',
    round: '조별 1라운드',
    status: 'completed',
    homeTeamName: '팀A',
    awayTeamName: '팀B',
    result: { homeScore: 2, awayScore: 1, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
  } as V1TournamentFixture;

  function reviewItem(overrides: Partial<V1ReviewListItem> = {}): V1ReviewListItem {
    return {
      sourceType: 'tournament_fixture',
      sourceId: 'fixture-9',
      title: '조별 1라운드',
      completedAt: null,
      targetType: 'team',
      targetCount: 5,
      reviewedCount: 0,
      remainingCount: 5,
      state: 'ready',
      ...overrides,
    };
  }

  it('남은 리뷰가 있는 완료 경기를 그 경기의 후기 작성 화면으로 이어준다', () => {
    render(
      createElement(TournamentFixtureReviewEntrySection, {
        fixtures: [COMPLETED_FIXTURE],
        state: { status: 'ready', items: [reviewItem()] },
      }),
    );

    expect(screen.getByText('리뷰할 수 있는 경기')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /팀A 대 팀B/ })).toHaveAttribute(
      'href',
      '/my/reviews/tournament_fixture/fixture-9',
    );
    expect(screen.getByText('남은 리뷰 5개')).toBeInTheDocument();
  });

  it('남길 리뷰가 없으면 섹션째 렌더하지 않는다 (빈 껍데기로 자리 차지하지 않음)', () => {
    const { container } = render(
      createElement(TournamentFixtureReviewEntrySection, {
        fixtures: [COMPLETED_FIXTURE],
        state: { status: 'ready', items: [reviewItem({ remainingCount: 0, state: 'done' })] },
      }),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('비로그인 방문자에게는 아무것도 보여주지 않는다', () => {
    const { container } = render(
      createElement(TournamentFixtureReviewEntrySection, {
        fixtures: [COMPLETED_FIXTURE],
        state: { status: 'guest', items: [] },
      }),
    );

    expect(container).toBeEmptyDOMElement();
  });
});
