import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePageView } from './home-page';
import type { HomeMatchCard, HomeViewModel } from './home.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1AllTournaments: () => ({ data: [], isPending: false, isError: false, isLoading: false, refetch: vi.fn() }),
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
    recordConsentNudge: { pendingCount: 2, saving: false, onGrant: vi.fn(), onDismiss: vi.fn() },
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

  it('regression: does not omit from= when navigating away from home', () => {
    render(<HomePageView model={buildModel()} />);
    const link = screen.getByRole('link', { name: /매치 featured-1/ });
    expect(link.getAttribute('href')).not.toBe('/matches/featured-1');
  });
});
