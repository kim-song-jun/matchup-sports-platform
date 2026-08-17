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
    // 후기 행은 대회 컨텍스트를 유지해야 한다 — 예전엔 '/my/reviews'로 보내 "어느 대회의
    // 후기를 쓰려던 건지"가 사라졌고, 사용자가 목록에서 대회를 다시 찾아야 했다.
    expect(screen.getByRole('link', { name: /대회 후기/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/awards',
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

  it('renders direct review entries only for completed fixtures with results while the tournament is in progress', () => {
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
      {
        id: 'f-completed-without-result',
        round: '조별 2라운드',
        status: 'completed',
        homeTeamName: '팀C',
        awayTeamName: '팀D',
        result: null,
      } as V1TournamentFixture,
      {
        id: 'f-penalty',
        round: '결승',
        status: 'completed',
        homeTeamName: null,
        awayTeamName: 'TBD',
        result: { homeScore: 1, awayScore: 1, hasPenalty: true, homePenaltyScore: 5, awayPenaltyScore: 4 },
      } as V1TournamentFixture,
      {
        id: 'f-scheduled',
        round: '조별 3라운드',
        status: 'scheduled',
        homeTeamName: '팀E',
        awayTeamName: '팀F',
        result: { homeScore: 0, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
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
        fixtureReviewState: {
          status: 'ready',
          items: [
            {
              sourceType: 'tournament_fixture',
              sourceId: 'f1',
              title: 'TeamMeet Cup · 조별 1라운드',
              completedAt: '2026-08-14T00:00:00.000Z',
              targetType: 'team',
              targetCount: 3,
              reviewedCount: 1,
              remainingCount: 2,
              state: 'ready',
            },
            {
              sourceType: 'tournament_fixture',
              sourceId: 'f-penalty',
              title: 'TeamMeet Cup · 결승',
              completedAt: '2026-08-14T01:00:00.000Z',
              targetType: 'user',
              targetCount: 1,
              reviewedCount: 0,
              remainingCount: 1,
              state: 'ready',
            },
          ],
        },
      }),
    );

    expect(screen.getByText('대회 현황')).toBeInTheDocument();
    // 결과·순위처럼 실제로 열린 행만 유지하고, generic 리뷰함 링크와 준비 중 placeholder는 제거한다.
    expect(screen.queryByText('하이라이트 영상')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /리뷰·매너 기록/ })).not.toBeInTheDocument();

    expect(screen.getByText('리뷰할 수 있는 경기')).toBeInTheDocument();
    expect(screen.getByText('경기 결과와 내 역할을 확인해 아직 남길 수 있는 리뷰만 보여드려요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀A 대 팀B 경기 남은 리뷰 2개 작성' })).toHaveAttribute(
      'href',
      '/my/reviews/tournament_fixture/f1',
    );
    expect(screen.getByText('남은 리뷰 2개')).toBeInTheDocument();
    expect(screen.getByText('2 : 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '비공개 대 미정 경기 남은 리뷰 1개 작성' })).toBeInTheDocument();
    expect(screen.getByText('PK 5 : 4')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /팀C 대 팀D/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /팀E 대 팀F/ })).not.toBeInTheDocument();
  });

  // 후기는 대회가 끝난 뒤에 쓴다. 예전에는 status가 completed로 넘어가는 순간 이 섹션이
  // 통째로 사라져(완료 액션 리스트로 early-return) 정작 쓸 시점에 들어갈 길이 없었다.
  it('대회가 종료된 뒤에도 "리뷰할 수 있는 경기" 진입점이 남는다', () => {
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

    render(
      createElement(TournamentPostEventHubSection, {
        tournamentId: 'tour-42',
        status: 'completed',
        fixtures,
        hasAnnouncements: false,
        sponsorCount: 0,
        announcements: [],
        fixtureReviewState: {
          status: 'ready',
          items: [
            {
              sourceType: 'tournament_fixture',
              sourceId: 'f1',
              title: 'TeamMeet Cup · 조별 1라운드',
              completedAt: '2026-08-14T00:00:00.000Z',
              targetType: 'team',
              targetCount: 3,
              reviewedCount: 1,
              remainingCount: 2,
              state: 'ready',
            },
          ],
        },
      }),
    );

    expect(screen.getByText('리뷰할 수 있는 경기')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀A 대 팀B 경기 남은 리뷰 2개 작성' })).toHaveAttribute(
      'href',
      '/my/reviews/tournament_fixture/f1',
    );
    // 완료 액션 리스트는 그대로 함께 남는다(대체가 아니라 추가).
    expect(screen.getByText('대회 후 더보기')).toBeInTheDocument();
  });
});
