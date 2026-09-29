/**
 * 어드민 참가 신청 "경기별 명단"(Task 178 어드민) — 실제 훅이 MSW 상태형 서버에 보내는 요청과 그 결과 표를 본다.
 * 칸 토글이 어떤 일괄 요청이 되는지, 운영자 기록이 어떻게 보이는지, 누가 결장 기간을 등록할 수 있는지.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { AdminRegistrationGameRosters } from './admin-registration-game-rosters';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/tournaments/tournament-1/registrations',
}));

const { teamId, tournamentId, registrationId } = GAME_ROSTER_MSW;
const [G1, G2] = GAME_ROSTER_MSW.games;
const NOW = '2026-10-01T00:00:00.000Z';
const BATCH = `/api/v1/teams/${teamId}/game-rosters/batch`;

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
let adminRole: 'owner' | 'ops' | 'support';
let adminMeCalls: number;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  adminRole = 'ops';
  adminMeCalls = 0;
  mock = createV1GameRosterMswHandlers();
  mock.setViewerRole('ADMIN');
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/admin/me', () => {
      adminMeCalls += 1;
      return HttpResponse.json({
        status: 'success',
        data: { userId: 'admin-1', adminUserId: 'au-1', adminRole, status: 'active', capabilities: [], lastActiveAt: null },
        timestamp: NOW,
      });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminRegistrationGameRosters
        tournamentId={tournamentId}
        registrationId={registrationId}
        teamName="성수 FC"
        correctionHref={`/admin/live/${tournamentId}/records/corrections`}
      />
    </QueryClientProvider>,
  );
}

function batchBodies() {
  return mock.requests.filter((r) => r.method === 'POST' && r.path === BATCH).map((r) => r.body);
}

const cell = (player: string, opponent: string, state: string) =>
  screen.findByRole('button', { name: new RegExp(`^${player} .* vs ${opponent} ${state}, `) });

describe('어드민 경기별 명단 — 칸 토글과 저장', () => {
  it('칸을 누르면 그 경기·그 선수 빠짐이 팀 일괄 요청 한 건이 되고, 표에 "운영자"로 남는다', async () => {
    renderPanel();
    fireEvent.click(await cell('김민재', G1.opponentName, '출전'));
    expect(await cell('김민재', G1.opponentName, '빠짐 · 저장 전')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));

    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G1.gameId, userId: 'player-1', op: 'EXCLUDE' }] }]);
    expect(await cell('김민재', G1.opponentName, '빠짐 · 운영자')).toBeInTheDocument();
    // 다른 경기·다른 선수는 그대로다(좁히는 변경의 대조군).
    expect(await cell('김민재', G2.opponentName, '출전')).toBeInTheDocument();
    expect(await cell('박서준', G1.opponentName, '출전')).toBeInTheDocument();
    expect(screen.getByText('조정 1')).toBeInTheDocument();
  });

  it('빠진 칸을 다시 누르면 되돌리기(REVOKE)로 저장한다', async () => {
    mock.excludeAsTeamManager(G2.gameId, 'player-2', 'INJURY');
    renderPanel();
    fireEvent.click(await cell('박서준', G2.opponentName, '빠짐 · 부상 · 팀장'));
    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));

    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G2.gameId, userId: 'player-2', op: 'REVOKE' }] }]);
    expect(await cell('박서준', G2.opponentName, '출전')).toBeInTheDocument();
  });

  it('시작된 경기 칸은 누를 수 없고, 결과 정정으로 가는 링크를 준다', async () => {
    mock.setGameState(G2.gameId, 'LIVE');
    renderPanel();
    await cell('김민재', G1.opponentName, '출전');
    expect(screen.queryByRole('button', { name: new RegExp(`vs ${G2.opponentName}`) })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '결과 정정' })).toHaveAttribute(
      'href',
      `/admin/live/${tournamentId}/records/corrections`,
    );
  });

  it('결장·출전정지는 계산 결과라 누를 수 없고 글자로 구분된다', async () => {
    mock.suspend('player-3', 'RED_CARD', 1);
    mock.markUnavailable('player-2', '2026-10-03T15:00:00.000Z', '2026-10-05T15:00:00.000Z', 'INJURY');
    renderPanel();
    await cell('김민재', G1.opponentName, '출전');
    expect(screen.getAllByText('출전정지 1경기')).toHaveLength(2);
    expect(screen.getByText('빠짐 · 결장')).toBeInTheDocument();
    expect(screen.getByText('결장 · 부상 · 팀장')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^한도윤 / })).not.toBeInTheDocument();
  });
});

describe('어드민 경기별 명단 — 그사이 시작된 경기(409)', () => {
  it('저장 중 409 면 그 경기 변경만 버리고, 나머지는 다시 저장할 수 있다', async () => {
    renderPanel();
    fireEvent.click(await cell('김민재', G1.opponentName, '출전'));
    fireEvent.click(await cell('박서준', G2.opponentName, '출전'));
    mock.setGameState(G2.gameId, 'LIVE');
    fireEvent.click(screen.getByRole('button', { name: '변경 2건 저장' }));

    expect(
      await screen.findByText('그사이 시작된 경기가 있어 저장하지 못했어요. 그 경기 변경은 뺐으니 나머지를 다시 저장해 주세요.'),
    ).toBeInTheDocument();
    // 다시 받은 표에서 시작된 경기 칸은 더는 누를 수 없다.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: new RegExp(`vs ${G2.opponentName}`) })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));

    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies()).toEqual([
      {
        changes: [
          { gameId: G1.gameId, userId: 'player-1', op: 'EXCLUDE' },
          { gameId: G2.gameId, userId: 'player-2', op: 'EXCLUDE' },
        ],
      },
      { changes: [{ gameId: G1.gameId, userId: 'player-1', op: 'EXCLUDE' }] },
    ]);
  });
});

/** 역할 응답을 받은 뒤에 본다 — 받기 전의 "없음"은 권한 판정이 아니다. */
async function settleAdminMe() {
  await waitFor(() => expect(adminMeCalls).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('어드민 경기별 명단 — 역할별 노출', () => {
  it.each(['owner', 'ops'] as const)('플랫폼 어드민(%s)은 칸을 바꾸고 선수를 골라 결장 기간 시트를 연다', async (role) => {
    adminRole = role;
    renderPanel();
    expect(await cell('김민재', G1.opponentName, '출전')).toBeInTheDocument();
    expect(screen.getByText(/칸을 누르면 그 경기에서 빼거나 되돌려요/)).toBeInTheDocument();
    const open = await screen.findByRole('button', { name: '결장 기간 등록' });
    expect(open).toBeDisabled();
    fireEvent.change(screen.getByLabelText('결장 기간을 등록할 선수'), { target: { value: 'player-2' } });
    fireEvent.click(open);
    expect(await screen.findByRole('dialog', { name: '결장 기간 · 박서준' })).toBeInTheDocument();
  });

  it('지원(support) 계정은 보기만 한다 — 누를 칸·저장·결장 기간 등록이 없다', async () => {
    adminRole = 'support';
    mock.setCanWrite(false);
    renderPanel();
    expect(await screen.findByText(/보기 권한만 있어 명단을 바꿀 수 없어요/)).toBeInTheDocument();
    await settleAdminMe();
    // 표는 그대로 보인다 — 칸이 버튼이 아닐 뿐이다.
    expect(screen.getByRole('row', { name: /김민재/ })).toHaveTextContent('출전');
    expect(screen.queryByRole('button', { name: /^김민재 / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /저장/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결장 기간 등록' })).not.toBeInTheDocument();
  });

  it('대회 스태프는 경기별 조정은 하고(기록엔 운영자), 결장 기간 등록은 없다', async () => {
    mock.setViewerRole('STAFF');
    renderPanel();
    fireEvent.click(await cell('한도윤', G2.opponentName, '출전'));
    fireEvent.click(screen.getByRole('button', { name: '변경 1건 저장' }));

    await screen.findByText('변경 1건을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G2.gameId, userId: 'player-3', op: 'EXCLUDE' }] }]);
    expect(await cell('한도윤', G2.opponentName, '빠짐 · 운영자')).toBeInTheDocument();
    await settleAdminMe();
    expect(screen.queryByRole('button', { name: '결장 기간 등록' })).not.toBeInTheDocument();
  });

  it('명단 권한이 없는 스태프도 보기만 한다', async () => {
    mock.setViewerRole('STAFF');
    mock.setCanWrite(false);
    renderPanel();
    expect(await screen.findByText(/보기 권한만 있어 명단을 바꿀 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^김민재 / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /저장/ })).not.toBeInTheDocument();
  });
});
