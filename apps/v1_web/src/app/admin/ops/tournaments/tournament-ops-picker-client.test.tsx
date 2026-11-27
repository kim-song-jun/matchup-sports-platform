import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1AdminLeagueMatchList, useV1AdminTournaments } from '@/hooks/use-v1-api';
import { TournamentOpsPickerClient, coversToday } from './tournament-ops-picker-client';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournaments: vi.fn(),
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

const TODAY_TOURNAMENT = tournament('t-today', '겨울 풋살컵', 'in_progress', kst('2026-12-20', '09:00'));
const OPEN_TOURNAMENT = tournament('t-open', '봄 풋살컵', 'open', kst('2027-03-01', '10:00'));
const SPAN_TOURNAMENT = tournament('t-span', '장기 대회', 'in_progress', kst('2026-12-18', '09:00'), kst('2026-12-22', '18:00'));
const DRAFT_TOURNAMENT = tournament('t-draft', '초안 대회', 'draft', kst('2026-12-20', '09:00'));
const ACTIVE_LEAGUE = league('l-active', '마포 주말 리그', 'active', '2026-09-30T00:00:00.000Z', '2027-03-01T00:00:00.000Z');
const DRAFT_LEAGUE = league('l-draft', '준비 중 리그', 'draft', '2026-11-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z');

type Boards = Record<string, string[] | 'error'>;
let boards: Boards;
const boardReads: string[] = [];

const server = setupServer(
  http.get('*/api/v1/tournament-ops/tournaments/:id/operations', ({ params }) => {
    const id = String(params.id);
    boardReads.push(id);
    const entry = boards[id];
    if (entry === 'error' || entry === undefined) {
      return HttpResponse.json({ status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: 'boom' }, { status: 500 });
    }
    return HttpResponse.json({
      status: 'success',
      timestamp: 't',
      data: { items: entry.map((at, i) => ({ fixtureId: `${id}-${i}`, scheduledAt: at })), nextCursor: null, watermark: 'w', liveWarnings: [] },
    });
  }),
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', timestamp: 't', data: null })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function mockLists(tournaments: unknown[], leagues: unknown[]) {
  vi.mocked(useV1AdminTournaments).mockReturnValue({
    data: { items: tournaments, pageInfo: undefined, summary: { total: tournaments.length, byStatus: {} } },
    isPending: false, isError: false, error: null, refetch: vi.fn(),
  } as never);
  vi.mocked(useV1AdminLeagueMatchList).mockReturnValue({
    data: { items: leagues }, isPending: false, isError: false, error: null, refetch: vi.fn(),
  } as never);
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.search = '';
  boardReads.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(kst('2026-12-20', '12:00')));
  boards = { 't-today': [kst('2026-12-20', '10:00')], 't-span': [kst('2026-12-19', '10:00'), kst('2026-12-21', '10:00')], 'l-active': [] };
  mockLists([TODAY_TOURNAMENT, OPEN_TOURNAMENT, SPAN_TOURNAMENT, DRAFT_TOURNAMENT], [ACTIVE_LEAGUE, DRAFT_LEAGUE]);
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

  it('오늘 경기가 있는 곳이 하나뿐이면 그 운영 보드를 바로 연다', async () => {
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

  it('후보 하나의 보드를 못 읽어도 화면 오류가 아니고, 그 행은 전체에 남는다', async () => {
    boards['t-today'] = 'error';
    boards['l-active'] = [kst('2026-12-20', '11:00')];
    renderPicker();

    await screen.findByRole('region', { name: '오늘 경기 있는 대회·리그 1' });
    expect(screen.queryByRole('button', { name: '다시 시도하기' })).not.toBeInTheDocument();
    expect(within(allSection()).getAllByText('겨울 풋살컵').length).toBeGreaterThan(0);
    // 판정이 끝나면 읽은 곳(리그) 하나만 오늘이다.
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/admin/live/l-active/operations'));
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
});
