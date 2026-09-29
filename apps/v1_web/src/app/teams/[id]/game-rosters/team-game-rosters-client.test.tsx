/**
 * 경기 명단 관리(Task 178 팀 B·C) — 실제 훅이 MSW 상태형 서버에 보내는 요청과 그 결과 화면을 본다.
 * 칩 토글이 어떤 일괄 요청이 되는지, 시작된 경기 409 에서 무엇이 남는지, 결장 기간이 어떤 기간으로 나가는지.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { TeamGameRostersClient } from './team-game-rosters-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teams/team-1/game-rosters',
}));

const { teamId } = GAME_ROSTER_MSW;
const [G1, G2] = GAME_ROSTER_MSW.games;
const NOW = '2026-10-01T00:00:00.000Z';
const BATCH = `/api/v1/teams/${teamId}/game-rosters/batch`;

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  mock = createV1GameRosterMswHandlers();
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({ status: 'success', data: { user: { id: GAME_ROSTER_MSW.viewerUserId } }, timestamp: NOW }),
    ),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamGameRostersClient teamId={teamId} />
    </QueryClientProvider>,
  );
}

async function playerCard(name: string) {
  const group = await screen.findByRole('group', { name: `${name} 경기별 출전` });
  return group.closest('.tm-card') as HTMLElement;
}

function batchBodies() {
  return mock.requests.filter((r) => r.method === 'POST' && r.path === BATCH).map((r) => r.body);
}

describe('경기 명단 관리 — 칩 토글과 일괄 저장', () => {
  it('칩을 누르면 그 경기 빠짐이 한 건 일괄 요청으로 저장되고, 표가 새 상태를 보인다', async () => {
    renderPage();
    const card = within(await playerCard('김민재'));
    expect(card.getByText('전부 출전')).toBeInTheDocument();

    fireEvent.click(card.getByRole('button', { name: /^10\/4 마포 FC 출전, 누르면 빠져요/ }));
    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));

    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G1.gameId, userId: 'player-1', op: 'EXCLUDE' }] }]);
    const after = within(await playerCard('김민재'));
    await waitFor(() => expect(after.getByRole('button', { name: /^10\/4 마포 FC 빠짐, 누르면 출전으로/ })).toBeInTheDocument());
    // 다른 경기·다른 선수는 그대로 출전이다.
    expect(after.getByRole('button', { name: /^10\/11 강남 유나이티드 출전/ })).toBeInTheDocument();
    expect(within(await playerCard('박서준')).getByText('전부 출전')).toBeInTheDocument();
  });

  it('같은 칩을 두 번 누르면 변경이 사라져 저장할 게 없다', async () => {
    renderPage();
    const card = within(await playerCard('김민재'));
    const chip = card.getByRole('button', { name: /^10\/4 마포 FC 출전/ });
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: '변경 1건 저장' })).toBeEnabled();
    fireEvent.click(card.getByRole('button', { name: /^10\/4 마포 FC 빠짐\(저장 전\)/ }));
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('빠진 선수를 되돌리면 REVOKE 로 나간다', async () => {
    mock.excludeAsTeamManager(G2.gameId, 'player-2', 'INJURY');
    renderPage();
    const card = within(await playerCard('박서준'));
    expect(card.getByText('부상 · 1경기 빠짐')).toBeInTheDocument();

    fireEvent.click(card.getByRole('button', { name: /^10\/11 강남 유나이티드 빠짐, 누르면 출전으로/ }));
    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));

    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G2.gameId, userId: 'player-2', op: 'REVOKE' }] }]);
  });

  it('출전정지 선수의 칩은 누를 수 없고 배지로 남은 경기를 보인다', async () => {
    mock.suspend('player-3', '레드카드', 1);
    renderPage();
    const card = within(await playerCard('한도윤'));
    expect(card.getByText('출전정지 1경기')).toBeInTheDocument();
    for (const chip of card.getAllByRole('button', { name: /출전정지/ })) expect(chip).toBeDisabled();
  });

  it('그사이 시작된 경기가 섞이면 409 — 그 경기 변경만 빠지고 나머지를 다시 저장할 수 있다', async () => {
    renderPage();
    const card = within(await playerCard('김민재'));
    fireEvent.click(card.getByRole('button', { name: /^10\/4 마포 FC 출전/ }));
    fireEvent.click(card.getByRole('button', { name: /^10\/11 강남 유나이티드 출전/ }));
    mock.setGameState(G1.gameId, 'LIVE');

    fireEvent.click(screen.getByRole('button', { name: '변경 2건 저장' }));
    await screen.findByText(/그사이 시작된 경기가 있어 저장하지 못했어요/);
    await waitFor(() => expect(screen.getByRole('button', { name: '변경 1건 저장' })).toBeEnabled());
    // 시작된 경기 칩은 이제 누를 수 없다.
    expect(within(await playerCard('김민재')).getByRole('button', { name: /^10\/4 마포 FC 출전/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));
    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies().at(-1)).toEqual({ changes: [{ gameId: G2.gameId, userId: 'player-1', op: 'EXCLUDE' }] });
  });

  it('팀원은 표를 받지 못하고 팀장에게 알리라는 안내를 본다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    renderPage();
    expect(await screen.findByText('팀장·매니저만 볼 수 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /저장/ })).toBeNull();
  });
});

describe('경기 명단 관리 — 결장 기간 시트(팀 C)', () => {
  it('KST 날짜 기간·사유로 등록하고, 영향 경기 수를 미리 알려 주며, 등록 뒤 표가 결장으로 바뀐다', async () => {
    renderPage();
    const card = within(await playerCard('박서준'));
    fireEvent.click(card.getByRole('button', { name: '박서준 결장 기간' }));

    const dialog = within(await screen.findByRole('dialog', { name: '결장 기간 · 박서준' }));
    fireEvent.change(dialog.getByLabelText('시작일'), { target: { value: '2026-10-03' } });
    fireEvent.change(dialog.getByLabelText('마지막 날'), { target: { value: '2026-10-12' } });
    expect(dialog.getByText(/이 기간 대회·리그 경기 2개에서 빠져요/)).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText('마지막 날'), { target: { value: '2026-10-05' } });
    expect(dialog.getByText(/이 기간 대회·리그 경기 1개에서 빠져요/)).toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: '부상' }));
    fireEvent.click(dialog.getByRole('button', { name: '결장 등록' }));

    await dialog.findByText('결장 기간을 등록했어요.');
    const post = mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/members/player-2/unavailability'));
    // 시작일 KST 0시(포함) ~ 마지막 날 다음 KST 0시(미포함).
    expect(post?.body).toEqual({ startsAt: '2026-10-02T15:00:00.000Z', endsAt: '2026-10-05T15:00:00.000Z', reason: 'INJURY' });
    expect(await dialog.findByRole('button', { name: /결장 취소$/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(screen.getByRole('group', { name: '박서준 경기별 출전' })).getByRole('button', { name: /^10\/4 마포 FC 결장/ })).toBeDisabled(),
    );
  });

  it('마지막 날이 시작일보다 앞이면 등록을 막는다', async () => {
    renderPage();
    fireEvent.click(within(await playerCard('김민재')).getByRole('button', { name: '김민재 결장 기간' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('시작일'), { target: { value: '2026-10-10' } });
    fireEvent.change(dialog.getByLabelText('마지막 날'), { target: { value: '2026-10-03' } });
    expect(dialog.getByText('마지막 날은 시작일과 같거나 뒤여야 해요.')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: '결장 등록' })).toBeDisabled();
  });
});
