import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getTournamentPostEventCards } from './tournament-venue-retention-model';
import {
  TournamentFixtureReviewEntrySection,
  TournamentPostEventHubSection,
  TournamentVenuePrepSection,
} from './tournament-venue-retention-sections';
import type { V1PlaceView, V1ReviewListItem, V1TournamentFixture } from '@/types/api';

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/t1',
  useSearchParams: () => new URLSearchParams('from=%2Fhome'),
}));

// PlaceCard 의 지도 미리보기가 JS 키를 이 훅으로 받는다 — 키 없음 상태를 고정해 지도 SDK 를 건드리지 않는다.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

const pickedPlace: V1PlaceView = {
  name: '잠실종합운동장',
  address: '서울 송파구 올림픽로 25',
  latitude: 37.5,
  longitude: 127.07,
  provider: 'kakao',
  providerPlaceId: 'kakao-1',
};
const nameOnlyPlace: V1PlaceView = {
  name: '데일리그라운드 청라국제도시점',
  address: null,
  latitude: null,
  longitude: null,
  provider: null,
  providerPlaceId: null,
};

describe('TournamentVenuePrepSection — 현장 안내', () => {
  it('좌표가 있는 장소는 이름·주소와 카카오맵 길찾기 링크(좌표 포함)를 PlaceCard 로 보여 준다', () => {
    render(createElement(TournamentVenuePrepSection, { place: pickedPlace, announcements: [] }));

    expect(screen.getAllByText('잠실종합운동장')).toHaveLength(1);
    expect(screen.getByText('서울 송파구 올림픽로 25')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '카카오맵으로 길찾기' })).toHaveAttribute(
      'href',
      `https://map.kakao.com/link/to/${encodeURIComponent('잠실종합운동장')},37.5,127.07`,
    );
  });

  it('좌표가 없는 옛 대회도 이름 검색 링크로 폴백하고 길찾기 문구는 없다', () => {
    render(createElement(TournamentVenuePrepSection, { place: nameOnlyPlace, announcements: [] }));

    expect(screen.getByRole('link', { name: '카카오맵에서 이름 검색' })).toHaveAttribute(
      'href',
      `https://map.kakao.com/?q=${encodeURIComponent('데일리그라운드 청라국제도시점')}`,
    );
    expect(screen.queryByRole('link', { name: /길찾기/ })).not.toBeInTheDocument();
  });

  it('주차 안내는 장소 카드 아래 행으로 보이고 비우면 사라진다', () => {
    const { unmount } = render(
      createElement(TournamentVenuePrepSection, {
        place: nameOnlyPlace,
        parkingInfo: '건물 지하 주차장 2시간 무료\n만차 시 인근 공영주차장을 이용해 주세요.',
        announcements: [],
      }),
    );
    expect(screen.getByText(/건물 지하 주차장 2시간 무료/)).toBeInTheDocument();
    unmount();

    render(createElement(TournamentVenuePrepSection, { place: nameOnlyPlace, parkingInfo: null, announcements: [] }));
    expect(screen.queryByText('주차')).not.toBeInTheDocument();
  });

  it('운영진 장소 공지는 장소 카드를 가리지 않고 공지 보기 링크로 덧붙는다', () => {
    render(
      createElement(TournamentVenuePrepSection, {
        place: pickedPlace,
        announcements: [{ id: 'ann-venue', title: '주차·입장·경기 준비 안내', category: 'venue' }],
      }),
    );

    expect(screen.getByText('잠실종합운동장')).toBeInTheDocument();
    expect(screen.getByText('주차·입장·경기 준비 안내')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '공지 보기' })).toHaveAttribute('href', '#announcement-ann-venue');
  });

  it('장소가 없는 극히 드문 경우에는 공지 확인 폴백만 보이고 지도 링크는 없다', () => {
    const { unmount } = render(createElement(TournamentVenuePrepSection, { place: null, announcements: [] }));
    expect(screen.getByText('운영진 공지 확인')).toBeInTheDocument();
    expect(screen.getByText('공지 대기')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /카카오맵/ })).not.toBeInTheDocument();
    unmount();

    render(
      createElement(TournamentVenuePrepSection, {
        place: null,
        announcements: [{ id: 'ann-venue', title: '주차 안내', category: 'venue' }],
      }),
    );
    expect(screen.getByText('확인 가능')).toBeInTheDocument();
  });
});

const NO_FIXTURES: V1TournamentFixture[] = [];

// 시상·후기 행은 ?from= 을 싣는다 — 도착 경로만 비교하고 from 은 아래 전용 테스트가 본다.
const hrefPath = (el: HTMLElement) => (el.getAttribute('href') ?? '').split('?')[0];

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
    expect(hrefPath(screen.getByRole('link', { name: /최종 결과·시상/ }))).toBe('/tournaments/tour-42/awards');
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
    expect(hrefPath(screen.getByRole('link', { name: /대회 후기/ }))).toBe('/tournaments/tour-42/reviews');
    expect(screen.getByText('대회 후 더보기')).toBeInTheDocument();
  });

  it('시상·후기 행은 지금 개요 주소를 출처(from)로 싣는다 — 상단 뒤로가기가 개요로 돌아오게', () => {
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
    for (const [name, path] of [
      [/최종 결과·시상/, '/tournaments/tour-42/awards'],
      [/대회 후기/, '/tournaments/tour-42/reviews'],
    ] as const) {
      const url = new URL(screen.getByRole('link', { name }).getAttribute('href') as string, 'https://x.test');
      expect(url.pathname).toBe(path);
      expect(url.searchParams.get('from')).toBe('/tournaments/t1?from=%2Fhome');
    }
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
    groupId: 'group-a',
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
        groups: [{ id: 'group-a', name: 'A조' }],
        state: { status: 'ready', items: [reviewItem()] },
      }),
    );

    expect(screen.getByText('리뷰할 수 있는 경기')).toBeInTheDocument();
    // W9-V2 — 대회 화면 전체가 같은 경기 이름("A조 · 조별 1라운드")을 쓴다.
    expect(screen.getByText('A조 · 조별 1라운드')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /팀A 대 팀B/ })).toHaveAttribute(
      'href',
      `/my/reviews/tournament_fixture/fixture-9?from=${encodeURIComponent('/tournaments/t1?from=%2Fhome')}`,
    );
    expect(screen.getByText('남은 리뷰 5개')).toBeInTheDocument();
  });

  it('남길 리뷰가 없으면 섹션째 렌더하지 않는다 (빈 껍데기로 자리 차지하지 않음)', () => {
    const { container } = render(
      createElement(TournamentFixtureReviewEntrySection, {
        fixtures: [COMPLETED_FIXTURE],
        groups: [],
        state: { status: 'ready', items: [reviewItem({ remainingCount: 0, state: 'done' })] },
      }),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('비로그인 방문자에게는 아무것도 보여주지 않는다', () => {
    const { container } = render(
      createElement(TournamentFixtureReviewEntrySection, {
        fixtures: [COMPLETED_FIXTURE],
        groups: [],
        state: { status: 'guest', items: [] },
      }),
    );

    expect(container).toBeEmptyDOMElement();
  });
});
