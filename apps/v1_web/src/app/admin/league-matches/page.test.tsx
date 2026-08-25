import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AdminLeagueHubPage from './page';

const leagueListMock = vi.fn();
const seriesListMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatchList: (...args: unknown[]) => leagueListMock(...args),
  useV1AdminLeagueSeriesList: () => seriesListMock(),
}));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/league-matches',
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const LEAGUES = [
  {
    leagueId: 'lg-1',
    title: '서울 풋살 정규 리그 1부',
    state: 'active' as const,
    teamCount: 8,
    fixtureCount: 56,
    startsOn: '2026-08-01',
    endsOn: '2026-11-30',
    seriesId: 'sr-1',
    seriesTitle: '서울 풋살 리그',
    tierLabel: '1부',
    seasonNo: 1,
  },
  {
    leagueId: 'lg-2',
    title: '성남 야간 풋살 리그',
    state: 'draft' as const,
    teamCount: 6,
    fixtureCount: 0,
    startsOn: '2026-09-01',
    endsOn: '2026-12-01',
    seriesId: null,
    seriesTitle: null,
    tierLabel: null,
    seasonNo: null,
  },
];

const SERIES = [
  { id: 'sr-1', title: '서울 풋살 리그', state: 'active', tierLabels: ['1부', '2부'], sport: null, region: null, leagueCount: 2 },
];

describe('AdminLeagueHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    leagueListMock.mockReturnValue({ data: { items: LEAGUES }, isPending: false, isError: false, refetch: vi.fn() });
    seriesListMock.mockReturnValue({ data: { items: SERIES }, isPending: false, isError: false, refetch: vi.fn() });
  });

  it('renders the league list with a 소속·티어 cell — series league gets "체계 · N부", 단발 리그 gets 독립 리그', () => {
    render(<AdminLeagueHubPage />);

    // AdminDataTable 은 데스크톱 표 + 모바일 카드가 함께 DOM 에 있으므로 표 안으로 한정한다.
    const table = screen.getByRole('table');
    expect(within(table).getByText('서울 풋살 리그 · 1부')).toBeInTheDocument();
    expect(within(table).getByText('독립 리그')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '정규 리그' })).toHaveAttribute('aria-selected', 'true');
  });

  it('passes the chip filter to the list hook as seriesId (전체 = undefined)', async () => {
    const user = userEvent.setup();
    render(<AdminLeagueHubPage />);

    expect(leagueListMock).toHaveBeenLastCalledWith(undefined);

    await user.click(screen.getByRole('button', { name: /서울 풋살 리그/ }));
    expect(leagueListMock).toHaveBeenLastCalledWith('sr-1');

    await user.click(screen.getByRole('button', { name: /독립 리그/ }));
    expect(leagueListMock).toHaveBeenLastCalledWith('independent');
  });

  it('switches to the series tab, mirrors ?tab=series into the URL, and swaps the create action', async () => {
    const user = userEvent.setup();
    render(<AdminLeagueHubPage />);

    expect(screen.getByRole('link', { name: /리그 만들기/ })).toHaveAttribute(
      'href',
      '/admin/league-matches/new',
    );

    await user.click(screen.getByRole('tab', { name: '리그 체계' }));

    expect(replaceMock).toHaveBeenCalledWith('/admin/league-matches?tab=series', { scroll: false });
    expect(screen.getByRole('link', { name: /리그 체계 만들기/ })).toHaveAttribute(
      'href',
      '/admin/league-series/new',
    );
    // 체계 목록 본문(기존 화면 이식)이 렌더된다 — 표+카드 이중 렌더라 개수만 본다.
    expect(screen.getAllByText('서울 풋살 리그').length).toBeGreaterThan(0);
  });

  it('lands on the series tab when ?tab=series (구 URL 리다이렉트 착지)', () => {
    searchParams = new URLSearchParams('tab=series');
    render(<AdminLeagueHubPage />);

    expect(screen.getByRole('tab', { name: '리그 체계' })).toHaveAttribute('aria-selected', 'true');
  });
});
