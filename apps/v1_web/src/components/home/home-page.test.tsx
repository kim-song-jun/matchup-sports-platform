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

describe('HomePageView — 맨 위 "다음 경기" 자리 (Task 180 G7)', () => {
  const nextGame = {
    gameId: 'game-1',
    teamMatchId: 'tm-1',
    competitionKind: 'LEAGUE' as const,
    competitionId: 'league-1',
    title: '마포 주말 리그 1주차',
    opponentName: '합정 유나이티드',
    scheduledAt: '2099-01-01T10:00:00.000Z',
    placeName: null,
    teamId: 'team-a',
    teamName: '마포 FC',
    viewerCanManage: false,
    viewerParticipating: true,
    participantCount: 10,
  };

  const noRequests = { pendingInvitations: null, pendingJoinRequests: null };

  it('다음 경기가 있으면 그 카드를 그리고 빈 상태는 없다', () => {
    render(<HomePageView model={buildModel({ teamActivity: { hasTeam: true, nextGame, ...noRequests } })} />);
    expect(screen.getByRole('heading', { name: 'vs 합정 유나이티드' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '먼저 해 볼 일' })).not.toBeInTheDocument();
  });

  it('팀이 없는 새 가입자에게는 같은 자리가 "먼저 해 볼 일" — 팀 만들기·팀 찾기·매치 둘러보기', () => {
    render(<HomePageView model={buildModel({ teamActivity: { hasTeam: false, nextGame: null, ...noRequests } })} />);
    const starter = screen.getByRole('region', { name: '먼저 해 볼 일' });
    expect(starter).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀 만들기' })).toHaveAttribute('href', '/teams/new');
    expect(screen.getByRole('link', { name: '팀 찾기' })).toHaveAttribute('href', '/teams');
    expect(screen.getByRole('link', { name: '매치 둘러보기' })).toHaveAttribute('href', '/matches');
  });

  it('팀은 있고 잡힌 경기가 없으면 아무것도 그리지 않는다(빈 상태는 새 가입자 전용)', () => {
    render(<HomePageView model={buildModel({ teamActivity: { hasTeam: true, nextGame: null, ...noRequests } })} />);
    expect(screen.queryByRole('region', { name: '먼저 해 볼 일' })).not.toBeInTheDocument();
    expect(screen.queryByText('다음 경기')).not.toBeInTheDocument();
  });

  it('서버가 팀 정보를 계산하지 못했거나(null) 로그아웃 상태면 "팀 없음"으로 읽지 않는다', () => {
    const { rerender } = render(<HomePageView model={buildModel({ teamActivity: null })} />);
    expect(screen.queryByRole('region', { name: '먼저 해 볼 일' })).not.toBeInTheDocument();

    rerender(<HomePageView model={buildModel({ signedOut: true, teamActivity: { hasTeam: false, nextGame: null, ...noRequests } })} />);
    expect(screen.queryByRole('region', { name: '먼저 해 볼 일' })).not.toBeInTheDocument();
  });
});

describe('HomePageView — 팀 초대·가입 신청 유도 배너 (Task 180 G7)', () => {
  const teamActivity = {
    hasTeam: true,
    nextGame: null,
    pendingInvitations: { count: 2, latestTeamName: '한강 FC' },
    pendingJoinRequests: { count: 4, teamId: 'team-m2', teamName: '망원 FS', otherTeamCount: 1 },
  };

  it('선택된 유도 배너가 팀 초대면 초대함으로, 가입 신청이면 그 팀의 멤버 관리로 보낸다', () => {
    const { rerender } = render(
      <HomePageView model={buildModel({ teamActivity, bannerDecision: { showPhoneVerify: false, nudge: 'teamInvitation', deferred: [] } })} />,
    );
    expect(screen.getByText('팀 초대 2건이 와 있어요')).toBeInTheDocument();
    expect(screen.getByText('한강 FC 외 1팀에서 초대했어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀 초대 2건이 와 있어요 — 확인하기' })).toHaveAttribute('href', '/my/invitations?from=%2Fhome');

    rerender(
      <HomePageView model={buildModel({ teamActivity, bannerDecision: { showPhoneVerify: false, nudge: 'joinRequests', deferred: [] } })} />,
    );
    expect(screen.getByText('망원 FS 외 1팀 · 응답을 기다려요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '가입 신청 4건이 기다려요 — 확인하기' })).toHaveAttribute(
      'href',
      '/teams/team-m2/members?from=%2Fhome',
    );
    expect(screen.queryByText('팀 초대 2건이 와 있어요')).not.toBeInTheDocument();
  });

  it('팀이 없는데 초대가 와 있으면 초대 배너가 "먼저 해 볼 일"보다 위다 (W3-V7)', () => {
    render(
      <HomePageView
        model={buildModel({
          teamActivity: { ...teamActivity, hasTeam: false, pendingJoinRequests: null },
          bannerDecision: { showPhoneVerify: false, nudge: 'teamInvitation', deferred: [] },
        })}
      />,
    );
    const invitation = screen.getByRole('link', { name: '팀 초대 2건이 와 있어요 — 확인하기' });
    const starter = screen.getByRole('region', { name: '먼저 해 볼 일' });
    expect(invitation.compareDocumentPosition(starter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('팀이 있으면 다음 경기 카드가 초대 배너보다 위 그대로다 (대조군)', () => {
    const nextGame = {
      gameId: 'g-1', teamMatchId: 'tm-1', competitionKind: 'FRIENDLY' as const, competitionId: null,
      title: '토요일 친선', opponentName: '합정 유나이티드', scheduledAt: '2026-10-03T10:00:00.000Z',
      placeName: null, teamId: 't-1', teamName: '성수 FC', viewerCanManage: false,
      viewerParticipating: true, participantCount: null,
    };
    render(
      <HomePageView
        model={buildModel({
          teamActivity: { ...teamActivity, nextGame },
          bannerDecision: { showPhoneVerify: false, nudge: 'teamInvitation', deferred: [] },
        })}
      />,
    );
    const nextGameHeading = screen.getByRole('heading', { name: 'vs 합정 유나이티드' });
    const invitation = screen.getByRole('link', { name: '팀 초대 2건이 와 있어요 — 확인하기' });
    expect(nextGameHeading.compareDocumentPosition(invitation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: '먼저 해 볼 일' })).not.toBeInTheDocument();
  });

  it('초대·신청이 있어도 이번 방문에 선택된 배너가 다른 것이면 그리지 않는다(상한 1)', () => {
    render(<HomePageView model={buildModel({ teamActivity })} />);
    // buildModel 의 기본 선택은 공개 동의 배너다.
    expect(screen.getByText('2경기가 공개를 기다려요')).toBeInTheDocument();
    expect(screen.queryByText(/팀 초대 \d+건/)).not.toBeInTheDocument();
    expect(screen.queryByText(/가입 신청 \d+건/)).not.toBeInTheDocument();
  });
});
