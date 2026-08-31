import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentDetailView, getBracketEntryCtaLabel } from './tournament-detail-client';
import type { V1TournamentDetail, V1TournamentGroup, V1TournamentStatus } from '@/types/api';

/**
 * 대회 상세 §A-1~5 회귀 방지:
 *  - CTA 라벨이 대회 상태에 따라 바뀐다(§A-3)
 *  - 중복 "전체 경기 일정 보기" 링크가 없다(§A-2)
 *  - 조별 순위 섹션이 상세에서 렌더되지 않는다(§A-1)
 */

// TournamentInquirySection(leftContent/completedLeftContent 맨 끝)이 next/navigation의
// useRouter를 쓴다 — tournament-detail-page-client.test.tsx와 동일한 최소 mock.
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/t-1',
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
function makeTournament(overrides: Partial<V1TournamentDetail> & Pick<V1TournamentDetail, 'id' | 'status' | 'format'>): V1TournamentDetail {
  return {
    kind: 'regular_tournament',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: '2026-01-01T00:00:00.000Z',
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

function makeGroup(overrides: Partial<V1TournamentGroup> & Pick<V1TournamentGroup, 'id' | 'phase'>): V1TournamentGroup {
  return {
    name: overrides.phase,
    sortOrder: 0,
    advanceCount: null,
    groupTeams: [],
    standings: [],
    ...overrides,
  };
}

describe('getBracketEntryCtaLabel — 상태별 통합 진입 CTA 문구', () => {
  it('in_progress: 오너가 명시한 문구를 그대로 쓴다', () => {
    expect(getBracketEntryCtaLabel('in_progress')).toBe('진행 중인 대회 보기');
  });

  it('completed: "진행 중"이라는 거짓 정보를 쓰지 않는다', () => {
    const label = getBracketEntryCtaLabel('completed');
    expect(label).not.toBeNull();
    expect(label).not.toContain('진행 중');
  });

  it('open/closed(모집 중·예정): 대진 미확정을 단언하지 않는 공통 문구를 쓴다', () => {
    expect(getBracketEntryCtaLabel('open')).toBe('대진표 · 일정 보기');
    expect(getBracketEntryCtaLabel('closed')).toBe('대진표 · 일정 보기');
  });

  it('draft/cancelled: 볼 대진이 없으므로 CTA를 숨긴다(null)', () => {
    expect(getBracketEntryCtaLabel('draft')).toBeNull();
    expect(getBracketEntryCtaLabel('cancelled')).toBeNull();
  });

  it('상태마다 서로 다른 라벨을 반환한다(회귀 방지: 상태 무관 고정 문구로 되돌아가지 않는지)', () => {
    const statuses: V1TournamentStatus[] = ['open', 'closed', 'in_progress', 'completed'];
    const labels = statuses.map((s) => getBracketEntryCtaLabel(s));
    expect(new Set(labels).size).toBeGreaterThan(1);
  });
});

describe('TournamentDetailView — 통합 CTA가 실제 화면에 상태별로 반영된다', () => {
  it('in_progress 대회는 화면에 "진행 중인 대회 보기" CTA를 보여준다', () => {
    const tournament = makeTournament({ id: 't-live', status: 'in_progress', format: 'knockout' });
    render(<TournamentDetailView tournament={tournament} myRegistration={null} />);
    expect(screen.getAllByText('진행 중인 대회 보기').length).toBeGreaterThan(0);
  });

  it('completed 대회는 "진행 중"이 아닌 별도 문구의 CTA를 보여준다', () => {
    const tournament = makeTournament({ id: 't-done', status: 'completed', format: 'knockout' });
    render(<TournamentDetailView tournament={tournament} myRegistration={null} />);
    expect(screen.queryByText('진행 중인 대회 보기')).not.toBeInTheDocument();
    expect(screen.getAllByText('경기 결과 · 대진표 보기').length).toBeGreaterThan(0);
  });
});

describe('TournamentDetailView — 중복 "전체 경기 일정 보기" 링크가 없다', () => {
  it.each<V1TournamentStatus>(['open', 'closed', 'in_progress', 'completed'])(
    '%s 상태에서도 옛 상태-무관 일정 링크 문구가 더 이상 렌더되지 않는다',
    (status) => {
      const tournament = makeTournament({ id: 't-1', status, format: 'knockout' });
      render(<TournamentDetailView tournament={tournament} myRegistration={null} />);
      expect(screen.queryByText('전체 경기 일정 보기')).not.toBeInTheDocument();
    },
  );
});

describe('TournamentDetailView — 조별 순위 섹션이 상세에서 제거됐다', () => {
  it('group_knockout 대회의 조별 순위표(옛 "조별 순위" 헤딩)가 상세 페이지에 없다', () => {
    const tournament = makeTournament({
      id: 't-group',
      status: 'in_progress',
      format: 'group_knockout',
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          advanceCount: 2,
          standings: [
            {
              registrationId: 'reg-1',
              teamId: 'team-1',
              teamName: '성수 FC',
              teamLogoUrl: null,
              position: 1,
              points: 3,
              wins: 1,
              draws: 0,
              losses: 0,
              goalsFor: 2,
              goalsAgainst: 0,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    render(<TournamentDetailView tournament={tournament} myRegistration={null} />);

    // 예전엔 이 헤딩과 실제 순위표(팀명·승점)가 상세 본문에 그대로 렌더됐다.
    expect(screen.queryByText('조별 순위')).not.toBeInTheDocument();
    expect(screen.queryByText('성수 FC')).not.toBeInTheDocument();
    // 대신 /bracket으로 안내하는 문구가 그 자리를 채운다(§A-1 시각적 무게 재조정).
    expect(screen.getByText('실시간 순위표는 대진표에서 확인하세요')).toBeInTheDocument();
  });
});
