import type { ComponentProps } from 'react';
import { renderToString } from 'react-dom/server';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installActualNextReplaceBoundary, type NextRestoreAction } from '@/test/helpers/next-history-boundary';
import type { V1AdminLeagueListItem } from '@/types/league-match';
import AdminLeagueHubPage from './page';
import AdminLeagueMatchDetailPage from './[leagueId]/page';

const LIST_PATH = '/admin/league-matches';
const SERIES_ID = 'ad200000-0000-4000-8000-000000000001';
const SERIES_TITLE = '서울 풋살 커뮤니티 리그';
const LEAGUES: V1AdminLeagueListItem[] = [1, 2].map((tier) => ({
  leagueId: `ad210000-0000-4000-8000-00000000000${tier}`,
  title: `${SERIES_TITLE} 1시즌 ${tier}부`,
  state: 'draft', teamCount: 2, fixtureCount: 0,
  startsOn: '2026-10-01', endsOn: '2026-12-31',
  seriesId: SERIES_ID, seriesTitle: SERIES_TITLE, tierLabel: `${tier}부`, seasonNo: 1,
}));
LEAGUES.push({
  leagueId: 'independent-league', title: '독립 팀 리그',
  state: 'draft', teamCount: 2, fixtureCount: 0,
  startsOn: '2026-10-01', endsOn: '2026-12-31',
  seriesId: null, seriesTitle: null, tierLabel: null, seasonNo: null,
});

let searchSnapshot: URLSearchParams | null = null;
function navigate(href: string) {
  const url = new URL(href, window.location.href);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

vi.mock('next/navigation', () => ({
  usePathname: () => typeof window === 'undefined' ? LIST_PATH : window.location.pathname,
  useSearchParams: () => searchSnapshot ?? new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search),
  useRouter: () => ({ push: navigate, replace: navigate }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: ComponentProps<'a'>) => (
    <a {...props} href={href} onClick={(event) => {
      event.preventDefault();
      if (href) navigate(href);
    }}>{children}</a>
  ),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatchList: (seriesId?: string) => ({
    data: { items: LEAGUES.filter((league) => !seriesId || (
      seriesId === 'independent' ? league.seriesId === null : league.seriesId === seriesId
    )) },
    isPending: false, isError: false, refetch: vi.fn(),
  }),
  useV1AdminLeagueSeriesList: () => ({
    data: { items: [{ id: SERIES_ID, title: SERIES_TITLE, tierLabels: ['1부', '2부'], leagueCount: 2 }] },
    isPending: false, isError: false, refetch: vi.fn(),
  }),
  useV1AdminLeagueMatch: (leagueId: string) => ({
    data: { ...LEAGUES.find((league) => league.leagueId === leagueId), isPublic: true, teamIds: ['team-1', 'team-2'], recentVenues: [], fixtures: [] },
    isPending: false, isError: false, refetch: vi.fn(),
  }),
  useV1AdminMe: () => ({
    data: {
      userId: 'owner-user', adminUserId: 'owner-admin', adminRole: 'owner', status: 'active',
      capabilities: ['status:write'], lastActiveAt: null,
    },
  }),
  useV1UpdateLeagueVisibility: () => ({
    mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null,
  }),
  useV1AdminLeagueTeams: () => ({ data: undefined }),
  useV1AdminTeam: () => ({ data: undefined }),
  useV1Teams: () => ({ data: undefined, isFetching: false }),
  useV1AddLeagueTeam: () => ({ isPending: false }),
  useV1RemoveLeagueTeam: () => ({ isPending: false }),
  useV1RevertLeagueCompletion: () => ({ isPending: false }),
  useV1HoldLeague: () => ({ mutate: vi.fn(), isPending: false }),
  useV1ResumeLeague: () => ({ mutate: vi.fn(), isPending: false }),
  useV1GenerateLeagueFixtures: () => ({ isPending: false }),
  useV1UpdateLeagueFixture: () => ({ isPending: false }),
  useV1CancelLeagueFixture: () => ({ isPending: false }),
  useV1RegenerateLeagueFixtures: () => ({ isPending: false }),
  useV1CreateManualLeagueFixture: () => ({ isPending: false }),
  useV1RecordLeagueForfeit: () => ({ isPending: false }),
  useV1PreviewLeagueFixtures: () => ({ isPending: false }),
}));

async function renderDetail() {
  const leagueId = window.location.pathname.split('/').at(-1) ?? '';
  const props = {
    params: Promise.resolve({ leagueId }),
    searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(window.location.search))),
  };
  return render(await AdminLeagueMatchDetailPage(props));
}

describe('MD-QA #25 관리자 리그 목록 복귀', () => {
  beforeEach(() => {
    searchSnapshot = null;
    navigate(LIST_PATH);
  });

  it('체계를 골라 상세를 열고 리그 목록으로 돌아오면 선택한 체계와 두 소속 리그를 유지한다', async () => {
    const user = userEvent.setup();
    const list = render(<AdminLeagueHubPage />);
    await user.click(screen.getByRole('button', { name: SERIES_TITLE }));
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText('독립 팀 리그')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('table')).getByRole('button', {
      name: `${SERIES_TITLE} 1시즌 1부 상세 보기`,
    }));
    list.unmount();
    const detail = await renderDetail();
    await user.click(screen.getByRole('link', { name: '리그 목록으로' }));
    detail.unmount();
    render(<AdminLeagueHubPage />);

    expect(new URLSearchParams(window.location.search).get('seriesId')).toBe(SERIES_ID);
    expect(screen.getByRole('button', { name: SERIES_TITLE })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText('독립 팀 리그')).not.toBeInTheDocument();
  });

  it('독립 리그 조건도 상세 복귀 뒤에 유지한다', async () => {
    const user = userEvent.setup();
    const list = render(<AdminLeagueHubPage />);
    await user.click(screen.getByRole('button', { name: '독립 리그' }));
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: '독립 팀 리그 상세 보기' }));
    list.unmount();
    const detail = await renderDetail();
    await user.click(screen.getByRole('link', { name: '리그 목록으로' }));
    detail.unmount();
    render(<AdminLeagueHubPage />);

    expect(new URLSearchParams(window.location.search).get('seriesId')).toBe('independent');
    expect(screen.getByRole('button', { name: '독립 리그' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(`${SERIES_TITLE} 1시즌 1부`)).not.toBeInTheDocument();
  });

  it('이전 체계 snapshot이 늦게 도착해도 최신 독립 리그 선택과 실제 목록 및 상세 출처를 유지한다', async () => {
    const user = userEvent.setup();
    navigate(`${LIST_PATH}?from=%2Fadmin`);
    const view = render(<AdminLeagueHubPage />);
    searchSnapshot = new URLSearchParams(window.location.search);
    await user.click(screen.getByRole('button', { name: SERIES_TITLE }));
    const previousSeriesSnapshot = new URLSearchParams(window.location.search);
    await user.click(screen.getByRole('button', { name: '독립 리그' }));
    expect(new URLSearchParams(window.location.search).get('seriesId')).toBe('independent');

    searchSnapshot = previousSeriesSnapshot;
    view.rerender(<AdminLeagueHubPage />);
    expect(screen.getByRole('button', { name: '독립 리그' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(`${SERIES_TITLE} 1시즌 1부`)).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '리그 체계' }));
    expect(new URLSearchParams(window.location.search).get('seriesId')).toBe('independent');
    await user.click(screen.getByRole('tab', { name: '정규 리그' }));
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: '독립 팀 리그 상세 보기' }));
    const from = new URLSearchParams(window.location.search).get('from');
    expect(from).toBe(`${LIST_PATH}?seriesId=independent&from=%2Fadmin`);
    view.unmount();
    await renderDetail();
    expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', from);
  });

  it('이전 리그 체계 탭 snapshot이 늦게 도착해도 최신 정규 리그 탭과 선택을 유지한다', async () => {
    const user = userEvent.setup();
    const view = render(<AdminLeagueHubPage />);
    searchSnapshot = new URLSearchParams();
    await user.click(screen.getByRole('button', { name: '독립 리그' }));
    await user.click(screen.getByRole('tab', { name: '리그 체계' }));
    const previousTabSnapshot = new URLSearchParams(window.location.search);
    await user.click(screen.getByRole('tab', { name: '정규 리그' }));
    searchSnapshot = previousTabSnapshot;
    view.rerender(<AdminLeagueHubPage />);

    expect(screen.getByRole('tab', { name: '정규 리그' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '독립 리그' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(1);
  });

  it('native Back/Forward로 체계를 복원하고 설치된 Next history 경계가 출처와 hash 및 내부 상태를 보존한다', async () => {
    const user = userEvent.setup();
    navigate(`${LIST_PATH}?seriesId=${SERIES_ID}&from=%2Fadmin#leagues`);
    const view = render(<AdminLeagueHubPage />);
    window.history.pushState(null, '', `${LIST_PATH}?seriesId=independent&from=%2Fadmin#leagues`);
    view.rerender(<AdminLeagueHubPage />);
    searchSnapshot = new URLSearchParams(`seriesId=${SERIES_ID}&from=%2Fadmin`);
    view.rerender(<AdminLeagueHubPage />);
    expect(screen.getByRole('button', { name: '독립 리그' })).toHaveAttribute('aria-pressed', 'true');
    for (const [direction, label, count] of [['back', SERIES_TITLE, 2], ['forward', '독립 리그', 1]] as const) {
      await act(() => new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
        window.history[direction]();
      }));
      view.rerender(<AdminLeagueHubPage />);
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
      expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(count);
    }
    const tree = ['root', {}];
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree }, '', window.location.href);
    const restored: NextRestoreAction[] = [];
    const restoreBoundary = installActualNextReplaceBoundary((action) => restored.push(action));
    try {
      const historyLength = window.history.length;
      await user.click(screen.getByRole('button', { name: SERIES_TITLE }));
      expect(window.history.length).toBe(historyLength);
      expect(window.history.state).toMatchObject({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree });
      expect(restored.at(-1)?.url.searchParams.get('seriesId')).toBe(SERIES_ID);
      expect(restored.at(-1)?.url.hash).toBe('#leagues');
      fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: `${SERIES_TITLE} 1시즌 1부 상세 보기` }));
      expect(new URLSearchParams(window.location.search).get('from')).toBe(`${LIST_PATH}?seriesId=${SERIES_ID}&from=%2Fadmin#leagues`);
    } finally {
      restoreBoundary();
    }
  });

  it('서버 렌더링은 window 없이 목록을 그린다', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(renderToString(<AdminLeagueHubPage />)).toContain('리그 관리');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('체계 조건과 기존 출처를 탭 전환에 보존하고 외부 URL 변경에 맞춰 복원한다', async () => {
    const user = userEvent.setup();
    navigate(`${LIST_PATH}?from=%2Fadmin`);
    const view = render(<AdminLeagueHubPage />);
    await user.click(screen.getByRole('button', { name: SERIES_TITLE }));
    await user.click(screen.getByRole('tab', { name: '리그 체계' }));
    expect(new URLSearchParams(window.location.search).get('seriesId')).toBe(SERIES_ID);
    expect(new URLSearchParams(window.location.search).get('from')).toBe('/admin');
    await user.click(screen.getByRole('tab', { name: '정규 리그' }));
    expect(screen.getByRole('button', { name: SERIES_TITLE })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(2);

    navigate(`${LIST_PATH}?seriesId=independent`);
    view.rerender(<AdminLeagueHubPage />);
    expect(screen.getByRole('button', { name: '독립 리그' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '전체' }));
    expect(new URLSearchParams(window.location.search).has('seriesId')).toBe(false);
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(3);
  });

  it('조건이 없는 직접 상세 진입은 기본 목록으로 돌아간다', async () => {
    navigate(`${LIST_PATH}/ad210000-0000-4000-8000-000000000001`);
    await renderDetail();
    expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', LIST_PATH);
  });

  it.each([
    'https://evil.example/admin/league-matches',
    '//evil.example/admin/league-matches',
    '/\\evil.example/admin/league-matches',
    '/..//evil.example',
    'javascript:alert(1)',
    '/login?redirect=/admin',
  ])('검증되지 않은 출처 %s는 기본 목록으로 돌아간다', async (from) => {
    navigate(`${LIST_PATH}/ad210000-0000-4000-8000-000000000001?from=${encodeURIComponent(from)}`);
    await renderDetail();
    expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', LIST_PATH);
  });

  it('중복 from 값은 선택하지 않고 기본 목록으로 돌아간다', async () => {
    render(await AdminLeagueMatchDetailPage({
      params: Promise.resolve({ leagueId: 'ad210000-0000-4000-8000-000000000001' }),
      searchParams: Promise.resolve({ from: [`${LIST_PATH}?seriesId=${SERIES_ID}`, '//evil.example'] }),
    }));
    expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', LIST_PATH);
  });

  it('검증된 목록 조건과 중첩된 로컬 출처는 그대로 돌려준다', async () => {
    const from = `${LIST_PATH}?seriesId=${SERIES_ID}&from=%2Fadmin%2Fleague-series%3Ftab%3Dseries`;
    navigate(`${LIST_PATH}/ad210000-0000-4000-8000-000000000001?from=${encodeURIComponent(from)}`);
    await renderDetail();
    expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', from);
  });
});
