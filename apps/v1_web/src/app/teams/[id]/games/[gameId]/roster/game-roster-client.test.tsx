/**
 * 경기 명단 화면(Task 179 ②④) — 실제 훅이 MSW 상태형 서버에 보내는 요청과 그 결과 화면을 본다.
 * 권한별로 무엇이 보이는지, 저장이 어떤 일괄 요청으로 나가는지, 시작 후·마감 충돌에서 읽기 전용이 되는지.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { GameRosterClient } from './game-roster-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teams/team-1/games/roster-game-1/roster',
}));

const { teamId } = GAME_ROSTER_MSW;
const [G1] = GAME_ROSTER_MSW.games;
const BATCH = `/api/v1/teams/${teamId}/game-rosters/batch`;
const ROSTER = `/api/v1/teams/${teamId}/games/${G1.gameId}/roster`;
const HISTORY = `/api/v1/games/${G1.gameId}/sides/${G1.sideId}/roster-adjustments`;

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  mock = createV1GameRosterMswHandlers();
  // 다가오는 경기·경기 조회 핸들러는 두지 않는다 — 사이드를 따로 찾으러 가면 onUnhandledRequest 로 실패한다.
  server = setupServer(...mock.handlers, http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

function renderScreen(screenTeamId: string = teamId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GameRosterClient teamId={screenTeamId} gameId={G1.gameId} />
    </QueryClientProvider>,
  );
}

const getPaths = () => mock.requests.filter((r) => r.method === 'GET').map((r) => r.path);

function batchBodies() {
  return mock.requests.filter((r) => r.method === 'POST' && r.path === BATCH).map((r) => r.body);
}

function section(title: RegExp) {
  return screen.getByRole('heading', { name: title }).closest('.tm-card') as HTMLElement;
}

describe('팀장 — 모아서 저장', () => {
  it('체크를 풀고 사유를 고르면 저장할 때 한 번의 일괄 요청으로 빠지고, 빠짐 섹션으로 옮겨진다', async () => {
    renderScreen();
    expect(await screen.findByRole('heading', { name: '출전 3명' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `vs ${G1.opponentName}` })).toBeInTheDocument();
    expect(screen.getByText('수정 가능')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: '저장' });
    expect(save).toBeDisabled();
    expect(within(section(/출전 3명/)).getByText(/^체크를 풀면 이번 경기에서 빠져요\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '박서준 이번 경기 출전' }));
    expect(screen.getByRole('heading', { name: '출전 2명' })).toBeInTheDocument();
    const chips = screen.getByRole('group', { name: '박서준 빠지는 사유(선택)' });
    fireEvent.click(within(chips).getByRole('button', { name: '부상' }));
    expect(within(chips).getByRole('button', { name: '부상' })).toHaveAttribute('aria-pressed', 'true');
    expect(batchBodies()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '저장 (1건)' }));

    await screen.findByText('명단을 저장했어요.');
    expect(batchBodies()).toEqual([
      { changes: [{ gameId: G1.gameId, userId: 'player-2', op: 'EXCLUDE', reason: 'INJURY' }] },
    ]);
    const excluded = await waitFor(() => section(/이번 경기 빠짐 1명/));
    expect(within(excluded).getByText('박서준')).toBeInTheDocument();
    expect(within(excluded).getByText('빠짐 · 부상')).toBeInTheDocument();
    expect(within(excluded).getByText('팀장 처리')).toBeInTheDocument();
  });

  it('사유를 고르지 않아도 빠지고, 다시 체크하면 요청할 변경이 사라진다', async () => {
    renderScreen();
    const box = await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: '김민재 이번 경기 출전' }));
    fireEvent.click(screen.getByRole('button', { name: '저장 (1건)' }));
    await screen.findByText('명단을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G1.gameId, userId: 'player-1', op: 'EXCLUDE' }] }]);
  });

  it('빠진 선수를 되돌리면 REVOKE 로 저장되고 출전으로 돌아온다', async () => {
    mock.excludeAsTeamManager(G1.gameId, 'player-1', 'PERSONAL');
    renderScreen();
    await screen.findByRole('heading', { name: '이번 경기 빠짐 1명' });
    fireEvent.click(screen.getByRole('button', { name: '김민재 출전으로 되돌리기' }));
    expect(screen.getByText(/저장하면 출전으로 돌아가요/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '출전 3명' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '저장 (1건)' }));
    await screen.findByText('명단을 저장했어요.');
    expect(batchBodies()).toEqual([{ changes: [{ gameId: G1.gameId, userId: 'player-1', op: 'REVOKE' }] }]);
    await waitFor(() => expect(screen.queryByRole('heading', { name: /이번 경기 빠짐/ })).toBeNull());
    expect(screen.getByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeChecked();
  });

  it('"참가 명단대로"는 확인한 뒤에만 빠진 사람 전원을 되돌린다', async () => {
    mock.excludeAsTeamManager(G1.gameId, 'player-1', null);
    mock.excludeAsTeamManager(G1.gameId, 'player-2', 'INJURY');
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: '참가 명단대로' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/뺀 2명을 모두 출전으로 되돌려요/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(batchBodies()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '참가 명단대로' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '되돌리기' }));
    await screen.findByText('참가 명단대로 되돌렸어요.');
    expect(batchBodies()).toEqual([
      {
        changes: [
          { gameId: G1.gameId, userId: 'player-1', op: 'REVOKE' },
          { gameId: G1.gameId, userId: 'player-2', op: 'REVOKE' },
        ],
      },
    ]);
  });

  it('저장 직전에 경기가 시작돼 409 가 오면 안내하고 읽기 전용으로 다시 불러온다', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('checkbox', { name: '박서준 이번 경기 출전' }));
    mock.setGameState(G1.gameId, 'LIVE');
    fireEvent.click(screen.getByRole('button', { name: '저장 (1건)' }));

    expect(await screen.findByText(/경기가 시작돼서 명단을 바꿀 수 없어요/)).toBeInTheDocument();
    await screen.findByText('경기 시작됨');
    expect(screen.queryByRole('button', { name: /저장/ })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('열어 둔 사이 바뀐 서버 상태', () => {
  it('저장할 때 권한이 없어졌으면(403) 명단을 다시 받아 읽기 전용으로 바꾼다', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('checkbox', { name: '박서준 이번 경기 출전' }));
    mock.setCanWrite(false);
    const rosterGets = () => mock.requests.filter((r) => r.method === 'GET' && r.path.endsWith('/roster')).length;
    const before = rosterGets();

    fireEvent.click(screen.getByRole('button', { name: '저장 (1건)' }));
    expect(await screen.findByText('팀장·매니저만 경기 명단을 바꿀 수 있어요.')).toBeInTheDocument();
    await waitFor(() => expect(rosterGets()).toBe(before + 1));
    expect(await screen.findByText('보기 전용')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /저장/ })).toBeNull();
  });
});

describe('읽기 전용', () => {
  it('팀원에게는 편집 조작이 없고 팀장에게 알리라고 안내한다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    renderScreen();
    await screen.findByRole('heading', { name: '출전 3명' });
    expect(screen.getByText('보기 전용')).toBeInTheDocument();
    expect(screen.getByText(/명단은 팀장·매니저가 바꿀 수 있어요/)).toBeInTheDocument();
    // 머리 문구도 팀원이 바꿀 수 있는 것처럼 말하지 않는다.
    expect(screen.getByText(/시작 전까지 명단이 바뀔 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/시작 전까지 바꿀 수 있어요/)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /저장|참가 명단대로/ })).toBeNull();
    expect(screen.getByText('7 김민재')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '우리 팀 다른 경기' })).toHaveAttribute(
      'href',
      `/teams/${teamId}#team-upcoming-games`,
    );
  });

  it('운영자에게는 "우리 팀 다른 경기" 링크를 보이지 않는다(그 팀 화면에 다가오는 경기가 없다)', async () => {
    mock.setViewerRole('ADMIN');
    renderScreen();
    await screen.findByRole('heading', { name: '출전 3명' });
    expect(screen.getByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '우리 팀 다른 경기' })).toBeNull();
  });

  it('시작 후에는 변경 기록을 먼저 펼쳐 누가 무엇을 바꿨는지 보여 준다', async () => {
    mock.excludeAsTeamManager(G1.gameId, 'player-2', 'INJURY');
    mock.setGameState(G1.gameId, 'LIVE');
    renderScreen();
    await screen.findByText('경기 시작됨');
    expect(screen.getByText(/현장 변동은 운영진에게 알려 주세요/)).toBeInTheDocument();
    const history = section(/변경 기록/);
    expect(await within(history).findByText('박서준 빠짐 · 부상')).toBeInTheDocument();
    expect(within(history).getByText(/팀장 김팀장$/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /되돌리기/ })).toBeNull();
  });
});

describe('자동으로 빠지거나 들어온 선수', () => {
  it('출전정지는 사유·남은 경기와 함께 따로 보이고 되돌릴 조작이 없다', async () => {
    mock.suspend('player-3', '퇴장 1회', 1);
    renderScreen();
    await screen.findByRole('heading', { name: '출전정지 1명' });
    const suspended = section(/출전정지 1명/);
    expect(within(suspended).getByText('한도윤')).toBeInTheDocument();
    expect(within(suspended).getByText('출전정지 1경기')).toBeInTheDocument();
    expect(within(suspended).getByText(/퇴장 1회/)).toBeInTheDocument();
    expect(within(suspended).queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { name: '출전 2명' })).toBeInTheDocument();
  });

  it('참가 명단에 새로 추가돼 들어온 선수를 알린다', async () => {
    mock.markJoinedAfterFixture('player-3');
    renderScreen();
    expect(
      await screen.findByText('한도윤 선수가 참가 명단에 추가돼 이 경기 출전에 들어갔어요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('새로 추가')).toBeInTheDocument();
  });

  it('결장 선수는 기간을 보이고 여기서 바꿀 수 없다고 안내한다', async () => {
    // 끝은 미포함 — 10/5 00:00 KST 종료는 10/4 까지로 보인다.
    mock.markUnavailable('player-1', '2026-09-30T15:00:00.000Z', '2026-10-04T15:00:00.000Z', 'INJURY');
    renderScreen();
    await screen.findByRole('heading', { name: '결장 1명' });
    const unavailable = section(/결장 1명/);
    expect(within(unavailable).getByText('결장 · 부상')).toBeInTheDocument();
    expect(within(unavailable).getByText(/10\/1 \(목\)~10\/4 \(일\) 결장/)).toBeInTheDocument();
    expect(within(unavailable).getByText(/여기서 바꿀 수 없고/)).toBeInTheDocument();
    expect(within(unavailable).queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { name: '출전 2명' })).toBeInTheDocument();
  });
});

describe('권한별 — 팀·경기 명단 한 번의 조회로 연다', () => {
  it('팀장은 편집 화면으로 열리고, 사이드를 따로 찾지 않는다', async () => {
    renderScreen();
    expect(await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeInTheDocument();
    await waitFor(() => expect(getPaths()).toEqual([ROSTER, HISTORY]));
  });

  it('대회 일반 팀원은 시작된 경기도 읽기 전용으로 본다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    mock.setGameState(G1.gameId, 'LIVE');
    renderScreen();
    expect(await screen.findByText('경기 시작됨')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `vs ${G1.opponentName}` })).toBeInTheDocument();
    expect(screen.getByText('7 김민재')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /저장|참가 명단대로|되돌리기/ })).toBeNull();
    await waitFor(() => expect(getPaths()).toEqual([ROSTER, HISTORY]));
  });

  it('지원(support) 어드민은 보기만 한다', async () => {
    mock.setViewerRole('ADMIN');
    mock.setCanWrite(false);
    renderScreen();
    expect(await screen.findByText('보기 전용')).toBeInTheDocument();
    expect(screen.getByText('이 명단은 볼 수만 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /저장/ })).toBeNull();
    expect(screen.queryByRole('link', { name: '우리 팀 다른 경기' })).toBeNull();
  });

  it.each(['ADMIN', 'STAFF'] as const)('운영자(%s)는 팀원이 아니어도 편집한다', async (role) => {
    mock.setViewerRole(role);
    renderScreen();
    expect(await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeInTheDocument();
    expect(screen.getByText('수정 가능')).toBeInTheDocument();
  });

  it('이 팀이 뛰지 않는 경기(404)는 경기 명단이 없다고 안내하고 변경 기록을 부르지 않는다', async () => {
    renderScreen('team-2');
    expect(await screen.findByText('이 경기는 경기 명단이 없어요')).toBeInTheDocument();
    expect(screen.getByText(/친선 경기는 참석명단에서 출전 선수를 정해요/)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getPaths()).toEqual([`/api/v1/teams/team-2/games/${G1.gameId}/roster`]);
  });
});

describe('참가 명단으로 가는 한 줄(Task 180 R-1 C)', () => {
  const FROM = encodeURIComponent('/teams/team-1/games/roster-game-1/roster');

  it('팀장에게 출전 목록 끝에서 그 신청의 참가 명단 화면으로 바로 가는 길을 준다', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: '출전 3명' });
    const outing = section(/출전 3명/);
    const link = within(outing).getByRole('link', { name: '참가 명단에서 선수 추가·빼기' });
    expect(link).toHaveAttribute(
      'href',
      `/tournaments/${GAME_ROSTER_MSW.tournamentId}/registrations/${GAME_ROSTER_MSW.registrationId}/roster?from=${FROM}`,
    );
    expect(within(outing).getByText(/대회 참가 명단에서 바꿔요\. 바꾸면 시작 전 경기에 모두 반영돼요\./)).toBeInTheDocument();
  });

  it('참가 명단이 없는 팀(팀원 전체 기준)은 내 신청 화면에서 명단을 내러 간다', async () => {
    mock.useTeamMembersFallback();
    renderScreen();
    const link = await screen.findByRole('link', { name: '참가 명단 내러 가기' });
    expect(link).toHaveAttribute('href', `/tournaments/${GAME_ROSTER_MSW.tournamentId}/my?from=${FROM}`);
    expect(screen.queryByRole('link', { name: '참가 명단에서 선수 추가·빼기' })).toBeNull();
  });

  it.each(['TEAM_MEMBER', 'ADMIN'] as const)('%s 에게는 보이지 않는다 — 참가 명단은 팀장·매니저가 고친다', async (role) => {
    mock.setViewerRole(role);
    renderScreen();
    await screen.findByRole('heading', { name: '출전 3명' });
    expect(screen.queryByRole('link', { name: /참가 명단/ })).toBeNull();
  });
});

describe('#1538 리그 전체 상태에 맞는 실제 명단 화면 entry', () => {
  function leagueStatus(status: string, responseStatus = 200) {
    mock.setCompetitionKind('LEAGUE');
    server.use(http.get('*/api/v1/tournaments/:id', () => HttpResponse.json(
      responseStatus === 200
        ? { status: 'success', data: { id: GAME_ROSTER_MSW.tournamentId, kind: 'regular_league', status } }
        : { status: 'error', statusCode: responseStatus, code: 'FORBIDDEN', message: '조회할 수 없어요.' },
      { status: responseStatus },
    )));
  }
  const readonlyName = '참가 명단 보기';
  const editName = '참가 명단에서 선수 추가·빼기';

  it('완료 리그의 종료 경기에서도 조회 링크/설명과 기존 중첩 from을 유지한다', async () => {
    leagueStatus('completed');
    mock.setGameState(G1.gameId, 'ENDED');
    renderScreen();
    const link = await screen.findByRole('link', { name: readonlyName });
    expect(link).toHaveAttribute('href', `/tournaments/${GAME_ROSTER_MSW.tournamentId}/registrations/${GAME_ROSTER_MSW.registrationId}/roster?from=${encodeURIComponent('/teams/team-1/games/roster-game-1/roster')}`);
    expect(screen.getByText('종료된 리그의 참가 명단은 조회만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: editName })).not.toBeInTheDocument();
    expect(screen.queryByText(/바꾸면 시작 전 경기에 모두 반영/)).not.toBeInTheDocument();
    expect(batchBodies()).toHaveLength(0);
  });

  it.each(['SCHEDULED', 'LIVE', 'ENDED'] as const)('진행 리그의 개별 %s 경기는 참가 명단 편집 안내를 유지한다', async (gameState) => {
    leagueStatus('in_progress');
    mock.setGameState(G1.gameId, gameState);
    renderScreen();
    expect(await screen.findByRole('link', { name: editName })).toBeInTheDocument();
    expect(screen.getByText(/리그 참가 명단에서 바꿔요/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: readonlyName })).not.toBeInTheDocument();
    expect(batchBodies()).toHaveLength(0);
  });

  it.each(['draft', 'open', 'closed'])('목적지가 허용하는 리그 %s도 경기 종료만으로 막지 않는다', async (status) => {
    leagueStatus(status);
    mock.setGameState(G1.gameId, 'ENDED');
    renderScreen();
    expect(await screen.findByRole('link', { name: editName })).toBeInTheDocument();
  });

  it('리그 상태를 받기 전에는 편집을 약속하지 않고 완료 응답 후 조회 안내로 바꾼다', async () => {
    mock.setCompetitionKind('LEAGUE');
    mock.setGameState(G1.gameId, 'ENDED');
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.get('*/api/v1/tournaments/:id', async () => {
      await pending;
      return HttpResponse.json({ status: 'success', data: { id: GAME_ROSTER_MSW.tournamentId, kind: 'regular_league', status: 'completed' } });
    }));
    renderScreen();
    try {
      expect(await screen.findByText('리그 상태를 확인하고 있어요. 참가 명단 화면에서 확인해 주세요.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '참가 명단 확인' })).toHaveAttribute('href', expect.stringContaining('/roster?from='));
      expect(screen.queryByRole('link', { name: editName })).not.toBeInTheDocument();
      expect(batchBodies()).toHaveLength(0);
    } finally {
      release();
    }
    expect(await screen.findByRole('link', { name: '참가 명단 보기' })).toBeInTheDocument();
    expect(screen.getByText('종료된 리그의 참가 명단은 조회만 할 수 있어요.')).toBeInTheDocument();
    expect(batchBodies()).toHaveLength(0);
  });

  it('리그 상태 조회 실패는 편집 성공을 가정하지 않고 확인 링크를 유지한다', async () => {
    leagueStatus('draft', 403);
    renderScreen();
    expect(await screen.findByText('리그 상태를 불러오지 못했어요. 조회할 수 없어요. 참가 명단 화면에서 확인해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '참가 명단 확인' })).toHaveAttribute('href', expect.stringContaining('/roster?from='));
    expect(screen.queryByRole('link', { name: editName })).not.toBeInTheDocument();
    expect(batchBodies()).toHaveLength(0);
  });

  it('완료 리그에 신청 명단이 없으면 기존 신청 허브를 조회로 안내한다', async () => {
    leagueStatus('completed');
    mock.useTeamMembersFallback();
    mock.setGameState(G1.gameId, 'ENDED');
    renderScreen();
    expect(await screen.findByRole('link', { name: '신청 내역 보기' })).toHaveAttribute('href', `/tournaments/${GAME_ROSTER_MSW.tournamentId}/my?from=${encodeURIComponent('/teams/team-1/games/roster-game-1/roster')}`);
    expect(screen.queryByRole('link', { name: '참가 명단 내러 가기' })).not.toBeInTheDocument();
  });
});
