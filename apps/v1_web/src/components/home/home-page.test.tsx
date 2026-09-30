import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePageView } from './home-page';
import type { V1TournamentListItem } from '@/types/api';
import type { HomeMatchCard, HomeViewModel } from './home.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const useV1AllTournamentsMock = vi.hoisted(() =>
  vi.fn(() => ({ data: [] as V1TournamentListItem[], isPending: false, isError: false, isLoading: false, refetch: vi.fn() })),
);

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1AllTournaments: useV1AllTournamentsMock,
    useV1LeagueMatches: () => ({
      data: {
        items: [
          {
            leagueId: 'league-1',
            title: '테스트 리그',
            state: 'active',
            startsOn: '2026-09-01',
            endsOn: '2026-11-01',
            sport: { sportId: 's1', code: 'futsal', name: '풋살' },
            region: { regionId: 'r1', name: '서울' },
            seriesId: null,
            tier: null,
            tierLabel: null,
            seasonNo: null,
            seriesTitle: null,
            teamCount: 2,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useV1LineupTodos: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  };
});

function matchCard(id: string): HomeMatchCard {
  return {
    id,
    sport: 'futsal',
    sportLabel: '풋살',
    title: `매치 ${id}`,
    venue: '서울 풋살장',
    date: '9/24',
    time: '19:00',
    currentParticipants: 6,
    maxParticipants: 10,
    actionLabel: '신청하기',
    imageUrl: null,
  };
}

function buildModel(overrides: Partial<HomeViewModel> = {}): HomeViewModel {
  return {
    viewerName: '테스터',
    signedOut: false,
    network: false,
    hasNewNotification: false,
    chatUnreadCount: 0,
    chatHref: '/chat',
    chatStatus: 'ready',
    chatRooms: [],
    stats: {
      monthlyActivity: 3,
      monthlyActivitySub: '3경기',
      mannerScore: '90',
      mannerScoreSub: '상위 10%',
      joined: 3,
      trustState: 'ok',
      pending: '',
    },
    featuredMatch: matchCard('featured-1'),
    recommendedMatches: [matchCard('rec-1')],
    quickActions: [],
    weather: { city: '서울', temp: 20, cond: '맑음', wind: 2 },
    popup: null,
    notices: [],
    bannerDecision: { showPhoneVerify: false, nudge: 'recordConsent', deferred: [] },
    recordConsentNudge: { pendingCount: 2, mentionsRanking: false, saving: false, onGrant: vi.fn(), onDismiss: vi.fn() },
    ...overrides,
  };
}

describe('HomePageView back-navigation from=/home', () => {
  it('carries from=/home on the featured match card link', () => {
    render(<HomePageView model={buildModel()} />);
    const link = screen.getByRole('link', { name: /매치 featured-1/ });
    expect(link).toHaveAttribute('href', '/matches/featured-1?from=%2Fhome');
  });

  it('carries from=/home on the recommended match rail link', () => {
    render(<HomePageView model={buildModel()} />);
    const link = screen.getByRole('link', { name: /매치 rec-1/ });
    expect(link).toHaveAttribute('href', '/matches/rec-1?from=%2Fhome');
  });

  it('carries from=/home on the sidebar league card link', () => {
    render(<HomePageView model={buildModel()} />);
    const link = screen.getByRole('link', { name: /정규 리그 상세 보기 — 테스트 리그/ });
    expect(link).toHaveAttribute('href', '/league-matches/league-1?from=%2Fhome');
  });

  it('carries from=/home on the record-consent nudge "어떤 기록인지 보기" link', () => {
    render(<HomePageView model={buildModel()} />);
    const link = screen.getByRole('link', { name: '어떤 기록인지 보기' });
    expect(link).toHaveAttribute('href', '/my/settings/record-consent?from=%2Fhome');
  });

  it('shows the latest pending record in the record-consent nudge, and only promises what the user will actually get', () => {
    const latestRecord = {
      caption: '9/30 (수) · 마포 주말 리그',
      result: 'WON' as const,
      matchup: '마포 FC vs 합정 유나이티드',
      stats: '내 기록 · 1골 · 1도움',
    };
    const nudge = { pendingCount: 2, saving: false, onGrant: vi.fn(), onDismiss: vi.fn() };
    const { rerender } = render(
      <HomePageView model={buildModel({ recordConsentNudge: { ...nudge, latestRecord, mentionsRanking: true } })} />,
    );

    expect(screen.getByText('2경기가 공개를 기다려요')).toBeInTheDocument();
    expect(screen.getByText('9/30 (수) · 마포 주말 리그')).toBeInTheDocument();
    expect(screen.getByText('승')).toBeInTheDocument();
    expect(screen.getByText('마포 FC vs 합정 유나이티드')).toBeInTheDocument();
    expect(screen.getByText('내 기록 · 1골 · 1도움')).toBeInTheDocument();
    expect(screen.getByText('공개하면 프로필과 득점·도움 순위에 내 이름이 나와요.')).toBeInTheDocument();

    // 순위에 오르지 않는 사람에게는 순위를 약속하지 않고, 기록 조회가 실패해도 배너는 한 줄 없이 뜬다.
    rerender(<HomePageView model={buildModel({ recordConsentNudge: { ...nudge, mentionsRanking: false } })} />);
    expect(screen.getByText('공개하면 프로필에 내 기록이 나와요.')).toBeInTheDocument();
    expect(screen.queryByText(/득점·도움 순위/)).not.toBeInTheDocument();
    expect(screen.queryByText('내 기록 · 1골 · 1도움')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공개하기' })).toBeInTheDocument();
  });

  it('regression: does not omit from= when navigating away from home', () => {
    render(<HomePageView model={buildModel()} />);
    const link = screen.getByRole('link', { name: /매치 featured-1/ });
    expect(link.getAttribute('href')).not.toBe('/matches/featured-1');
  });

  it('carries from=/home on the sidebar tournament widget link', () => {
    useV1AllTournamentsMock.mockReturnValueOnce({
      data: [
        {
          id: 'tour-1',
          title: '테스트 대회',
          scheduledAt: null,
          scheduledEndAt: null,
          sport: { code: 'futsal', name: '풋살' },
          confirmedCount: 4,
          teamCount: 8,
        } as V1TournamentListItem,
      ],
      isPending: false,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<HomePageView model={buildModel()} />);

    const link = screen.getByRole('link', { name: /테스트 대회/ });
    expect(link).toHaveAttribute('href', '/tournaments/tour-1?from=%2Fhome');
  });
});
