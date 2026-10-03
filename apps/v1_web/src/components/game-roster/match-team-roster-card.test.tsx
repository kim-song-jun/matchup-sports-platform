/**
 * 경기 상세 "우리 팀 출전" 카드 + 빠른 선택 시트(Task 179 ①③).
 * 실제 훅(내 팀 → 팀·경기 명단)이 MSW 상태형 서버에 보내는 요청과 그 결과 화면을 본다 —
 * 누가 카드를 보는지, 누가 "명단 조정"을 보는지, 시트 저장이 어떤 일괄 요청으로 나가는지.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { MatchTeamRosterCard } from './match-team-roster-card';
import { useMyMatchRosterTeam } from './use-my-match-roster-team';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/tournaments/tournament-1/matches/team-match-roster-game-1',
}));

const { teamId } = GAME_ROSTER_MSW;
const [G1] = GAME_ROSTER_MSW.games;
const TEAM_MATCH_ID = `team-match-${G1.gameId}`;
const NOW = '2026-10-01T00:00:00.000Z';
const BATCH = `/api/v1/teams/${teamId}/game-rosters/batch`;
const rosterPath = (team: string) => `/api/v1/teams/${team}/games/${G1.gameId}/roster`;

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
let myTeamIds: string[];
let meTeamsHits: number;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  window.localStorage.setItem('teameet.v1.userId', GAME_ROSTER_MSW.viewerUserId);
  mock = createV1GameRosterMswHandlers();
  myTeamIds = [teamId];
  meTeamsHits = 0;
  const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: NOW });
  // 다가오는 경기·경기 조회 핸들러는 두지 않는다 — 부르면 onUnhandledRequest 로 실패한다.
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/auth/me', () => ok({ user: { id: GAME_ROSTER_MSW.viewerUserId } })),
    http.get('*/api/v1/me/teams', () => {
      meTeamsHits += 1;
      return ok({ items: myTeamIds.map((id) => ({ teamId: id, membershipId: `m-${id}`, name: '우리 팀', role: 'owner', status: 'active' })) });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

/** 경기 상세가 하는 그대로 — 두 팀 id·게임 id 로 우리 팀을 골라 카드에 넘긴다. */
function Harness({ gameId }: { gameId: string | null }) {
  const team = useMyMatchRosterTeam({ teamIds: [teamId, 'team-2'], gameId });
  return <MatchTeamRosterCard team={team} />;
}

function renderCard(gameId: string | null = G1.gameId) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness gameId={gameId} />
    </QueryClientProvider>,
  );
}

const rosterRequests = () => mock.requests.filter((r) => r.path.endsWith('/roster'));
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('MatchTeamRosterCard', () => {
  it('팀장에게 출전 요약과 "명단 조정"을 보여 준다 — 팀·경기 명단 한 번의 조회로', async () => {
    renderCard();
    expect(await screen.findByRole('heading', { name: '우리 팀 출전' })).toBeInTheDocument();
    expect(screen.getByText('3명')).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: '우리 팀 출전 선수' });
    expect(within(chips).getByText('7 김민재')).toBeInTheDocument();
    expect(screen.getByText('참가 명단 기준 · 빠진 선수 없음')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '명단 조정' })).toBeInTheDocument();
    expect(mock.requests.map((r) => `${r.method} ${r.path}`)).toEqual([`GET ${rosterPath(teamId)}`]);
  });

  it('시작된 경기도 팀원에게 요약을 보여 주고 조정 버튼은 없다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    mock.setGameState(G1.gameId, 'ENDED');
    renderCard();
    expect(await screen.findByRole('heading', { name: '우리 팀 출전' })).toBeInTheDocument();
    expect(screen.getByText('경기가 시작돼 명단을 바꿀 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '명단 조정' })).not.toBeInTheDocument();
  });

  it('팀원에게는 요약만 보여 주고 조정 버튼은 없다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    renderCard();
    expect(await screen.findByRole('heading', { name: '우리 팀 출전' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '명단 조정' })).not.toBeInTheDocument();
  });

  it('우리 팀이 이 경기 사이드가 아니면(404) 카드를 숨긴다', async () => {
    myTeamIds = ['team-2'];
    renderCard();
    await waitFor(() => expect(rosterRequests().map((r) => r.path)).toEqual([rosterPath('team-2')]));
    await settle();
    expect(screen.queryByRole('heading', { name: '우리 팀 출전' })).not.toBeInTheDocument();
  });

  it('게임이 아직 없으면(gameId 없음) 카드가 없고 명단을 조회하지도 않는다', async () => {
    renderCard(null);
    await waitFor(() => expect(meTeamsHits).toBe(1));
    await settle();
    expect(screen.queryByRole('heading', { name: '우리 팀 출전' })).not.toBeInTheDocument();
    expect(rosterRequests()).toHaveLength(0);
  });

  it('두 팀 어디에도 속하지 않으면 카드가 없고 명단을 조회하지도 않는다', async () => {
    myTeamIds = ['team-other'];
    renderCard();
    await waitFor(() => expect(meTeamsHits).toBe(1));
    await settle();
    expect(screen.queryByRole('heading', { name: '우리 팀 출전' })).not.toBeInTheDocument();
    expect(rosterRequests()).toHaveLength(0);
  });

  it('비로그인(세션 힌트 없음)이면 아무것도 조회하지 않는다', async () => {
    window.localStorage.clear();
    renderCard();
    await settle();
    expect(screen.queryByRole('heading', { name: '우리 팀 출전' })).not.toBeInTheDocument();
    expect(meTeamsHits).toBe(0);
    expect(mock.requests).toHaveLength(0);
  });

  it('빠진 선수가 있으면 이름과 사유를 요약에 싣는다', async () => {
    mock.excludeAsTeamManager(G1.gameId, 'player-2', 'INJURY');
    renderCard();
    expect(await screen.findByText('참가 명단 기준 · 1명 빠짐(박서준, 부상)')).toBeInTheDocument();
    expect(screen.getByText('2명')).toBeInTheDocument();
  });

  it('경기가 시작되면 조정 버튼 대신 읽기 전용 안내를 보여 준다', async () => {
    mock.setGameState(G1.gameId, 'LIVE');
    renderCard();
    expect(await screen.findByText('경기가 시작돼 명단을 바꿀 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '명단 조정' })).not.toBeInTheDocument();
  });
});

describe('GameRosterQuickSheet (빠른 선택)', () => {
  async function openSheet() {
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: '명단 조정' }));
    return screen.getByRole('dialog', { name: /이번 경기 빠지는 선수/ });
  }

  it('고른 선수와 사유를 한 번의 일괄 요청으로 저장하고 카드 요약을 갱신한다', async () => {
    const dialog = await openSheet();
    const save = within(dialog).getByRole('button', { name: '빠지는 선수를 골라 주세요' });
    expect(save).toBeDisabled();

    // 경기 명단 화면과 같은 뜻 — 체크 = 출전, 풀면 빠진다.
    expect(within(dialog).getByText('체크를 풀면 이번 경기에서 빠져요.')).toBeInTheDocument();
    for (const box of within(dialog).getAllByRole('checkbox')) expect(box).toBeChecked();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '박서준 이번 경기 출전' }));
    expect(within(dialog).getByRole('checkbox', { name: '박서준 이번 경기 출전' })).not.toBeChecked();
    const reasons = within(dialog).getByRole('group', { name: '박서준 빠지는 사유(선택)' });
    fireEvent.click(within(reasons).getByRole('button', { name: '부상' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '1명 빼고 저장' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const batch = mock.requests.filter((r) => r.path === BATCH);
    expect(batch).toHaveLength(1);
    expect(batch[0].body).toEqual({
      changes: [{ gameId: G1.gameId, userId: 'player-2', op: 'EXCLUDE', reason: 'INJURY' }],
    });
    expect(await screen.findByText('참가 명단 기준 · 1명 빠짐(박서준, 부상)')).toBeInTheDocument();
    expect(screen.getByText('1명을 이번 경기에서 뺐어요.')).toBeInTheDocument();
  });

  it('사유를 고르지 않으면 사유 없이 보낸다', async () => {
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '김민재 이번 경기 출전' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '1명 빼고 저장' }));
    await waitFor(() => expect(mock.requests.some((r) => r.path === BATCH)).toBe(true));
    expect(mock.requests.find((r) => r.path === BATCH)!.body).toEqual({
      changes: [{ gameId: G1.gameId, userId: 'player-1', op: 'EXCLUDE' }],
    });
  });

  it('다시 체크하면 그 선수는 저장 대상에서 빠진다', async () => {
    const dialog = await openSheet();
    const box = within(dialog).getByRole('checkbox', { name: '박서준 이번 경기 출전' });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(within(dialog).getByRole('button', { name: '빠지는 선수를 골라 주세요' })).toBeDisabled();
  });

  it('ESC 로 닫히고 아무것도 저장하지 않는다', async () => {
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '박서준 이번 경기 출전' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mock.requests.some((r) => r.path === BATCH)).toBe(false);
  });

  it('전체 명단 링크는 우리 팀 경기 명단 화면으로 가고, 뒤로가기가 이 경기 상세로 오게 출처를 싣는다', async () => {
    const dialog = await openSheet();
    const matchDetail = `/tournaments/tournament-1/matches/${TEAM_MATCH_ID}`;
    expect(within(dialog).getByRole('link', { name: '경기 명단' })).toHaveAttribute(
      'href',
      `/teams/${teamId}/games/${G1.gameId}/roster?from=${encodeURIComponent(matchDetail)}`,
    );
  });

  it('그 사이 경기가 시작됐으면 마감 안내를 띄우고 최신 명단을 다시 받는다', async () => {
    const dialog = await openSheet();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '박서준 이번 경기 출전' }));
    mock.setGameState(G1.gameId, 'LIVE');
    const before = rosterRequests().length;
    fireEvent.click(within(dialog).getByRole('button', { name: '1명 빼고 저장' }));

    expect(await within(dialog).findByText(/경기가 시작돼서 명단을 바꿀 수 없어요/)).toBeInTheDocument();
    await waitFor(() => expect(rosterRequests().length).toBeGreaterThan(before));
    expect(within(dialog).getByRole('button', { name: '빠지는 선수를 골라 주세요' })).toBeDisabled();
    expect(await screen.findByText('경기가 시작돼 명단을 바꿀 수 없어요.')).toBeInTheDocument();
  });
});

describe('MatchTeamRosterCard — 참가 명단 한 줄(Task 180 R-1 C)', () => {
  it('팀장에게 [명단 조정](이번 경기)과 따로 참가 명단(선수·등번호)으로 가는 한 줄을 준다', async () => {
    renderCard();
    const link = await screen.findByRole('link', { name: '참가 명단' });
    const matchDetail = `/tournaments/tournament-1/matches/${TEAM_MATCH_ID}`;
    expect(link).toHaveAttribute(
      'href',
      `/tournaments/${GAME_ROSTER_MSW.tournamentId}/registrations/${GAME_ROSTER_MSW.registrationId}/roster?from=${encodeURIComponent(matchDetail)}`,
    );
    expect(screen.getByText('선수 추가·빼기와 등번호는 대회 참가 명단에서 바꿔요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '명단 조정' })).toBeInTheDocument();
  });

  it('팀원에게는 보이지 않는다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    renderCard();
    expect(await screen.findByRole('heading', { name: '우리 팀 출전' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '참가 명단' })).not.toBeInTheDocument();
  });
});

describe('#1538 경기 상세의 실제 inline 참가 명단 안내', () => {
  function leagueStatus(status: string) {
    mock.setCompetitionKind('LEAGUE');
    server.use(http.get('*/api/v1/tournaments/:id', () => HttpResponse.json({
      status: 'success', data: { id: GAME_ROSTER_MSW.tournamentId, kind: 'regular_league', status },
    })));
  }

  it('완료 리그는 inline도 조회 설명과 실제 목적지를 사용한다', async () => {
    leagueStatus('completed');
    mock.setGameState(G1.gameId, 'ENDED');
    renderCard();
    const link = await screen.findByRole('link', { name: '참가 명단 보기' });
    expect(link).toHaveAttribute('href', `/tournaments/${GAME_ROSTER_MSW.tournamentId}/registrations/${GAME_ROSTER_MSW.registrationId}/roster?from=${encodeURIComponent(`/tournaments/tournament-1/matches/${TEAM_MATCH_ID}`)}`);
    expect(screen.getByText('종료된 리그의 참가 명단은 조회만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText(/선수 추가·빼기와 등번호는/)).not.toBeInTheDocument();
    expect(mock.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
  });

  it.each(['SCHEDULED', 'LIVE', 'ENDED'] as const)('진행 리그의 개별 %s와 참가 명단 안내는 별도다', async (gameState) => {
    leagueStatus('in_progress');
    mock.setGameState(G1.gameId, gameState);
    renderCard();
    await screen.findByText('선수 추가·빼기와 등번호는 리그 참가 명단에서 바꿔요');
    expect(screen.getByRole('link', { name: '참가 명단' })).toBeInTheDocument();
  });

  it('팀원은 참가 명단 편집 안내나 불필요한 리그 상태 조회가 없다', async () => {
    mock.setCompetitionKind('LEAGUE');
    mock.setViewerRole('TEAM_MEMBER');
    let statusHits = 0;
    server.use(http.get('*/api/v1/tournaments/:id', () => { statusHits += 1; return new HttpResponse(null, { status: 500 }); }));
    renderCard();
    await screen.findByRole('heading', { name: '우리 팀 출전' });
    await settle();
    expect(statusHits).toBe(0);
    expect(screen.queryByRole('link', { name: '참가 명단' })).not.toBeInTheDocument();
  });
});
