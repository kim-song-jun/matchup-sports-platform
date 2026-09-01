import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1TournamentDetail } from '@/types/api';
import { AwardsPageClient, ReviewFormModal } from './awards-page-client';

const awardsApiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...awardsApiMocks,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1/awards',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeCompletedTournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    status: 'completed',
    format: 'knockout',
    kind: 'regular_tournament',
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

describe('AwardsPageClient GA events', () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('tracks tournament_share with channel=native_share when the Web Share API is available', () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    fireEvent.click(screen.getByRole('button', { name: '결과 공유' }));

    expect(trackEvent).toHaveBeenCalledWith('tournament_share', { channel: 'native_share' });
    expect(shareMock).toHaveBeenCalled();
  });

  it('tracks tournament_share with channel=clipboard when the Web Share API is unavailable', () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    fireEvent.click(screen.getByRole('button', { name: '결과 공유' }));

    expect(trackEvent).toHaveBeenCalledWith('tournament_share', { channel: 'clipboard' });
    expect(writeTextMock).toHaveBeenCalled();
  });
});

// 감사 evidence: 미완료 분기가 `tournament.prizeSummary` 존재만 봐서, prizePool·
// prizeBreakdown만 채우고 prizeSummary는 비운(스키마상 유효한 흔한 조합) 대회는
// 모집·진행 중에 상금 정보가 전혀 안 보이다가 완료 시점에야 나타나는 모순이 있었다.
// 완료 분기와 동일한 hasPrizeData() 판정을 쓰는지 직접 검증한다.
describe('AwardsPageClient — 완료 전 상금 정보 노출 (hasPrizeData 판정 일치)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('진행 중이라도 prizePool+prizeBreakdown만 있으면(prizeSummary 없이도) 상금 섹션을 보여준다', () => {
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({
        status: 'in_progress',
        prizePool: 3000000,
        prizeSummary: null,
        prizeBreakdown: '1위,1500000\n2위,800000',
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(screen.getByText('총 상금')).toBeInTheDocument();
  });

  it('진행 중이고 prizePool·prizeSummary·prizeBreakdown 전부 없으면 상금 섹션을 그리지 않는다', () => {
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({
        status: 'in_progress',
        prizePool: null,
        prizeSummary: null,
        prizeBreakdown: null,
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(screen.queryByText('총 상금')).not.toBeInTheDocument();
  });
});

// 감사 evidence: 이 바텀시트는 role=dialog·aria-modal만 선언하고 ESC·backdrop 닫기가
// onClose로 연결돼 있지 않았다(백드롭 클릭은 인라인 핸들러로 이미 동작했지만 ESC는
// 전혀 없었다) — 공용 `useModalA11y` 훅으로 옮긴 뒤 계약이 실제로 지켜지는지 검증한다.
describe('ReviewFormModal — 모달 a11y(useModalA11y) 배선', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ESC 키를 누르면 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(<ReviewFormModal tournamentId="tournament-1" onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('배경(backdrop)을 클릭하면 onClose가 호출되고, 패널 내부 클릭은 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<ReviewFormModal tournamentId="tournament-1" onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog', { name: '리뷰 작성' }));
    expect(onClose).not.toHaveBeenCalled();

    // 백드롭은 dialog 패널의 부모 요소다.
    const backdrop = screen.getByRole('dialog', { name: '리뷰 작성' }).parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
