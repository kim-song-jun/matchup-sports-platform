/**
 * 웨이브 5(2026-09-04): 대회 캠페인의 목업 사진 폴백 제거, 손수 만든 빈/에러 상태의
 * EmptyState/ErrorState 전환, 로스터 primary CTA 상한(화면당 1개), /tournaments
 * 데스크톱 헤드 + 중복 h1 제거를 못박는다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/hooks/use-v1-api';
import { queryImageBySrc, resolveNextImageSrc } from '@/test/next-image';
import { resolveRouteChrome } from '@/lib/route-chrome';
import { TournamentCampaignMedia } from './tournament-campaign-media';
import { renderBracketStandingsTab } from '@/app/tournaments/[id]/bracket/bracket-test-utils';
import { TournamentReviewsPageClient } from '@/app/tournaments/[id]/reviews/reviews-page-client';
import { TournamentRosterPageClient } from '@/app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client';
import type { V1TournamentDetail } from '@/types/api';

vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makeTournament(
  overrides: Partial<V1TournamentDetail> & Pick<V1TournamentDetail, 'id' | 'status' | 'format'>,
): V1TournamentDetail {
  return {
    kind: 'regular_tournament',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: null,
    bracketPublishScheduledAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 5,
    maxPlayers: 10,
    genderCategory: null,
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    campaignSlug: null,
    rulesText: null,
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    refundPolicyText: null,
    confirmedCount: 0,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    leagueFixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    reviewsTotalCount: 0,
    awards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('대회 캠페인 미디어 — 목업 사진 폴백 금지', () => {
  it('사진이 없으면 종목 그래픽 폴백을 그리고 /mock/generated 사진을 쓰지 않는다', () => {
    const { container } = render(
      <TournamentCampaignMedia src={null} sportCode="futsal" alt="테스트 대회" className="x" />,
    );
    container.querySelectorAll('img').forEach((img) => {
      expect(resolveNextImageSrc(img)).not.toMatch(/^\/mock\/generated\//);
    });
    // getSportAccent('futsal').label === '풋살' → sportIllustration('풋살') === 'sport-futsal'
    expect(queryImageBySrc(container, '/illustrations/sport-futsal-640.webp')).not.toBeNull();
  });

  it('사진 로드가 실패해도 목업 사진으로 바꿔치기하지 않고 종목 그래픽으로 대체한다', () => {
    const { container } = render(
      <TournamentCampaignMedia src="https://images.example.com/broken.webp" sportCode="basketball" alt="깨진 사진" />,
    );
    const hero = screen.getByRole('img', { name: '깨진 사진' });

    fireEvent.error(hero);

    expect(screen.queryByRole('img', { name: '깨진 사진' })).not.toBeInTheDocument();
    container.querySelectorAll('img').forEach((img) => {
      expect(resolveNextImageSrc(img)).not.toMatch(/^\/mock\/generated\//);
    });
    // getSportAccent('basketball').label === '농구' → sportIllustration('농구') 는 운영 4종목이
    // 아니므로 공용 그래픽(landing-hero)으로 떨어진다.
    expect(queryImageBySrc(container, '/illustrations/landing-hero-640.webp')).not.toBeNull();
  });
});

describe('빈 대진표 — EmptyState 전환', () => {
  it('대진표가 없으면 종목 그래픽 + "대회 정보 보기" CTA를 보여준다', () => {
    const tournament = makeTournament({ id: 'tour-wave5', status: 'open', format: 'knockout' });
    const { container } = renderBracketStandingsTab(tournament);

    expect(queryImageBySrc(container, '/illustrations/landing-hero-640.webp')).not.toBeNull();
    const cta = screen.getByRole('link', { name: '대회 정보 보기' });
    expect(cta).toHaveAttribute('href', '/tournaments/tour-wave5');
  });
});

describe('셸 크롬 — 데스크톱 헤드 + 중복 h1 제거', () => {
  it('/tournaments 목록은 desktopHead 를 받는다', () => {
    expect(resolveRouteChrome('/tournaments')?.chrome.desktopHead).toBe(true);
  });

  it('순위·브래킷 화면은 자체 h1을 그리지 않는다 — 셸 데스크톱 헤드가 이미 그린다', () => {
    const tournament = makeTournament({ id: 'tour-h1', status: 'open', format: 'knockout' });
    const { container } = renderBracketStandingsTab(tournament);

    expect(container.querySelectorAll('h1')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2, name: '테스트 대회' })).toBeInTheDocument();
  });

  it('참가팀 후기 화면은 자체 h1을 그리지 않는다 — 셸 데스크톱 헤드가 이미 그린다', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TournamentReviewsPageClient tournamentId="tour-h1" />
      </QueryClientProvider>,
    );

    expect(container.querySelectorAll('h1')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2, name: '참가팀 후기' })).toBeInTheDocument();
  });
});

describe('로스터 — 화면당 primary CTA 1개', () => {
  const player = {
    id: 'player-1',
    userId: 'user-1',
    realName: '홍길동',
    birthDateSnapshot: '1995-03-15',
    eligibilityStatus: 'non_pro' as const,
    eligibilityNote: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    removedAt: null,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderRoster() {
    vi.spyOn(api, 'useV1Tournament').mockReturnValue({
      data: { minPlayers: 5, maxPlayers: 20, rosterDeadlineAt: null, status: 'open', genderCategory: null },
    } as never);
    vi.spyOn(api, 'useV1Registration').mockReturnValue({
      data: { id: 'reg-1', teamId: 'team-1', status: 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null },
    } as never);
    vi.spyOn(api, 'useV1TournamentPlayers').mockReturnValue({
      data: { players: [player], belowMinimum: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);
    vi.spyOn(api, 'useV1AddPlayer').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1UpdatePlayer').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1RemovePlayer').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />
      </QueryClientProvider>,
    );
  }

  function primaryButtons() {
    return Array.from(document.querySelectorAll('button.tm-btn-primary'));
  }

  it('평시엔 헤더 "+ 추가"만 primary 다', () => {
    renderRoster();

    expect(primaryButtons()).toHaveLength(1);
    expect(screen.getByRole('button', { name: '선수 추가하기' })).toHaveClass('tm-btn-primary');
  });

  it('추가 칸을 열면 헤더는 outline 으로, 그 칸의 "추가"만 primary 로 바뀐다', () => {
    renderRoster();

    fireEvent.click(screen.getByRole('button', { name: '선수 추가하기' }));

    const headerAdd = screen.getByRole('button', { name: '선수 추가하기' });
    expect(headerAdd).toHaveClass('tm-btn-outline');
    expect(headerAdd).not.toHaveClass('tm-btn-primary');
    const primaries = primaryButtons();
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('추가');
  });

  it('행 수정을 열면 헤더는 outline, 그 행의 "저장"만 primary 다', () => {
    renderRoster();

    fireEvent.click(screen.getByRole('button', { name: '홍길동 수정' }));

    const save = screen.getByRole('button', { name: '저장' });
    expect(save).toHaveClass('tm-btn-primary');
    expect(screen.getByRole('button', { name: '선수 추가하기' })).toHaveClass('tm-btn-outline');
    expect(primaryButtons()).toHaveLength(1);
  });

  it('추가 칸과 행 편집이 동시에 열려도 primary 는 하나(추가 칸)뿐이다', () => {
    renderRoster();

    fireEvent.click(screen.getByRole('button', { name: '홍길동 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '선수 추가하기' }));

    expect(primaryButtons()).toHaveLength(1);
    expect(primaryButtons()[0]).toHaveTextContent('추가');
    expect(screen.getByRole('button', { name: '저장' })).toHaveClass('tm-btn-outline');
  });
});
