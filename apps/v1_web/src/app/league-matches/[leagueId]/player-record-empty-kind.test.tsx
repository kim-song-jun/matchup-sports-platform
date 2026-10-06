import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1LeagueMatch, useV1LeagueMatchStandings, useV1LeagueMatchPlayerRecords } from '@/hooks/use-v1-api';
import LeagueMatchStandingsClient from '@/app/league-matches/[leagueId]/league-match-standings-client';
import { LeagueAwardsPageClient } from '@/app/league-matches/[leagueId]/awards/league-awards-page-client';
import actualServiceResults from './player-record-empty-kind.fixtures.json';

vi.mock('next/navigation', () => ({
  usePathname: () => '/league-matches/league-contract',
  useSearchParams: () => new URLSearchParams('from=%2Fhome'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
// Query/auth boundaries only; the real standings/awards views and shared helper render below.
// Fixtures capture LeagueMatchPublicService.playerRecords with synthetic Prisma inputs and
// the real eligibility loader (2026-10-04). Private goals-only/assists-only inputs yield the
// same public body: hiddenByEligibility is aggregate, not kind-specific. No live DB was used.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1LeagueMatch: vi.fn(), useV1LeagueMatchStandings: vi.fn(), useV1LeagueMatchPlayerRecords: vi.fn(),
  useV1MyRegistrations: vi.fn(() => ({ data: [] })),
  useV1AuthMe: vi.fn(() => ({ data: undefined })), useV1LeagueClaimableFixtures: vi.fn(() => ({ data: undefined })),
  useV1MyTeams: vi.fn(() => ({ data: undefined })), useV1RecordConsent: vi.fn(() => ({ data: undefined })),
  useV1Tournament: vi.fn(() => ({ data: undefined })), useV1TeamUpcomingGames: vi.fn(() => ({ data: undefined })),
  useV1ActivePopup: vi.fn(() => ({ data: undefined })), useV1MyLeagues: vi.fn(() => ({ data: undefined })),
  useV1Settings: vi.fn(() => ({ data: undefined })), useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn() })),
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(useV1LeagueMatch, { partial: true }).mockReturnValue({
    data: { leagueId: 'league-contract', title: '합성 계약 리그', state: 'completed', teamIds: [], fixtures: [],
      startsOn: '2026-08-01T00:00:00.000Z', endsOn: '2026-08-02T00:00:00.000Z',
      registrationDeadlineAt: null, registrationOpen: false, seriesSiblings: [] }, isError: false,
  });
  vi.mocked(useV1LeagueMatchStandings, { partial: true }).mockReturnValue({
    data: { leagueId: 'league-contract', tier: null, tierLabel: null, tieBreakOrder: ['points'], standings: [],
      pendingFixtures: [], champions: [], cancelledFixtureCount: 0, promotionDecided: false, promotionForecast: null, tieBreakGroups: [] }, isError: false,
  });
});

describe('실제 service 출력 → 실제 순위표 (#1436)', () => {
  it.each([
    ['goalsHiddenGoals', '득점 순위', '도움 순위', '도움'],
    ['goalsHiddenAssists', '득점 순위', '도움 순위', '도움'],
    ['assistsHiddenAssists', '도움 순위', '득점 순위', '득점'],
    ['assistsHiddenGoals', '도움 순위', '득점 순위', '득점'],
  ] as const)('%s 응답만으로 빈 종류에 기록이 존재한다고 단정하지 않는다', (key, populatedTitle, emptyTitle, label) => {
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: actualServiceResults[key], isError: false });
    render(<LeagueMatchStandingsClient leagueId="league-contract" />);
    const populated = screen.getByRole('heading', { name: populatedTitle }).closest('section');
    expect(within(populated!).getByText(/공개 합성 선수/)).toBeInTheDocument();
    const empty = screen.getByRole('heading', { name: emptyTitle }).closest('section');
    expect(within(empty!).getByText('아직 공개할 수 있는 기록이 없어요')).toBeInTheDocument();
    expect(within(empty!).queryByText(new RegExp(`${label} 기록은 있지만`))).not.toBeInTheDocument();
    expect(empty).toHaveTextContent('신원 연동');
    expect(empty).toHaveTextContent('경기 기록 공개');
    expect(screen.queryByText('user-hidden')).not.toBeInTheDocument();
  });

  it('실제 비공개 기록이 없는 응답은 기존의 결과 대기 안내를 유지한다', () => {
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: actualServiceResults.goalsNoHidden, isError: false });
    render(<LeagueMatchStandingsClient leagueId="league-contract" />);
    const empty = screen.getByRole('heading', { name: '도움 순위' }).closest('section');
    expect(within(empty!).getByText('아직 기록이 없어요')).toBeInTheDocument();
    expect(empty).toHaveTextContent('확정된 경기 결과가 쌓이면 도움 순위가 나타나요.');
  });
});

describe('실제 순위표·시상 인접 상태 계약 (#1436)', () => {
  it.each([
    ['goalsHiddenGoals', '득점왕', '도움왕', '도움'],
    ['assistsHiddenAssists', '도움왕', '득점왕', '득점'],
  ] as const)('actual awards keeps public rows and neutralizes the empty kind: %s', (key, publicTitle, emptyTitle, label) => {
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: actualServiceResults[key], isError: false });
    render(<LeagueAwardsPageClient leagueId="league-contract" />);
    const populated = screen.getByRole('heading', { name: publicTitle }).closest('section')!;
    expect(within(populated).getByText(/공개 합성 선수/)).toBeInTheDocument();
    expect(within(populated).getByText('1')).toBeInTheDocument();
    const empty = screen.getByRole('heading', { name: emptyTitle }).closest('section')!;
    expect(empty).toHaveTextContent('아직 공개할 수 있는 기록이 없어요');
    expect(empty).toHaveTextContent(`공개 가능한 ${label} 기록만 순위에 표시돼요`);
    expect(empty).not.toHaveTextContent(`${label} 기록은 있지만`);
    expect(within(empty).getByRole('link', { name: '리그 순위표 보러가기' })).toHaveAttribute('href', '/league-matches/league-contract?from=%2Fhome');
  });

  it.each(['bothHidden', 'bothNoHidden'] as const)('actual service → combined standings keeps %s and schedule action', (key) => {
    const records = actualServiceResults[key];
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: records, isError: false });
    render(<LeagueMatchStandingsClient leagueId="league-contract" />);
    const section = screen.getByRole('heading', { name: '득점·도움 순위' }).closest('section')!;
    expect(section).toHaveTextContent(records.hiddenByEligibility
      ? '기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 득점·도움 순위가 공개돼요.'
      : '확정된 경기 결과가 쌓이면 득점·도움 순위가 나타나요.');
    expect(screen.queryByRole('heading', { name: '득점 순위' })).not.toBeInTheDocument();
    const target = document.getElementById('league-schedule')!;
    const scroll = vi.fn();
    Object.defineProperty(target, 'scrollIntoView', { value: scroll, configurable: true });
    const href = window.location.href;
    const historyLength = window.history.length;
    fireEvent.click(within(section).getByRole('button', { name: '경기 일정 보기' }));
    expect(scroll).toHaveBeenCalledOnce();
    expect(window.location.href).toBe(href);
    expect(window.history.length).toBe(historyLength);
  });

  it.each([false, true])('awards keeps distinct both-empty titles and descriptions (hidden=%s)', (hidden) => {
    const records = hidden ? actualServiceResults.bothHidden : actualServiceResults.bothNoHidden;
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: records, isError: false });
    render(<LeagueAwardsPageClient leagueId="league-contract" />);
    for (const [title, kind] of [['득점왕', 'goals'], ['도움왕', 'assists']] as const) {
      const section = screen.getByRole('heading', { name: title }).closest('section')!;
      const label = kind === 'goals' ? '득점' : '도움';
      expect(section).toHaveTextContent(hidden ? '아직 공개할 수 있는 기록이 없어요' : '아직 기록이 없어요');
      expect(section).toHaveTextContent(hidden
        ? `공개 가능한 ${label} 기록만 순위에 표시돼요.`
        : `확정된 경기 결과가 쌓이면 ${label} 순위가 나타나요.`);
      if (!hidden) expect(section).not.toHaveTextContent('신원 연동');
    }
  });

  it.each(['standings', 'awards'] as const)('%s keeps record loading separate from empty and error', (view) => {
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: undefined, isError: false });
    const { container } = render(view === 'standings' ? <LeagueMatchStandingsClient leagueId="league-contract" /> : <LeagueAwardsPageClient leagueId="league-contract" />);
    if (view === 'standings') {
      for (const title of ['득점 순위', '도움 순위']) {
        const section = screen.getByRole('heading', { name: title }).closest('section')!;
        expect(section.querySelectorAll('.tm-skeleton')).toHaveLength(1);
        expect(within(section).queryByText('아직 기록이 없어요')).not.toBeInTheDocument();
        expect(within(section).queryByText('아직 공개할 수 있는 기록이 없어요')).not.toBeInTheDocument();
      }
    } else {
      // Completed standings are supplied above, so this single placeholder is the records query.
      expect(container.querySelectorAll('.tm-skeleton')).toHaveLength(1);
    }
    expect(screen.queryByText('아직 기록이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 공개할 수 있는 기록이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['standings', 'awards'] as const)('%s surfaces a stale-data record error, then the successful retry result', (view) => {
    const refetch = vi.fn();
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: actualServiceResults.bothHidden,
      isError: true, error: new Error('합성 기록 조회 오류'), refetch });
    const element = view === 'standings' ? <LeagueMatchStandingsClient leagueId="league-contract" /> : <LeagueAwardsPageClient leagueId="league-contract" />;
    const { rerender } = render(element);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getAllByText('합성 기록 조회 오류').length).toBeGreaterThan(0);
    expect(screen.queryByText('아직 공개할 수 있는 기록이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '득점·도움 순위' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '다시 시도하기' })[0]);
    expect(refetch).toHaveBeenCalledOnce();
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: actualServiceResults.bothNoHidden, isError: false });
    rerender(view === 'standings' ? <LeagueMatchStandingsClient leagueId="league-contract" /> : <LeagueAwardsPageClient leagueId="league-contract" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('합성 기록 조회 오류')).not.toBeInTheDocument();
    expect(screen.getAllByText(view === 'standings' ? '확정된 경기 결과가 쌓이면 득점·도움 순위가 나타나요.' : '아직 기록이 없어요').length).toBeGreaterThan(0);
  });
});
