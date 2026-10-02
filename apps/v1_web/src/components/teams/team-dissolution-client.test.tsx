/**
 * 팀 해체 화면(Task 180 H3 A-2·A-3) — 실제 훅이 MSW 상태형 서버에 보내는 요청과 그 결과 화면을 본다.
 * 팀 이름을 그대로 입력해야 버튼이 켜지는지, 막는 조건마다 정리하러 갈 링크가 있는지, 점검과 해체 사이에
 * 막는 조건이 생기면 막힘 화면으로 바뀌는지, 팀장이 아니면 들어올 수 없는지.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TeamDissolutionBlocker } from '@/types/api';
import {
  createV1TeamDissolutionMswHandlers,
  TEAM_DISSOLUTION_MSW,
  teamDissolutionPreview,
} from '@/test/msw/team-dissolution-handlers';
import { TeamDissolutionPageClient } from './team-dissolution-client';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ from: '/teams/team-dissolve-1/members' }),
  useRouter: () => router,
  usePathname: () => '/teams/team-dissolve-1/dissolve',
}));

const { teamId, teamName } = TEAM_DISSOLUTION_MSW;
const DISSOLVE = `/api/v1/teams/${teamId}/dissolve`;

const BLOCKERS: V1TeamDissolutionBlocker[] = [
  {
    kind: 'matched_team_match',
    items: [{ id: 'tm-1', title: 'QA0929 마포 FC 친선', opponentName: '합정 유나이티드', startAt: '2099-10-03T11:00:00.000Z', placeName: '망원 유수지 풋살장', registrationStatus: null, route: '/team-matches/tm-1' }],
  },
  {
    kind: 'league_entry',
    items: [{ id: 'reg-1', title: '(QA0929) 마포 주말 리그', opponentName: null, startAt: null, placeName: null, registrationStatus: 'confirmed', route: '/tournaments/league-1/my' }],
  },
  {
    kind: 'live_game',
    items: [{ id: 'game-1', title: '진행 중인 경기', opponentName: null, startAt: null, placeName: null, registrationStatus: null, route: null }],
  },
];

let server: ReturnType<typeof setupServer>;
let mock: ReturnType<typeof createV1TeamDissolutionMswHandlers>;

function start(init: Parameters<typeof createV1TeamDissolutionMswHandlers>[0] = {}, ...overrides: Parameters<typeof setupServer>) {
  mock = createV1TeamDissolutionMswHandlers(init);
  server = setupServer(...overrides, ...mock.handlers, http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
  server.listen({ onUnhandledRequest: 'error' });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.clearAllMocks();
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamDissolutionPageClient teamId={teamId} />
    </QueryClientProvider>,
  );
}

function dissolveBodies() {
  return mock.state.requests.filter((r) => r.method === 'POST' && r.path === DISSOLVE).map((r) => r.body);
}

describe('팀 해체 — 점검을 통과한 팀(A-2)', () => {
  it('정리될 것·남는 것을 보여 주고, 팀 이름을 그대로 입력해야 버튼이 켜진다', async () => {
    start();
    renderPage();

    expect(await screen.findByRole('heading', { name: /해체할까요\?$/ })).toHaveTextContent(`${teamName} 팀을`);
    const cleanup = within(screen.getByRole('region', { name: '함께 정리돼요' }));
    expect(cleanup.getByText('모집 중인 팀매치 1건 취소')).toBeInTheDocument();
    expect(cleanup.getByText('가입 신청 2건 · 보낸 초대 1건 종료')).toBeInTheDocument();
    expect(cleanup.getByText('예정된 팀 일정 1건 취소')).toBeInTheDocument();
    expect(cleanup.getByText('팀 채팅방 닫힘')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '그대로 남아요' })).getByText('지난 경기 결과와 팀 전적')).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: '팀 해체하기' });
    const input = screen.getByLabelText('팀 이름을 입력하면 해체할 수 있어요');
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: 'QA0929 팀관리' } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: `  ${teamName} ` } });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/teams/${teamId}?from=%2Fmy%2Fteams`));
    expect(dissolveBodies()).toEqual([{ confirmTeamName: teamName }]);
  });

  it('취소는 들어온 화면(멤버 관리)으로 돌아간다', async () => {
    start();
    renderPage();
    expect(await screen.findByRole('link', { name: '취소' })).toHaveAttribute('href', '/teams/team-dissolve-1/members');
  });

  it('점검 뒤 막는 조건이 생기면 해체되지 않고 막힘 화면과 이유로 바뀐다', async () => {
    start({ blockersAppearOnDissolve: BLOCKERS.slice(0, 1) });
    renderPage();

    fireEvent.change(await screen.findByLabelText('팀 이름을 입력하면 해체할 수 있어요'), { target: { value: teamName } });
    fireEvent.click(screen.getByRole('button', { name: '팀 해체하기' }));

    expect(await screen.findByRole('heading', { name: '지금은 해체할 수 없어요' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('그사이 먼저 정리할 것이 생겼어요');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('팀 해체 — 막는 조건이 남은 팀(A-3)', () => {
  it('항목마다 이유와 정리하러 갈 링크를 주고, 해체 버튼은 꺼져 있다', async () => {
    start({ preview: teamDissolutionPreview({ canDissolve: false, blockers: BLOCKERS }) });
    renderPage();

    expect(await screen.findByRole('heading', { name: '지금은 해체할 수 없어요' })).toBeInTheDocument();
    expect(screen.getByText('아래 3가지를 먼저 정리해 주세요. 정리하고 나면 바로 해체할 수 있어요.')).toBeInTheDocument();
    const list = within(screen.getByRole('list', { name: '해체를 막는 조건' }));
    expect(list.getByText('상대가 정해진 팀매치 1건')).toBeInTheDocument();
    // W4-V9: 일시와 장소도 앞 항목들처럼 " · "로 나눈다.
    expect(list.getByText('QA0929 마포 FC 친선 · vs 합정 유나이티드 · 10/3 (토) 20:00 · 망원 유수지 풋살장')).toBeInTheDocument();
    expect(list.getByRole('link', { name: '경기 취소하러 가기' })).toHaveAttribute('href', '/team-matches/tm-1');
    expect(list.getByText('참가 중인 리그 1건')).toBeInTheDocument();
    expect(list.getByRole('link', { name: '참가 취소 요청하기' })).toHaveAttribute('href', '/tournaments/league-1/my');
    // 갈 화면이 없는 항목은 버튼 대신 문의 안내 — 죽은 링크를 만들지 않는다.
    expect(list.getByText('진행 중인 경기 1건')).toBeInTheDocument();
    expect(list.getAllByRole('link')).toHaveLength(2);
    expect(list.getByText('이 항목은 운영팀에 문의해 정리해 주세요.')).toBeInTheDocument();

    expect(screen.getByText(/막지 않는 것: 모집 중인 팀매치 1건, 가입 신청 2건, 보낸 초대 1건, 예정 팀 일정 1건은/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '팀 해체하기' })).toBeDisabled();
    expect(screen.queryByLabelText('팀 이름을 입력하면 해체할 수 있어요')).not.toBeInTheDocument();
    expect(dissolveBodies()).toEqual([]);
  });
});

describe('팀 해체 — 권한', () => {
  it('팀장이 아니면(서버 403) 해체 화면 대신 팀장만 할 수 있다는 안내를 준다', async () => {
    start(
      {},
      http.get('*/api/v1/teams/:teamId/dissolution-preview', () =>
        HttpResponse.json(
          { status: 'error', statusCode: 403, code: 'PERMISSION_DENIED', message: '팀장만 팀을 해체하거나 복구할 수 있어요.', timestamp: '2026-10-01T00:00:00.000Z' },
          { status: 403 },
        ),
      ),
    );
    renderPage();

    expect(await screen.findByText('팀장만 팀을 해체할 수 있어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀으로 돌아가기' })).toHaveAttribute('href', `/teams/${teamId}`);
    expect(screen.queryByRole('button', { name: '팀 해체하기' })).not.toBeInTheDocument();
  });
});
