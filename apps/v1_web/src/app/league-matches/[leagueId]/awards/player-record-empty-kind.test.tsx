import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1LeagueMatch, useV1LeagueMatchStandings, useV1LeagueMatchPlayerRecords } from '@/hooks/use-v1-api';
import { LeagueAwardsPageClient } from './league-awards-page-client';
import actualServiceResults from './player-record-empty-kind.fixtures.json';

vi.mock('next/navigation', () => ({
  usePathname: () => '/league-matches/league-contract/awards',
  useSearchParams: () => new URLSearchParams('from=%2Fhome'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
// Query boundaries only; the real awards view and shared empty-copy helper render below.
// Fixtures capture LeagueMatchPublicService.playerRecords with synthetic Prisma inputs and
// the real eligibility loader (2026-10-04). Private goals-only/assists-only inputs yield the
// same public body: hiddenByEligibility is aggregate, not kind-specific. No live DB was used.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1LeagueMatch: vi.fn(), useV1LeagueMatchStandings: vi.fn(), useV1LeagueMatchPlayerRecords: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(useV1LeagueMatch, { partial: true }).mockReturnValue({
    data: { leagueId: 'league-contract', title: '합성 계약 리그', state: 'completed', teamIds: [], fixtures: [],
      maxTeams: null, confirmedCount: 0, pendingPaymentCount: 0,
      startsOn: '2026-08-01T00:00:00.000Z', endsOn: '2026-08-02T00:00:00.000Z',
      registrationDeadlineAt: null, registrationOpen: false, sportCode: 'futsal', coverImageUrl: null, entryFee: 0, entryFeeConfigured: false, seriesSiblings: [] }, isError: false,
  });
  vi.mocked(useV1LeagueMatchStandings, { partial: true }).mockReturnValue({
    data: { leagueId: 'league-contract', tier: null, tierLabel: null, tieBreakOrder: ['points'], standings: [],
      pendingFixtures: [], champions: [], cancelledFixtureCount: 0, promotionDecided: false, promotionForecast: null, tieBreakGroups: [] }, isError: false,
  });
});

describe('실제 service 출력 → 실제 시상 화면 (#1436)', () => {
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
    expect(within(empty).getByRole('link', { name: '리그 순위표 보러가기' })).toHaveAttribute('href', '/tournaments/league-contract?from=%2Fhome');
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

  it('awards keeps record loading separate from empty and error', () => {
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: undefined, isError: false });
    const { container } = render(<LeagueAwardsPageClient leagueId="league-contract" />);
    // Completed standings are supplied above, so this single placeholder is the records query.
    expect(container.querySelectorAll('.tm-skeleton')).toHaveLength(1);
    expect(screen.queryByText('아직 기록이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 공개할 수 있는 기록이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('awards surfaces a stale-data record error, then the successful retry result', () => {
    const refetch = vi.fn();
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: actualServiceResults.bothHidden,
      isError: true, error: new Error('합성 기록 조회 오류'), refetch });
    const { rerender } = render(<LeagueAwardsPageClient leagueId="league-contract" />);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getAllByText('합성 기록 조회 오류').length).toBeGreaterThan(0);
    expect(screen.queryByText('아직 공개할 수 있는 기록이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '득점·도움 순위' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '다시 시도하기' })[0]);
    expect(refetch).toHaveBeenCalledOnce();
    vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true }).mockReturnValue({ data: actualServiceResults.bothNoHidden, isError: false });
    rerender(<LeagueAwardsPageClient leagueId="league-contract" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('합성 기록 조회 오류')).not.toBeInTheDocument();
    expect(screen.getAllByText('아직 기록이 없어요').length).toBeGreaterThan(0);
  });
});
