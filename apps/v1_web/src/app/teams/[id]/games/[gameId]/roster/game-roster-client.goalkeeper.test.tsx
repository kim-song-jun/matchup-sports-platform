import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const { teamId, games, players } = GAME_ROSTER_MSW;
const gameId = games[0].gameId;
let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  mock = createV1GameRosterMswHandlers();
  mock.setCompetitionKind('LEAGUE');
  server = setupServer(...mock.handlers, http.get('*/api/v1/tournaments/:id', () => HttpResponse.json({ status: 'success', data: { status: 'ongoing', kind: 'league', teamRegistration: { registrationId: GAME_ROSTER_MSW.registrationId, status: 'confirmed' } } })), http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.close(); vi.unstubAllEnvs(); });
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><GameRosterClient teamId={teamId} gameId={gameId} /></QueryClientProvider>);
}
const select = (name: string) => screen.getByRole('button', { name: `${name} 골키퍼로 지정` });
const selected = (name: string) => screen.getByRole('button', { name: `${name}, 골키퍼 지정 해제` });
async function save(count: number) {
  fireEvent.click(screen.getByRole('button', { name: `저장 (${count}건)` }));
  await screen.findByText('명단을 저장했어요.');
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeDisabled());
}
describe('리그 경기 선수별 골키퍼', () => {
  it('여러 명을 저장·재조회하고 한 명만 해제해도 다른 선수 지정과 등번호·출전이 유지된다', async () => {
    const view = open();
    await screen.findByRole('button', { name: '김민재 골키퍼로 지정' });
    fireEvent.click(select('김민재'));
    fireEvent.click(select('박서준'));
    expect(selected('김민재')).toHaveAttribute('aria-pressed', 'true');
    expect(selected('박서준')).toHaveAttribute('aria-pressed', 'true');
    await save(2);
    expect(mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/batch'))?.body).toEqual({ changes: [
      { gameId, userId: players[0].userId, op: 'SET_GOALKEEPER', goalkeeper: true },
      { gameId, userId: players[1].userId, op: 'SET_GOALKEEPER', goalkeeper: true },
    ] });
    view.unmount();
    open();
    await screen.findByRole('button', { name: '김민재, 골키퍼 지정 해제' });
    expect(selected('박서준')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(selected('김민재'));
    await save(1);
    expect(select('김민재')).toHaveAttribute('aria-pressed', 'false');
    expect(selected('박서준')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '김민재 등번호 7번 바꾸기' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeChecked();
  });
  it('같은 선수의 출전 제외와 GK 지정을 함께 저장하고 복귀해도 지정이 유지된다', async () => {
    open();
    await screen.findByRole('button', { name: '김민재 골키퍼로 지정' });
    fireEvent.click(select('김민재'));
    fireEvent.click(screen.getByRole('checkbox', { name: '김민재 이번 경기 출전' }));
    expect(screen.getByRole('heading', { name: '출전 2명' })).toBeInTheDocument();
    await save(2);
    expect(selected('김민재')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '김민재 출전으로 되돌리기' }));
    await save(1);
    expect(selected('김민재')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeChecked();
  });
  it('일반 저장 실패는 선택 초안을 유지하고 재시도할 수 있다', async () => {
    server.use(http.post('*/api/v1/teams/:id/game-rosters/batch', () => HttpResponse.json({ status: 'error', code: 'UNAVAILABLE', message: '지금 저장할 수 없어요.' }, { status: 503 })));
    open();
    await screen.findByRole('button', { name: '김민재 골키퍼로 지정' });
    fireEvent.click(select('김민재'));
    fireEvent.click(screen.getByRole('button', { name: '저장 (1건)' }));
    await screen.findByText('지금 저장할 수 없어요.');
    expect(selected('김민재')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '저장 (1건)' })).toBeEnabled();
  });
  it('읽기 전용 팀원에게는 지정 버튼을 노출하지 않는다', async () => {
    mock.setViewerRole('TEAM_MEMBER');
    open();
    await screen.findByRole('heading', { name: '출전 3명' });
    expect(screen.queryByRole('button', { name: /골키퍼/ })).toBeNull();
  });
});
