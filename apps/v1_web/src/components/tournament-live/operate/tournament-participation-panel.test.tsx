import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import type { GameSide } from '@/types/game-operations';
import { TournamentParticipationPanel } from './tournament-participation-panel';

const [game] = GAME_ROSTER_MSW.games;
const side: GameSide = { id: game.sideId, gameId: game.gameId, teamId: GAME_ROSTER_MSW.teamId, sideKey: 'HOME', displayNameSnapshot: '우리팀', createdAt: '', updatedAt: '' };
let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
const onError = vi.fn();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  mock = createV1GameRosterMswHandlers();
  mock.setViewerRole('ADMIN');
  server = setupServer(...mock.handlers, http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
  server.listen({ onUnhandledRequest: 'error' });
  onError.mockReset();
});
afterEach(() => { server.close(); vi.unstubAllEnvs(); });

function panel(disabled = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><TournamentParticipationPanel gameId={game.gameId} sides={[side]} disabled={disabled} onError={onError} /></QueryClientProvider>);
}
const writes = () => mock.requests.filter((r) => r.method !== 'GET');
const edit = async () => fireEvent.click(await screen.findByRole('button', { name: '우리팀 명단 수정하기' }));

describe('대회 운영콘솔 경기 출전 명단', () => {
  it('팀이 이미 제외한 선수를 포함한 실제 상태를 조회하며 기본은 수정 불가다', async () => {
    mock.excludeAsTeamManager(game.gameId, 'player-2', 'INJURY');
    panel();
    await screen.findByRole('button', { name: '우리팀 명단 수정하기' });
    expect(screen.getByText(/박서준/).closest('li')).toHaveTextContent('빠짐');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /전원 도착/ })).toBeNull();
    expect(writes()).toHaveLength(0);
    await edit();
    expect(screen.getByRole('checkbox', { name: '박서준 출전' })).not.toBeChecked();
  });

  it('취소는 서버 명단을 바꾸지 않는다', async () => {
    panel(); await edit();
    fireEvent.click(screen.getByRole('checkbox', { name: '김민재 출전' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(writes()).toHaveLength(0);
    await edit();
    expect(screen.getByRole('checkbox', { name: '김민재 출전' })).toBeChecked();
  });

  it('저장하면 해당 경기 조정 API를 사용하고 팀 명단 재조회에도 제외 상태가 남는다', async () => {
    panel(); await edit();
    fireEvent.click(screen.getByRole('checkbox', { name: '김민재 출전' }));
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'POST', path: `/api/v1/games/${game.gameId}/sides/${game.sideId}/roster-adjustments`, body: { userId: 'player-1' } });
    await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull());
    await waitFor(() => expect(screen.getByText(/김민재/).closest('li')).toHaveTextContent('빠짐'));
    await edit();
    expect(screen.getByRole('checkbox', { name: '김민재 출전' })).not.toBeChecked();
    expect(mock.readRoster(GAME_ROSTER_MSW.games[1].gameId).counts.participating).toBe(3);
    expect(mock.readRoster(game.gameId).excluded[0].actor.role).toBe('ADMIN');
    expect(onError).not.toHaveBeenCalled();
  });

  it('경기별로 제외했던 선수도 되돌려 저장한다', async () => {
    mock.excludeAsTeamManager(game.gameId, 'player-2', 'INJURY');
    panel(); await edit();
    fireEvent.click(screen.getByRole('checkbox', { name: '박서준 출전' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'DELETE', path: `/api/v1/games/${game.gameId}/sides/${game.sideId}/roster-adjustments/player-2` });
    await waitFor(() => expect(screen.getByText(/박서준/).closest('li')).toHaveTextContent('출전'));
  });

  it('편집 중 팀이 바꾼 명단을 저장 직전에 확인하고 덮어쓰지 않는다', async () => {
    panel(); await edit();
    fireEvent.click(screen.getByRole('checkbox', { name: '김민재 출전' }));
    mock.excludeAsTeamManager(game.gameId, 'player-2', 'INJURY');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('경기 명단이 바뀌었어요')));
    expect(writes()).toHaveLength(0);
  });

  it('저장 실패를 알리고 서버 상태로 돌아간다', async () => {
    server.use(http.post('*/api/v1/games/:gameId/sides/:sideId/roster-adjustments', () => HttpResponse.json({ status: 'error', message: '저장 거부', code: 'FORBIDDEN' }, { status: 403 })));
    panel(); await edit();
    fireEvent.click(screen.getByRole('checkbox', { name: '김민재 출전' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('저장 거부')));
    await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull());
    expect(screen.getByText(/김민재/).closest('li')).toHaveTextContent('출전');
  });

  it('일부 저장 후 실패하면 저장된 인원을 알리고 실제 경기 명단을 보여준다', async () => {
    mock.excludeAsTeamManager(game.gameId, 'player-2', 'INJURY');
    server.use(http.delete('*/api/v1/games/:gameId/sides/:sideId/roster-adjustments/:userId', () => HttpResponse.json({ status: 'error', message: '복귀 저장 실패' }, { status: 500 })));
    panel(); await edit();
    fireEvent.click(screen.getByRole('checkbox', { name: '김민재 출전' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '박서준 출전' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('1명의 변경은 저장됐어요.')));
    await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull());
    expect(screen.getByText(/김민재/).closest('li')).toHaveTextContent('빠짐');
    expect(screen.getByText(/박서준/).closest('li')).toHaveTextContent('빠짐');
  });

  it('출전정지 선수는 운영자 편집에서도 출전시킬 수 없다', async () => {
    mock.suspend('player-2', '누적 카드', 1);
    panel(); await edit();
    expect(screen.getByRole('checkbox', { name: '박서준 출전' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '박서준 출전' })).not.toBeChecked();
  });

  it.each(['disabled', 'member', 'started'] as const)('%s 상태는 편집을 허용하지 않는다', async (mode) => {
    if (mode === 'member') mock.setViewerRole('TEAM_MEMBER');
    if (mode === 'started') mock.setGameState(game.gameId, 'LIVE');
    panel(mode === 'disabled');
    expect(await screen.findByRole('button', { name: '우리팀 명단 수정하기' })).toBeDisabled();
  });
});
