import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplyCTA, TournamentDetailView, getBracketEntryCtaLabel, isDetailRegistrationPhase, isLeagueMatchDay } from './tournament-detail-client';
import type { V1TournamentDetail, V1TournamentGroup, V1TournamentRegistration, V1TournamentStatus } from '@/types/api';

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
    entryFeeConfigured: true,
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

function makeGroup(overrides: Partial<V1TournamentGroup> & Pick<V1TournamentGroup, 'id' | 'phase'>): V1TournamentGroup {
  return {
    name: overrides.phase,
    sortOrder: 0,
    advanceCount: null,
    groupTeams: [],
    standings: [],
    qualification: null,
    ...overrides,
  };
}

/**
 * 정규 리그 시즌의 CTA 문구(2026-09-01 사용자 확정). 리그엔 대진표가 없어 대회 문구가
 * 그대로 **거짓**이 된다 — '대진표 · 일정 보기' 를 눌러 들어가면 대진표가 없다.
 *
 * 대조군을 함께 둔다: **리그 방식으로 치르는 대회(`format === 'league'`)는 대회 문구를
 * 그대로 쓴다.** 사용자가 *"대회 쪽 문구는 그대로 두고 정규 리그일 때만"* 이라고 못박았고,
 * `isLeagueCompetition` 으로 판정했다면 alpha 62건 중 7건이 함께 바뀌었을 자리다.
 */
describe('getBracketEntryCtaLabel — 정규 리그 문구', () => {
  it('in_progress: 진행 중인 리그 보기', () => {
    expect(getBracketEntryCtaLabel('in_progress', true)).toBe('진행 중인 리그 보기');
  });

  it('completed: 최종 순위 보기 — 리그엔 대진표가 없다', () => {
    expect(getBracketEntryCtaLabel('completed', true)).toBe('최종 순위 보기');
  });

  it('closed: 일정 보기 — "대진표" 를 약속하지 않는다', () => {
    expect(getBracketEntryCtaLabel('closed', true)).toBe('일정 보기');
  });

  it('draft·cancelled 는 리그에서도 CTA 자체가 없다', () => {
    expect(getBracketEntryCtaLabel('draft', true)).toBeNull();
    expect(getBracketEntryCtaLabel('cancelled', true)).toBeNull();
  });

  it('대조군: 플래그가 꺼져 있으면 대회 문구 그대로 — 리그 방식 대회 7건이 여기 해당한다', () => {
    expect(getBracketEntryCtaLabel('in_progress', false)).toBe('진행 중인 대회 보기');
    expect(getBracketEntryCtaLabel('completed', false)).toBe('경기 결과 · 대진표 보기');
    expect(getBracketEntryCtaLabel('closed', false)).toBe('대진표 · 일정 보기');
  });

  it('플래그를 안 주면 대회 문구다 — 기본값이 대회여야 기존 호출부가 안 바뀐다', () => {
    expect(getBracketEntryCtaLabel('in_progress')).toBe(getBracketEntryCtaLabel('in_progress', false));
  });
});

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

/**
 * [P2] 같은 통합 진입 CTA(BracketEntryCtaButton, 같은 href /bracket)가 상단 스티키와
 * 페이지 맨 끝에 2회 렌더돼 완전히 중복됐다 — 페이지 끝 인스턴스를 없애 상단 스티키
 * 하나만 남긴다. `aria-label`은 BracketEntryCtaButton만 붙이므로(StandingsMovedNotice 등 같은
 * href를 쓰는 다른 안내 링크와 구분된다) 그 속성으로 좁혀 센다. 진행 중 데스크톱 레일은 같은 버튼을
 * 재사용하지만 `.tm-show-desktop`/`.tm-hide-desktop` 으로 상단 스티키와 동시에 보이지 않으므로
 * 레일 밖과 안을 나눠 센다.
 */
describe('TournamentDetailView — 통합 진입 CTA 중복 제거(P2)', () => {
  it.each<V1TournamentStatus>(['closed', 'in_progress', 'completed'])(
    '%s 상태에서 BracketEntryCtaButton 인스턴스가 레일 밖에서 정확히 한 번만 렌더된다(상단 스티키 하나, 페이지 끝 없음)',
    (status) => {
      const tournament = makeTournament({ id: 't-cta-dedupe', status, format: 'knockout' });
      const { container } = render(<TournamentDetailView tournament={tournament} myRegistration={null} />);

      const label = getBracketEntryCtaLabel(status, false);
      expect(label).not.toBeNull();
      const all = [...container.querySelectorAll(`a[aria-label="${label}"]`)];
      expect(all.filter((a) => !a.closest('.tm-tournament-rail'))).toHaveLength(1);
      expect(all.filter((a) => a.closest('.tm-tournament-rail'))).toHaveLength(status === 'in_progress' ? 1 : 0);
    },
  );
});

describe('TournamentDetailView — 신청 차단 사유 표시', () => {
  it.each([
    { status: 'open', deadline: null, pending: 0, label: '모집 중' },
    { status: 'open', deadline: '2026-10-06T15:00:00.000+09:00', pending: 0, label: '모집 중' },
    { status: 'open', deadline: '2026-10-06T14:59:59.999+09:00', pending: 0, label: '모집 마감' },
    { status: 'open', deadline: '2099-01-01T00:00:00.000Z', pending: 4, label: '모집 마감' },
    { status: 'closed', deadline: '2020-01-01T00:00:00.000Z', pending: 0, label: '마감' },
    { status: 'in_progress', deadline: '2020-01-01T00:00:00.000Z', pending: 0, label: '진행 중' },
    { status: 'completed', deadline: '2020-01-01T00:00:00.000Z', pending: 0, label: '종료' },
  ] satisfies Array<{ status: V1TournamentStatus; deadline: string | null; pending: number; label: string }>) (
    '대표 배지는 기존 신청 경계와 대회 단계를 유지해요: $status / $deadline / $pending',
    ({ status, deadline, pending, label }) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-06T06:00:00.000Z'));
      try {
        const tournament = makeTournament({
          id: 't-deadline-boundary',
          status,
          format: 'knockout',
          teamCount: 4,
          pendingPaymentCount: pending,
          registrationDeadlineAt: deadline,
        });
        render(<TournamentDetailView tournament={tournament} myRegistration={null} />);
        expect(screen.getByText(label, { selector: '.tm-badge' })).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('신청 마감 사유를 disabled CTA의 설명으로 이어 붙이고 화면에도 보여준다', () => {
    const tournament = makeTournament({
      id: 't-deadline',
      status: 'open',
      format: 'knockout',
      registrationDeadlineAt: '2020-01-01T00:00:00.000Z',
    });
    render(<TournamentDetailView tournament={tournament} myRegistration={null} />);

    const reason = '신청이 마감돼서 새로 신청할 수 없어요.';
    expect(screen.getByText('모집 마감')).toHaveClass('tm-badge-grey');
    expect(screen.queryByText('모집 중')).not.toBeInTheDocument();
    // 버튼의 이름은 보이는 글자 그대로 두고(WCAG 2.5.3), 사유는 설명으로 잇는다.
    const button = screen.getByRole('button', { name: '신청 마감' });
    expect(button).toBeDisabled();
    expect(screen.getByText(reason)).toBeVisible();
    const describedBy = button.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy as string)?.textContent).toBe(reason);
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
              sharedRank: null,
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

/**
 * Task 180 R-1 — 신청한 팀에게는 제목 아래 "우리 팀 참가" 카드가 신청 내역·명단 입구다.
 * 하단 고정 [내 신청 보기]·레일 버튼까지 두면 같은 곳으로 가는 입구가 한 화면에 둘이 된다.
 */
describe('대회 상세 — 신청한 팀의 입구는 카드 하나', () => {
  const registration = (status: V1TournamentRegistration['status']) =>
    ({ id: 'reg-1', teamId: 'team-a', status }) as V1TournamentRegistration;
  const myLinks = (container: HTMLElement) => container.querySelectorAll('a[href^="/tournaments/t-r1/my"]');

  it('신청이 있으면 하단 고정·레일의 신청 버튼이 없고, 하단 대신 대진 입구가 상단에 남는다', () => {
    const tournament = makeTournament({ id: 't-r1', status: 'open', format: 'knockout' });
    const fixed = render(<ApplyCTA tournament={tournament} myRegistration={registration('confirmed')} />);
    expect(fixed.container).toBeEmptyDOMElement();
    fixed.unmount();

    const { container } = render(
      <TournamentDetailView tournament={tournament} myRegistration={registration('confirmed')} entrySection={<p>우리 팀 참가 카드</p>} />,
    );
    expect(screen.getByText('우리 팀 참가 카드')).toBeInTheDocument();
    expect(myLinks(container)).toHaveLength(0);
    expect(screen.queryByText('참가 신청하기')).not.toBeInTheDocument();
    const bracketLabel = getBracketEntryCtaLabel('open', false);
    expect(container.querySelectorAll(`a[aria-label="${bracketLabel}"]`)).toHaveLength(1);
  });

  it('대조군: 신청하지 않은 팀에게는 하단 고정·레일의 [참가 신청하기]가 그대로다', () => {
    const tournament = makeTournament({ id: 't-r1', status: 'open', format: 'knockout' });
    const fixed = render(<ApplyCTA tournament={tournament} myRegistration={null} />);
    expect(within(fixed.container).getByRole('link', { name: '참가 신청하기' })).toHaveAttribute('href', '/tournaments/t-r1/my');
    fixed.unmount();

    const { container } = render(<TournamentDetailView tournament={tournament} myRegistration={null} />);
    expect(myLinks(container).length).toBeGreaterThan(0);
  });

  it('대조군: 취소한 신청만 있으면 [다시 신청하기]가 남는다', () => {
    const tournament = makeTournament({ id: 't-r1', status: 'open', format: 'knockout' });
    render(<ApplyCTA tournament={tournament} myRegistration={registration('cancelled')} />);
    expect(screen.getByRole('link', { name: '대회 다시 신청하기' })).toBeInTheDocument();
  });
});

/**
 * 정규 리그의 진입 CTA(2026-10-13 사용자 확정).
 *  - 리그는 첫 경기 킥오프 전까지만 "모집 중 화면" 이다. 첫 경기가 시작된 리그는 참가 여부와 상관없이 진입 CTA 를
 *    받는다 — 예전엔 진행 중 리그가 늘 모집 중으로 판정돼 데스크톱 레일과 비참가자의 모바일 상단에서
 *    "진행 중인 리그 보기" 가 사라졌다.
 *  - 리그는 몇 주에 걸쳐 열리므로 **경기가 있는 날**만 LIVE 로 강조하고, 아니면 중립 "리그 일정 보기".
 */
describe('TournamentDetailView — 정규 리그 진입 CTA', () => {
  const NOW = new Date('2026-10-13T03:00:00.000Z'); // 2026-10-13 12:00 KST

  function leagueFixture(startAt: string, overrides: Partial<V1TournamentDetail['leagueFixtures'][number]> = {}) {
    return {
      teamMatchId: `tm-${startAt}`, title: '1주차', homeTeamId: 't1', awayTeamId: 't2', startAt,
      placeName: '성수 풋살장', status: 'matched', gameState: 'SCHEDULED', ...overrides,
    } as V1TournamentDetail['leagueFixtures'][number];
  }

  function makeLeague(leagueFixtures: V1TournamentDetail['leagueFixtures'], overrides: Partial<V1TournamentDetail> = {}) {
    return makeTournament({
      id: 'league-1', status: 'in_progress', format: 'league', kind: 'regular_league',
      scheduledAt: '2026-09-16T00:00:00.000+09:00', scheduledEndAt: '2026-10-27T23:59:00.000+09:00',
      registrationDeadlineAt: '2026-10-30T00:00:00.000+09:00', leagueFirstMatchStarted: true, leagueFixtures, ...overrides,
    });
  }

  const ENTRY = (container: HTMLElement, label: string) => [...container.querySelectorAll(`a[aria-label="${label}"]`)];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('isDetailRegistrationPhase — 리그는 첫 경기 킥오프 전까지만 모집 중 화면이다(서버 leagueFirstMatchStarted)', () => {
    expect(isDetailRegistrationPhase({ kind: 'regular_league', status: 'in_progress', leagueFirstMatchStarted: false })).toBe(true);
    // 구버전 응답(값 없음)은 기존처럼 모집 중으로 본다 — 서버가 실제 신청을 판정한다.
    expect(isDetailRegistrationPhase({ kind: 'regular_league', status: 'in_progress' })).toBe(true);
    expect(isDetailRegistrationPhase({ kind: 'regular_league', status: 'in_progress', leagueFirstMatchStarted: true })).toBe(false);
    expect(isDetailRegistrationPhase({ kind: 'regular_league', status: 'completed', leagueFirstMatchStarted: false })).toBe(false);
    expect(isDetailRegistrationPhase({ kind: 'regular_tournament', status: 'open', leagueFirstMatchStarted: false })).toBe(true);
  });

  it('isLeagueMatchDay — 오늘(KST) 시작하는 경기, 또는 날짜를 넘긴 진행 중 경기가 있으면 경기일이다', () => {
    expect(isLeagueMatchDay([leagueFixture('2026-10-13T20:00:00.000+09:00')], NOW)).toBe(true);
    // KST 자정 직전 시작 — UTC 로는 전날이지만 한국 날짜로 오늘이다.
    expect(isLeagueMatchDay([leagueFixture('2026-10-13T00:10:00.000+09:00')], NOW)).toBe(true);
    expect(isLeagueMatchDay([leagueFixture('2026-10-14T00:00:00.000+09:00')], NOW)).toBe(false);
    expect(isLeagueMatchDay([leagueFixture('2026-10-12T23:00:00.000+09:00', { gameState: 'LIVE' })], NOW)).toBe(true);
    expect(isLeagueMatchDay([leagueFixture('2026-10-12T23:00:00.000+09:00', { gameState: 'PAUSED' })], NOW)).toBe(true);
    expect(isLeagueMatchDay([leagueFixture('2026-10-13T20:00:00.000+09:00', { status: 'cancelled' })], NOW)).toBe(false);
    expect(isLeagueMatchDay([], NOW)).toBe(false);
  });

  it('첫 경기가 시작된 뒤 경기가 있는 날: 비참가자에게도 모바일 상단·데스크톱 레일 모두 LIVE "진행 중인 리그 보기" 가 뜨고 신청 버튼은 없다', () => {
    const league = makeLeague([leagueFixture('2026-10-13T20:00:00.000+09:00')]);
    const { container } = render(<TournamentDetailView tournament={league} myRegistration={null} />);

    const links = ENTRY(container, '진행 중인 리그 보기');
    expect(links.filter((a) => !a.closest('.tm-tournament-rail'))).toHaveLength(1);
    expect(links.filter((a) => a.closest('.tm-tournament-rail'))).toHaveLength(1);
    for (const link of links) {
      expect(link).toHaveTextContent('LIVE');
      expect(link.getAttribute('href')).toContain('/tournaments/league-1/bracket');
    }
    expect(container.querySelector('aside[aria-label="리그 참가 신청"]')).toBeNull();
    expect(screen.queryByText('모집 마감')).toBeNull();
  });

  it('경기가 없는 날: LIVE 없이 중립 "리그 일정 보기" 가 같은 자리에 뜬다', () => {
    const league = makeLeague([leagueFixture('2026-10-20T20:00:00.000+09:00')]);
    const { container } = render(<TournamentDetailView tournament={league} myRegistration={null} />);

    expect(ENTRY(container, '진행 중인 리그 보기')).toHaveLength(0);
    const links = ENTRY(container, '리그 일정 보기');
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).not.toHaveTextContent('LIVE');
  });

  it('참가 팀도 데스크톱 레일에 진입 CTA 를 받는다 — 예전엔 레일이 통째로 비었다', () => {
    const league = makeLeague([leagueFixture('2026-10-13T20:00:00.000+09:00')]);
    const registration = { id: 'reg-1', teamId: 't1', status: 'confirmed' } as V1TournamentRegistration;
    const { container } = render(<TournamentDetailView tournament={league} myRegistration={registration} />);

    expect(ENTRY(container, '진행 중인 리그 보기').filter((a) => a.closest('.tm-tournament-rail'))).toHaveLength(1);
  });

  it('첫 경기 킥오프 전 리그는 지금처럼 비참가자에게 신청 레일·하단 신청 버튼을 보여준다 — 경기일이어도 그렇다', () => {
    const league = makeLeague([leagueFixture('2026-10-13T20:00:00.000+09:00')], { leagueFirstMatchStarted: false });
    const { container } = render(<TournamentDetailView tournament={league} myRegistration={null} />);

    expect(container.querySelector('aside[aria-label="리그 참가 신청"]')).not.toBeNull();
    expect(ENTRY(container, '리그 일정 보기')).toHaveLength(0);
  });
});
