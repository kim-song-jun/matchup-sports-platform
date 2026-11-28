import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1AdminLeagueMatchList } from '@/hooks/use-v1-api';
import { TournamentOpsPickerClient, coversToday } from './tournament-ops-picker-client';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatchList: vi.fn(),
}));

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/admin/ops/tournaments',
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const kst = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+09:00`).toISOString();

function tournament(id: string, title: string, status: string, scheduledAt: string | null, scheduledEndAt: string | null = null) {
  return { id, title, status, venue: null, scheduledAt, scheduledEndAt, registrationDeadlineAt: null, registrationCount: 8, entryFee: 0 };
}

function league(leagueId: string, title: string, state: 'draft' | 'active' | 'completed', startsOn: string, endsOn: string) {
  return { leagueId, title, state, teamCount: 2, fixtureCount: 2, startsOn, endsOn, seriesId: null, seriesTitle: null, tierLabel: null, seasonNo: null };
}

type Row = ReturnType<typeof tournament>;
const TODAY_TOURNAMENT = tournament('t-today', '겨울 풋살컵', 'in_progress', kst('2026-12-20', '09:00'));
const OPEN_TOURNAMENT = tournament('t-open', '봄 풋살컵', 'open', kst('2027-03-01', '10:00'));
const SPAN_TOURNAMENT = tournament('t-span', '장기 대회', 'in_progress', kst('2026-12-18', '09:00'), kst('2026-12-22', '18:00'));
const DRAFT_TOURNAMENT = tournament('t-draft', '초안 대회', 'draft', kst('2026-12-20', '09:00'));
const ACTIVE_LEAGUE = league('l-active', '마포 주말 리그', 'active', '2026-09-30T00:00:00.000Z', '2027-03-01T00:00:00.000Z');
const DRAFT_LEAGUE = league('l-draft', '준비 중 리그', 'draft', '2026-11-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z');

type Boards = Record<string, string[] | 'error'>;
let boards: Boards;
let tournamentRows: Row[];
/** 이 상태(또는 'recent')의 대회 목록 요청은 500 으로 실패한다. */
let failListFor: string | null;
/** 이름 검색(`q`) 요청만 500 으로 실패한다. */
let failSearch: boolean;
/** 이 상태의 대회 목록 응답을 풀어 줄 때까지 붙잡는다. */
let holdListFor: { status: string; release: () => void; gate: Promise<void> } | null;
const boardReads: string[] = [];
const listRequests: URLSearchParams[] = [];

const ok = (data: unknown) => HttpResponse.json({ status: 'success', timestamp: 't', data });

const server = setupServer(
  http.get('*/api/v1/tournament-ops/tournaments/:id/operations', ({ params }) => {
    const id = String(params.id);
    boardReads.push(id);
    const entry = boards[id];
    if (entry === 'error' || entry === undefined) {
      return HttpResponse.json({ status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: '서버가 응답하지 못했어요.' }, { status: 500 });
    }
    return ok({ items: entry.map((at, i) => ({ fixtureId: `${id}-${i}`, scheduledAt: at })), nextCursor: null, watermark: 'w', liveWarnings: [] });
  }),
  // 서버 어드민 대회 목록과 같은 제약: 한 번에 50건까지, 생성 최신순, 커서 페이지.
  http.get('*/api/v1/admin/tournaments', async ({ request }) => {
    const params = new URL(request.url).searchParams;
    listRequests.push(params);
    if (failSearch && params.get('q') !== null) {
      return HttpResponse.json({ status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: '서버가 응답하지 못했어요.' }, { status: 500 });
    }
    if (holdListFor !== null && params.get('status') === holdListFor.status) await holdListFor.gate;
    const limit = Number(params.get('limit') ?? 20);
    if (limit > 50) {
      return HttpResponse.json({ status: 'error', statusCode: 400, code: 'VALIDATION_FAILED', message: '페이지 크기는 50을 넘을 수 없어요.' }, { status: 400 });
    }
    const status = params.get('status');
    if (failListFor !== null && (status ?? 'recent') === failListFor) {
      return HttpResponse.json({ status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: '서버가 응답하지 못했어요.' }, { status: 500 });
    }
    const q = params.get('q');
    const filtered = tournamentRows.filter((row) => (status === null || row.status === status) && (q === null || row.title.includes(q)));
    const start = Number(params.get('cursor') ?? 0);
    const items = filtered.slice(start, start + limit);
    const next = start + limit < filtered.length ? String(start + limit) : null;
    return ok({ items, pageInfo: { nextCursor: next, hasNext: next !== null }, summary: { total: filtered.length, byStatus: {} } });
  }),
  http.post('*/api/v1/logs/client-error', () => ok(null)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function mockLeagues(leagues: unknown[]) {
  vi.mocked(useV1AdminLeagueMatchList).mockReturnValue({
    data: { items: leagues }, isPending: false, isError: false, error: null, refetch: vi.fn(),
  } as never);
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.search = '';
  boardReads.length = 0;
  listRequests.length = 0;
  failListFor = null;
  failSearch = false;
  holdListFor = null;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(kst('2026-12-20', '12:00')));
  boards = { 't-today': [kst('2026-12-20', '10:00')], 't-span': [kst('2026-12-19', '10:00'), kst('2026-12-21', '10:00')], 'l-active': [] };
  tournamentRows = [TODAY_TOURNAMENT, OPEN_TOURNAMENT, SPAN_TOURNAMENT, DRAFT_TOURNAMENT];
  mockLeagues([ACTIVE_LEAGUE, DRAFT_LEAGUE]);
});

function renderPicker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TournamentOpsPickerClient />
    </QueryClientProvider>,
  );
}

// AdminDataTable 은 데스크톱 표 + 모바일 카드 목록을 함께 그린다(CSS 로만 전환) — 행 액션이 두 벌이다.
function linkTargets(name: RegExp): string[] {
  return screen.queryAllByRole('link', { name }).map((link) => link.getAttribute('href') ?? '');
}

const todaySection = () => screen.getByRole('region', { name: /오늘 경기 있는 대회·리그/ });
const allSection = () => screen.getByRole('region', { name: /^전체/ });

describe('coversToday', () => {
  it.each([
    ['시작=끝=오늘', kst('2026-12-20', '09:00'), kst('2026-12-20', '18:00'), true],
    ['기간 한가운데', kst('2026-12-18', '09:00'), kst('2026-12-22', '18:00'), true],
    ['오늘이 마지막 날', kst('2026-12-18', '09:00'), kst('2026-12-20', '23:30'), true],
    ['어제 끝남', kst('2026-12-18', '09:00'), kst('2026-12-19', '18:00'), false],
    ['끝이 없고 시작이 오늘', kst('2026-12-20', '09:00'), null, true],
    ['끝이 없고 시작이 어제', kst('2026-12-19', '09:00'), null, false],
    ['내일 시작', kst('2026-12-21', '09:00'), kst('2026-12-22', '09:00'), false],
    ['시작이 없음', null, null, false],
  ])('%s', (_name, start, end, want) => {
    expect(coversToday(start, end, '2026-12-20')).toBe(want);
  });

  it('KST 자정 앞뒤는 다른 날로 센다', () => {
    expect(coversToday('2026-12-19T15:30:00.000Z', null, '2026-12-20')).toBe(true);
    expect(coversToday('2026-12-19T14:30:00.000Z', null, '2026-12-20')).toBe(false);
  });
});

describe('TournamentOpsPickerClient', () => {
  it('오늘 경기가 있는 대회만 위 묶음에 올리고, 기간만 덮는 대회·초안·다른 날은 전체에만 둔다', async () => {
    renderPicker();

    const today = await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 1' });
    expect(within(today).getAllByText('겨울 풋살컵').length).toBeGreaterThan(0);
    expect(within(today).queryByText('장기 대회')).not.toBeInTheDocument();
    expect(within(today).queryByText('봄 풋살컵')).not.toBeInTheDocument();
    expect(within(allSection()).getAllByText('장기 대회').length).toBeGreaterThan(0);
    expect(within(allSection()).getAllByText('봄 풋살컵').length).toBeGreaterThan(0);
    // 후보는 진행 가능한 것만 읽는다(초안·완료는 읽지 않는다).
    expect(boardReads.sort()).toEqual(['l-active', 't-span', 't-today']);
    expect(screen.getByText(/2026\. 12\. 20\.\(일\)/)).toBeInTheDocument();
  });

  it('대회 목록은 서버 한도(50건) 안에서 요청한다', async () => {
    renderPicker();
    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 1' });

    expect(listRequests.length).toBeGreaterThan(0);
    for (const params of listRequests) expect(Number(params.get('limit'))).toBeLessThanOrEqual(50);
  });

  it('최근 50건보다 오래전에 만든 진행 중 대회도 오늘 후보에 들어간다', async () => {
    const filler = Array.from({ length: 60 }, (_, i) => tournament(`t-old-done-${i}`, `지난 대회 ${i}`, 'completed', kst('2026-01-10', '09:00')));
    const oldInProgress = tournament('t-old', '오래전에 만든 대회', 'in_progress', kst('2026-12-20', '08:00'), kst('2026-12-21', '18:00'));
    tournamentRows = [...filler, oldInProgress];
    boards = { 't-old': [kst('2026-12-20', '10:00')], 'l-active': [kst('2026-12-20', '11:00')] };
    renderPicker();

    const today = await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 2' });
    expect(within(today).getAllByText('오래전에 만든 대회').length).toBeGreaterThan(0);
    expect(boardReads).toContain('t-old');
  });

  it('최근 50건이 꽉 차 잘렸으면 그 사실을 알린다', async () => {
    tournamentRows = Array.from({ length: 60 }, (_, i) => tournament(`t-${i}`, `대회 ${i}`, 'completed', kst('2026-01-10', '09:00')));
    renderPicker();

    expect(await screen.findByText('최근 50건과 진행 중·접수 중 대회를 보여요. 더 오래된 대회는 이름으로 찾아 주세요.')).toBeInTheDocument();
  });

  it('상태 필터 칩이 없고, 접수 중이며 오늘 경기 없는 대회도 전체에서 열 수 있다', async () => {
    renderPicker();
    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 1' });

    expect(screen.queryByRole('button', { name: '진행 중' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '접수 중' })).not.toBeInTheDocument();
    expect(linkTargets(/봄 풋살컵 운영 보드 열기/).every((href) => href === '/admin/live/t-open/operations')).toBe(true);
    expect(linkTargets(/봄 풋살컵 운영 보드 열기/).length).toBeGreaterThan(0);
    expect(within(allSection()).getAllByText('초안 대회').length).toBeGreaterThan(0);
  });

  it('리그 행도 대회와 같은 링크 모양이다', async () => {
    boards['l-active'] = [kst('2026-12-20', '11:00')];
    renderPicker();
    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 2' });

    const targets = linkTargets(/마포 주말 리그 운영 보드 열기/);
    expect(targets.length).toBeGreaterThan(0);
    for (const href of targets) expect(href).toBe('/admin/live/l-active/operations');
  });

  it('대회 행 알약은 대회 상태 이름(접수 마감)을 쓰고, 리그 행은 리그 상태 이름 그대로다', async () => {
    tournamentRows = [...tournamentRows, tournament('t-closed', '여름 풋살컵', 'closed', kst('2027-06-01', '10:00'))];
    renderPicker();
    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 1' });

    const closedRow = within(allSection()).getAllByText('여름 풋살컵')[0].closest('tr') as HTMLElement;
    expect(within(closedRow).getByText('접수 마감')).toBeInTheDocument();
    expect(within(closedRow).queryByText('마감')).not.toBeInTheDocument();

    const leagueRow = within(allSection()).getAllByText('마포 주말 리그')[0].closest('tr') as HTMLElement;
    expect(within(leagueRow).getByText('시즌 진행 중')).toBeInTheDocument();
  });

  it('오늘 경기가 있는 곳이 하나뿐이고 후보를 다 읽었으면 그 운영 보드를 바로 연다', async () => {
    renderPicker();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    expect(nav.replace).toHaveBeenCalledWith('/admin/live/t-today/operations');
  });

  it('둘 이상이면 고르기 화면에 머문다', async () => {
    boards['l-active'] = [kst('2026-12-20', '11:00')];
    renderPicker();

    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 2' });
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('다른 대회 고르기(?pick=1)로 왔으면 하나뿐이어도 다시 튕기지 않는다', async () => {
    nav.search = 'pick=1';
    renderPicker();

    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 1' });
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('기간은 덮지만 오늘 경기가 없으면 위 묶음이 비고 바로 열지 않는다', async () => {
    boards['t-today'] = [kst('2026-12-21', '10:00')];
    renderPicker();

    expect(await screen.findByText('오늘 경기가 있는 대회·리그가 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '오늘 경기 있는 대회·리그 0' })).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(within(allSection()).getAllByText('겨울 풋살컵').length).toBeGreaterThan(0);
  });

  it('후보 하나의 보드를 못 읽으면 나머지 하나로 바로 가지 않고, 목록과 안내를 보여 준다', async () => {
    boards['t-today'] = 'error';
    boards['l-active'] = [kst('2026-12-20', '11:00')];
    renderPicker();

    expect(await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 1' })).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('서버가 응답하지 못했어요.');
    expect(alert).toHaveTextContent('목록에서 직접 골라 주세요');
    expect(within(allSection()).getAllByText('겨울 풋살컵').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '다시 확인하기' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('후보가 8곳을 넘으면 읽지 못한 곳이 있으므로 바로 열지 않는다', async () => {
    const many = Array.from({ length: 9 }, (_, i) => tournament(`t-many-${i}`, `동시 대회 ${i}`, 'in_progress', kst('2026-12-20', '09:00')));
    tournamentRows = many;
    boards = Object.fromEntries(many.map((row) => [row.id, [kst('2026-12-20', '10:00')]]));
    boards['l-active'] = [];
    renderPicker();

    expect(await screen.findByText(/오늘 경기를 확인하는 대회·리그는 8곳까지예요/)).toBeInTheDocument();
    expect(boardReads.filter((id) => id.startsWith('t-many-'))).toHaveLength(8);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('진행 중 대회가 8곳을 넘어도 기간이 오늘을 덮는 리그가 후보에서 밀려나지 않는다', async () => {
    // 끝난 지 오래인 진행 중 대회 8곳이 리그보다 늦게 시작했다 — 시작 최신순만으로 자르면 리그가 밀려난다.
    const stale = Array.from({ length: 8 }, (_, i) => tournament(`t-stale-${i}`, `지난 대회 ${i}`, 'in_progress', kst('2026-12-10', '09:00'), kst('2026-12-11', '18:00')));
    tournamentRows = stale;
    boards = { 'l-active': [kst('2026-12-20', '11:00')], ...Object.fromEntries(stale.map((row) => [row.id, [kst('2026-12-10', '10:00')]])) };
    renderPicker();

    await waitFor(() => expect(boardReads).toContain('l-active'));
    await waitFor(() => expect(within(todaySection()).getAllByText('마포 주말 리그').length).toBeGreaterThan(0));
  });

  it('목록이 다 도착하기 전에는 후보 보드를 읽지 않는다 — 도착할 때마다 후보가 바뀌어 다시 읽지 않게', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    holdListFor = { status: 'in_progress', release, gate };
    renderPicker();

    await waitFor(() => expect(listRequests.some((p) => p.get('status') === 'in_progress')).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(boardReads).toEqual([]);

    release();
    await waitFor(() => expect(boardReads.length).toBeGreaterThan(0));
  });

  it('이름 검색이 실패하면 「찾는 대회·리그가 없어요」가 아니라 검색을 못 마쳤다고 알린다', async () => {
    failSearch = true;
    const user = userEvent.setup();
    renderPicker();
    await screen.findByRole('region', { name: /^전체/ });

    await user.type(screen.getByRole('searchbox', { name: '대회·리그 이름으로 찾기' }), '없는이름');

    expect(await screen.findByText('이름 검색을 마치지 못했어요. 지금 보이는 목록 안에서만 찾았어요.')).toBeInTheDocument();
  });

  it('표 머리는 실제 첫 경기가 아니라 대회·리그의 시작 일정이라고 말한다', async () => {
    renderPicker();

    expect((await screen.findAllByText('시작 일정')).length).toBeGreaterThan(0);
    expect(screen.queryByText('첫 경기')).not.toBeInTheDocument();
  });

  it('이름 검색이 두 묶음을 모두 거른다', async () => {
    boards['l-active'] = [kst('2026-12-20', '11:00')];
    const user = userEvent.setup();
    renderPicker();
    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 2' });

    await user.type(screen.getByRole('searchbox', { name: '대회·리그 이름으로 찾기' }), '마포');

    expect(within(todaySection()).queryByText('겨울 풋살컵')).not.toBeInTheDocument();
    expect(within(todaySection()).getAllByText('마포 주말 리그').length).toBeGreaterThan(0);
    expect(within(allSection()).queryByText('장기 대회')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^전체 1/ })).toBeInTheDocument();
  });

  it('행마다 종류 칩(대회/리그)이 붙고 리그 상태는 시즌 진행 중으로 읽힌다', async () => {
    boards['l-active'] = [kst('2026-12-20', '11:00')];
    renderPicker();
    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 2' });

    const table = within(allSection()).getAllByRole('table')[0];
    const leagueRow = within(table).getByText('마포 주말 리그').closest('tr') as HTMLElement;
    const tournamentRow = within(table).getByText('겨울 풋살컵').closest('tr') as HTMLElement;
    expect(within(leagueRow).getByText('리그')).toBeInTheDocument();
    expect(within(tournamentRow).getByText('대회')).toBeInTheDocument();
    expect(within(leagueRow).getByText('시즌 진행 중')).toBeInTheDocument();
  });

  it('일정이 가까운 순서(최근 시작이 위)로 섞어 보여준다', async () => {
    renderPicker();
    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 1' });

    const table = within(allSection()).getAllByRole('table')[0];
    const titles = within(table).getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
    expect(titles[0]).toContain('봄 풋살컵');
    expect(titles[1]).toContain('겨울 풋살컵');
  });

  it('리그 목록만 실패해도 조용히 빼지 않고 오류를 보여준다', async () => {
    vi.mocked(useV1AdminLeagueMatchList).mockReturnValue({
      data: undefined, isPending: false, isError: true, error: new Error('boom'), refetch: vi.fn(),
    } as never);
    renderPicker();

    expect(await screen.findByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
    expect(linkTargets(/운영 보드 열기/)).toEqual([]);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('진행 중 대회 목록을 못 읽으면 후보를 알 수 없으므로 오류를 보여주고 열지 않는다', async () => {
    failListFor = 'in_progress';
    renderPicker();

    expect(await screen.findByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
    expect(linkTargets(/운영 보드 열기/)).toEqual([]);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
