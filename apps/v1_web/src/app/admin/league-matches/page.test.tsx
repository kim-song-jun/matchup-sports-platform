import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AdminLeagueHubPage from './page';

const leagueListMock = vi.fn();
const seriesListMock = vi.fn();
const visibilityMutateAsync = vi.fn();
let canWrite = true;
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatchList: (...args: unknown[]) => leagueListMock(...args),
  useV1AdminMe: () => ({ data: { capabilities: canWrite ? ['status:write'] : [] } }),
  useV1UpdateLeagueVisibility: (leagueId: string) => ({
    mutateAsync: (body: { isPublic: boolean }) => visibilityMutateAsync(leagueId, body),
    isPending: false,
  }),
  useV1AdminLeagueSeriesList: () => seriesListMock(),
}));

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/league-matches',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const LEAGUES = [
  {
    leagueId: 'lg-1',
    isPublic: true,
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
    isPublic: false,
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

const SUMMARY = {
  total: 6,
  byStatus: { draft: 1, open: 2, closed: 0, in_progress: 2, completed: 1, on_hold: 0 },
};

const SERIES = [
  { id: 'sr-1', title: '서울 풋살 리그', state: 'active', tierLabels: ['1부', '2부'], sport: null, region: null, leagueCount: 2 },
];

describe('AdminLeagueHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    canWrite = true;
    visibilityMutateAsync.mockResolvedValue({});
    window.history.replaceState(null, '', '/admin/league-matches');
    leagueListMock.mockReturnValue({ data: { items: LEAGUES, summary: SUMMARY }, isPending: false, isError: false, refetch: vi.fn() });
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

  it('상태 칩(초안·접수 중·마감·진행 중·종료·보류)과 숫자를 보여 주고, 체계 칩은 두지 않는다', () => {
    render(<AdminLeagueHubPage />);

    const group = screen.getByRole('group', { name: '상태 필터' });
    expect(within(group).getByRole('button', { name: '전체 6' })).toHaveAttribute('aria-pressed', 'true');
    for (const [label, count] of [['초안', 1], ['접수 중', 2], ['마감', 0], ['시즌 진행 중', 2], ['종료', 1], ['보류', 0]] as const) {
      expect(within(group).getByRole('button', { name: `${label} ${count}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('group', { name: '체계 필터' })).not.toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: /독립 리그/ })).not.toBeInTheDocument();
  });

  it('상태 칩 선택을 목록 훅의 status 로 넘기고 주소에 남긴다(전체 = 조건 없음)', async () => {
    const user = userEvent.setup();
    render(<AdminLeagueHubPage />);

    expect(leagueListMock).toHaveBeenLastCalledWith({});

    await user.click(screen.getByRole('button', { name: /^접수 중/ }));
    expect(leagueListMock).toHaveBeenLastCalledWith({ status: 'open' });
    expect(window.location.search).toBe('?status=open');
    expect(screen.getByRole('button', { name: /^접수 중/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /^전체/ }));
    expect(leagueListMock).toHaveBeenLastCalledWith({});
    expect(window.location.search).toBe('');
  });

  it('목록에 없는 ?status= 값은 서버로 보내지 않고 전체로 떨어뜨린다', () => {
    searchParams = new URLSearchParams('status=banned');
    window.history.replaceState(null, '', '/admin/league-matches?status=banned');
    render(<AdminLeagueHubPage />);

    expect(leagueListMock).toHaveBeenLastCalledWith({});
  });

  it('검색창 입력은 바로 주소에 남기고 0.3초 뒤에 목록 훅의 q 로 넘긴다(앞뒤 공백 제외)', async () => {
    const user = userEvent.setup();
    render(<AdminLeagueHubPage />);

    const input = screen.getByRole('searchbox', { name: '리그·체계 이름 검색' });
    expect(input).toHaveAttribute('placeholder', '리그·체계 이름 검색');
    await user.type(input, ' 서울 ');

    expect(new URLSearchParams(window.location.search).get('q')).toBe(' 서울 ');
    await waitFor(() => expect(leagueListMock).toHaveBeenLastCalledWith({ q: '서울' }));
  });

  it('검색 결과가 비면 조건을 안내한다', () => {
    leagueListMock.mockReturnValue({ data: { items: [], summary: { ...SUMMARY, total: 0 } }, isPending: false, isError: false, refetch: vi.fn() });
    searchParams = new URLSearchParams('q=없는리그');
    window.history.replaceState(null, '', '/admin/league-matches?q=없는리그');
    render(<AdminLeagueHubPage />);

    expect(screen.getAllByText('이 조건의 리그가 없어요').length).toBeGreaterThan(0);
  });

  it('passes the 공개 여부 filter to the list hook and keeps it in the URL', async () => {
    const user = userEvent.setup();
    render(<AdminLeagueHubPage />);

    await user.selectOptions(screen.getByLabelText('공개 여부'), 'hidden');
    expect(leagueListMock).toHaveBeenLastCalledWith({ visibility: 'hidden' });
    expect(window.location.search).toBe('?visibility=hidden');

    await user.selectOptions(screen.getByLabelText('공개 여부'), '');
    expect(leagueListMock).toHaveBeenLastCalledWith({});
  });

  it('shows each league 공개/숨김 as text and hides a public league only after the confirm modal', async () => {
    const user = userEvent.setup();
    render(<AdminLeagueHubPage />);

    const table = screen.getByRole('table');
    // 열 머리글 '공개' + 공개 배지 1개
    expect(within(table).getAllByText('공개')).toHaveLength(2);
    expect(within(table).getByText('숨김')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: '서울 풋살 정규 리그 1부 숨기기' }));
    expect(visibilityMutateAsync).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '숨기기' }));
    expect(visibilityMutateAsync).toHaveBeenCalledWith('lg-1', { isPublic: false });

    await user.click(within(table).getByRole('button', { name: '성남 야간 풋살 리그 다시 보이기' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '다시 보이기' }));
    expect(visibilityMutateAsync).toHaveBeenLastCalledWith('lg-2', { isPublic: true });
  });

  it('surfaces the server error (e.g. on-hold league 409) as a toast and does not claim success', async () => {
    const user = userEvent.setup();
    visibilityMutateAsync.mockRejectedValue(
      Object.assign(new Error('x'), { response: { data: { message: '보류 중인 리그는 공개할 수 없어요.' } } }),
    );
    render(<AdminLeagueHubPage />);

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: '성남 야간 풋살 리그 다시 보이기' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '다시 보이기' }));

    expect(await screen.findByText('보류 중인 리그는 공개할 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('리그를 다시 공개했어요.')).not.toBeInTheDocument();
  });

  it('disables the row action for read-only admins', () => {
    canWrite = false;
    render(<AdminLeagueHubPage />);

    const button = within(screen.getByRole('table')).getByRole('button', { name: /서울 풋살 정규 리그 1부 숨기기/ });
    expect(button).toBeDisabled();
  });

  it('switches to the series tab, mirrors ?tab=series into the URL, and swaps the create action', async () => {
    const user = userEvent.setup();
    render(<AdminLeagueHubPage />);

    expect(screen.getByRole('link', { name: /리그 만들기/ })).toHaveAttribute(
      'href',
      '/admin/league-matches/new',
    );

    await user.click(screen.getByRole('tab', { name: '리그 체계' }));

    expect(`${window.location.pathname}${window.location.search}`).toBe('/admin/league-matches?tab=series');
    expect(screen.getByRole('tab', { name: '리그 체계' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: /리그 체계 만들기/ })).toHaveAttribute(
      'href',
      '/admin/league-series/new',
    );
    // 체계 목록 본문(기존 화면 이식)이 렌더된다 — 표+카드 이중 렌더라 개수만 본다.
    expect(screen.getAllByText('서울 풋살 리그').length).toBeGreaterThan(0);
  });

  it('lands on the series tab when ?tab=series (구 URL 리다이렉트 착지)', () => {
    searchParams = new URLSearchParams('tab=series');
    window.history.replaceState(null, '', '/admin/league-matches?tab=series');
    render(<AdminLeagueHubPage />);

    expect(screen.getByRole('tab', { name: '리그 체계' })).toHaveAttribute('aria-selected', 'true');
  });
});
