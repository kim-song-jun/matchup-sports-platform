import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

let currentUrl = new URL(LIST_PATH, 'https://alpha.teameet.co.kr');
function navigate(href: string) {
  currentUrl = new URL(href, currentUrl);
}

vi.mock('next/navigation', () => ({
  usePathname: () => currentUrl.pathname,
  useSearchParams: () => currentUrl.searchParams,
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
    data: { ...LEAGUES.find((league) => league.leagueId === leagueId), teamIds: ['team-1', 'team-2'], recentVenues: [], fixtures: [] },
    isPending: false, isError: false, refetch: vi.fn(),
  }),
  useV1AdminLeagueTeams: () => ({ data: undefined }),
  useV1AdminTeam: () => ({ data: undefined }),
  useV1Teams: () => ({ data: undefined, isFetching: false }),
  useV1AddLeagueTeam: () => ({ isPending: false }),
  useV1RemoveLeagueTeam: () => ({ isPending: false }),
  useV1RevertLeagueCompletion: () => ({ isPending: false }),
  useV1GenerateLeagueFixtures: () => ({ isPending: false }),
  useV1UpdateLeagueFixture: () => ({ isPending: false }),
  useV1CancelLeagueFixture: () => ({ isPending: false }),
  useV1RegenerateLeagueFixtures: () => ({ isPending: false }),
  useV1CreateManualLeagueFixture: () => ({ isPending: false }),
  useV1RecordLeagueForfeit: () => ({ isPending: false }),
  useV1PreviewLeagueFixtures: () => ({ isPending: false }),
}));

async function renderDetail() {
  const leagueId = currentUrl.pathname.split('/').at(-1) ?? '';
  const props = {
    params: Promise.resolve({ leagueId }),
    searchParams: Promise.resolve(Object.fromEntries(currentUrl.searchParams)),
  };
  return render(await AdminLeagueMatchDetailPage(props));
}

describe('MD-QA #25 관리자 리그 목록 복귀', () => {
  beforeEach(() => {
    currentUrl = new URL(LIST_PATH, 'https://alpha.teameet.co.kr');
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

    expect(currentUrl.searchParams.get('seriesId')).toBe(SERIES_ID);
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

    expect(currentUrl.searchParams.get('seriesId')).toBe('independent');
    expect(screen.getByRole('button', { name: '독립 리그' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(`${SERIES_TITLE} 1시즌 1부`)).not.toBeInTheDocument();
  });

  it('체계 조건과 기존 출처를 탭 전환에 보존하고 외부 URL 변경에 맞춰 복원한다', async () => {
    const user = userEvent.setup();
    navigate(`${LIST_PATH}?from=%2Fadmin`);
    const view = render(<AdminLeagueHubPage />);
    await user.click(screen.getByRole('button', { name: SERIES_TITLE }));
    await user.click(screen.getByRole('tab', { name: '리그 체계' }));
    expect(currentUrl.searchParams.get('seriesId')).toBe(SERIES_ID);
    expect(currentUrl.searchParams.get('from')).toBe('/admin');
    await user.click(screen.getByRole('tab', { name: '정규 리그' }));
    expect(screen.getByRole('button', { name: SERIES_TITLE })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(2);

    navigate(`${LIST_PATH}?seriesId=independent`);
    view.rerender(<AdminLeagueHubPage />);
    expect(screen.getByRole('button', { name: '독립 리그' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '전체' }));
    expect(currentUrl.searchParams.has('seriesId')).toBe(false);
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
