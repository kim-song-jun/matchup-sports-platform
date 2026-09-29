/**
 * 경기 상세 "우리 팀 출전" 카드 + 빠른 선택 시트(Task 178 ①③).
 * 실제 훅(내 팀 → 사이드 → 명단)이 MSW 상태형 서버에 보내는 요청과 그 결과 화면을 본다 —
 * 누가 카드를 보는지, 누가 "명단 조정"을 보는지, 시트 저장이 어떤 일괄 요청으로 나가는지.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import type { V1TeamUpcomingGame } from '@/hooks/use-v1-api';
import { MatchTeamRosterCard } from './match-team-roster-card';
import { useMyMatchRosterSide } from './use-my-match-roster-side';

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

let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
let myTeamIds: string[];
let meTeamsHits: number;

const upcoming: V1TeamUpcomingGame = {
  gameId: G1.gameId,
  source: 'TOURNAMENT_FIXTURE',
  competitionKind: 'TOURNAMENT',
  teamMatchId: TEAM_MATCH_ID,
  sideId: G1.sideId,
  title: '성수 풋살컵 조별리그',
  opponentName: G1.opponentName,
  scheduledAt: G1.startAt,
  tournamentId: GAME_ROSTER_MSW.tournamentId,
  tournamentTitle: '성수 풋살컵',
  lineupState: 'DONE',
  rosterSummary: { participating: 3, excluded: 0, unavailable: 0, suspended: 0 },
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  window.localStorage.setItem('teameet.v1.userId', GAME_ROSTER_MSW.viewerUserId);
  mock = createV1GameRosterMswHandlers();
  myTeamIds = [teamId];
  meTeamsHits = 0;
  const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: NOW });
  server = setupServer(
    ...mock.handlers,
    http.get('*/api/v1/auth/me', () => ok({ id: GAME_ROSTER_MSW.viewerUserId })),
    http.get('*/api/v1/me/teams', () => {
      meTeamsHits += 1;
      return ok({ items: myTeamIds.map((id) => ({ teamId: id, membershipId: `m-${id}`, name: '우리 팀', role: 'owner', status: 'active' })) });
    }),
    http.get('*/api/v1/teams/:teamId/upcoming-games', () => ok({ items: [upcoming] })),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.close();
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

/** 경기 상세가 하는 그대로 — 두 팀 id·게임 id·대진 id 로 사이드를 풀어 카드에 넘긴다. */
function Harness({ gameId }: { gameId: string | null }) {
  const side = useMyMatchRosterSide({ teamIds: [teamId, 'team-2'], gameId, teamMatchId: TEAM_MATCH_ID });
  return <MatchTeamRosterCard side={side} />;
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

describe('MatchTeamRosterCard', () => {
  it('팀장에게 출전 요약과 "명단 조정"을 보여 준다', async () => {
    renderCard();
    expect(await screen.findByRole('heading', { name: '우리 팀 출전' })).toBeInTheDocument();
    expect(screen.getByText('3명')).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: '우리 팀 출전 선수' });
    expect(within(chips).getByText('7 김민재')).toBeInTheDocument();
    expect(screen.getByText('참가 명단 기준 · 빠진 선수 없음')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '명단 조정' })).toBeInTheDocument();
  });

  it('게임이 비공개라 gameId 를 몰라도 대진 id 로 우리 팀 사이드를 찾는다', async () => {
    renderCard(null);
    expect(await screen.findByRole('heading', { name: '우리 팀 출전' })).toBeInTheDocument();
    expect(rosterRequests().map((r) => r.path)).toContain(`/api/v1/games/${G1.gameId}/sides/${G1.sideId}/roster`);
  });

  it('팀원에게는 요약만 보여 주고 조정 버튼은 없다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    renderCard();
    expect(await screen.findByRole('heading', { name: '우리 팀 출전' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '명단 조정' })).not.toBeInTheDocument();
  });

  it('두 팀 어디에도 속하지 않으면 카드가 없고 명단을 조회하지도 않는다', async () => {
    myTeamIds = ['team-other'];
    renderCard();
    await waitFor(() => expect(meTeamsHits).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('heading', { name: '우리 팀 출전' })).not.toBeInTheDocument();
    expect(rosterRequests()).toHaveLength(0);
  });

  it('비로그인(세션 힌트 없음)이면 아무것도 조회하지 않는다', async () => {
    window.localStorage.clear();
    renderCard();
    await new Promise((resolve) => setTimeout(resolve, 50));
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
