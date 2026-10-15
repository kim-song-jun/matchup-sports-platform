import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';
import { saveStoredV1Session } from '@/lib/session-storage';
import type { GameDetail } from '@/types/game-operations';
import { OperateConsole } from './operate-console';

const API = 'http://localhost/api/v1';
const NOW = new Date('2026-10-16T00:01:00.000Z');
const server = setupServer();
let fixture: ReturnType<typeof createFixture>;
let queryClient: QueryClient;

// Keep the actual console, HTTP hooks, operation hook and clock. Only the
// transport is substituted, because no Socket.IO server runs in jsdom.
vi.mock('@/lib/v1-game-operations-socket', () => ({
  getV1GameOperationsSocket: () => fixture.socket,
  setGameOperationsAuthorizationSubjectVersion: () => {},
}));

function createFixture() {
  let game: GameDetail = {
    id: 'game-expiry', sourceType: 'TOURNAMENT_FIXTURE', state: 'LIVE', version: 5, lastSequence: 0,
    competitionConfigVersionId: 'config-expiry', currentOfficialRevisionId: null, actorRole: 'tournament_director',
    sides: [
      { id: 'home', gameId: 'game-expiry', sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '홈 팀', createdAt: '', updatedAt: '' },
      { id: 'away', gameId: 'game-expiry', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '원정 팀', createdAt: '', updatedAt: '' },
    ],
    periods: [{ id: 'period-1', gameId: 'game-expiry', number: 1, state: 'LIVE', startedAt: '2026-10-16T00:00:00.000Z', endedAt: null, pausedAt: null, pausedTotalMs: 0 }],
    periodDurations: [{ durationMinutes: 1, extraTime: false }], lineups: [],
    substitutionPolicy: { mode: 'rolling', maxSubstitutions: null }, isKnockoutFixture: false,
  };
  let reads = 0;
  let readError = false;
  let commandError = false;
  const commands: { readonly command: string; readonly body: unknown }[] = [];
  const handlers = new Map<string, (payload: unknown) => void>();
  const socket = {
    connected: true,
    on(event: string, handler: (payload: unknown) => void) { handlers.set(event, handler); },
    off(event: string) { handlers.delete(event); },
    emit(event: string, payload: unknown, ack?: (result: unknown) => void) {
      if (!ack) return;
      if (event === 'game.subscribe') {
        ack({ status: 'subscribed', snapshot: { gameId: game.id, state: game.state, version: game.version, lastSequence: 0, events: [] } });
      } else if (event === 'game.time.ping') {
        ack({ clientSentAt: Date.now(), serverReceivedAt: Date.now(), serverSentAt: Date.now() });
      } else if (event === 'game.takeover.request' || event === 'game.takeover.renew') {
        ack({ status: 'granted', gameId: game.id, takeoverToken: 'expiry-lease', expiresAt: new Date(Date.now() + 90_000).toISOString() });
      } else {
        throw new Error(`Unexpected socket request: ${event} ${JSON.stringify(payload)}`);
      }
    },
  };
  const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
  const failure = (statusCode: number, message: string) => HttpResponse.json({ status: 'error', statusCode, code: 'EXPIRY_TEST_FAILURE', message }, { status: statusCode });
  const endPeriod = () => {
    game = { ...game, version: game.version + 1, periods: game.periods.map((period) => ({ ...period, state: 'ENDED', endedAt: new Date().toISOString() })) };
  };
  server.use(
    http.get(`${API}/auth/me`, () => success({ user: { id: 'operator-expiry' } })),
    http.get(`${API}/me/tournament-staff`, () => success({ platformRole: null, items: [] })),
    http.get(`${API}/tournament-ops/tournaments/t-expiry/fixtures/f-expiry/lineup`, () => success({ gameId: game.id, lineups: [] })),
    http.get(`${API}/games/game-expiry`, () => {
      reads += 1;
      return readError ? failure(400, '서버 종료 상태를 읽지 못했어요.') : success(game);
    }),
    http.post(`${API}/games/game-expiry/commands/:command`, async ({ params, request }) => {
      const body: unknown = await request.json();
      commands.push({ command: String(params.command), body });
      if (request.headers.get('x-v1-user-id') !== 'operator-expiry' || typeof body !== 'object' || body === null || !('takeoverToken' in body) || body.takeoverToken !== 'expiry-lease' || !('clientCommandId' in body) || body.clientCommandId !== request.headers.get('Idempotency-Key')) return failure(403, '운영 권한이 없어요.');
      if (!('expectedVersion' in body) || body.expectedVersion !== game.version) return failure(409, '경기 버전이 달라요.');
      if (commandError) return failure(503, '종료 요청의 응답을 확인하지 못했어요.');
      if (params.command === 'end-period') endPeriod();
      return success({ gameId: game.id, state: game.state, version: game.version, durableCommandId: 'period-command', replayed: false });
    }),
    http.post(`${API}/logs/client-error`, () => success({ id: 'test-error' })),
  );
  return {
    socket, commands, endPeriod,
    get reads() { return reads; },
    setReadError(value: boolean) { readError = value; },
    setCommandError(value: boolean) { commandError = value; },
    pause() { game = { ...game, state: 'PAUSED', periods: game.periods.map((period) => ({ ...period, pausedAt: '2026-10-16T00:00:50.000Z' })) }; },
  };
}

async function openConsole() {
  render(<QueryClientProvider client={queryClient}><TournamentOpsRoleProvider role="TOURNAMENT_DIRECTOR"><OperateConsole tournamentId="t-expiry" fixtureId="f-expiry" /></TournamentOpsRoleProvider></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: '정규 시간 종료' })).toBeEnabled());
}

async function tick(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

async function requestManualEnd() {
  fireEvent.click(screen.getByRole('button', { name: '정규 시간 종료' }));
  const dialog = await screen.findByRole('dialog', { name: '정규 시간 종료할까요?' });
  fireEvent.click(within(dialog).getByRole('button', { name: '정규 시간 종료' }));
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost');
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  saveStoredV1Session({ userId: 'operator-expiry' });
  fixture = createFixture();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  server.resetHandlers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('OperateConsole — 서버가 확정하는 기간 시간 만료', () => {
  it('만료 안내 중에도 기존 수동 기간 종료와 확인을 거쳐 서버 응답을 반영해요', async () => {
    await openConsole();
    expect(await screen.findByText(/설정된 시간이 끝났어요/)).toBeInTheDocument();
    expect(screen.getByText(/서버.*종료.*확인/)).toBeInTheDocument();
    expect(fixture.commands).toEqual([]);
    await requestManualEnd();
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(fixture.commands.map(({ command }) => command)).toEqual(['end-period']);
    expect(screen.queryByLabelText(/경과 시간/)).toBeNull();
  });

  it('worker가 마지막 기간을 끝내면 화면이 갱신되고 결과 제출은 운영자에게 남겨요', async () => {
    await openConsole();
    fixture.endPeriod();
    await tick(5_000);
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/경과 시간/)).toBeNull();
    expect(screen.getByRole('button', { name: '경기 종료' })).toBeEnabled();
    expect(screen.queryByText('결과 확정')).toBeNull();
    expect(fixture.commands).toEqual([]);
    const readsAfterEnd = fixture.reads;
    await tick(15_000);
    expect(fixture.reads).toBe(readsAfterEnd);
    fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '경기 종료' }));
    await waitFor(() => expect(fixture.commands).toHaveLength(1));
    expect(fixture.commands[0]?.body).toMatchObject({ expectedVersion: 6 });
  });

  it('열려 있는 일시정지 구간은 플레이 시간이나 만료 확인 요청을 늘리지 않아요', async () => {
    fixture.pause();
    render(<QueryClientProvider client={queryClient}><TournamentOpsRoleProvider role="TOURNAMENT_DIRECTOR"><OperateConsole tournamentId="t-expiry" fixtureId="f-expiry" /></TournamentOpsRoleProvider></QueryClientProvider>);
    expect(await screen.findByLabelText(/경과 시간 00:50/)).toBeInTheDocument();
    const initialReads = fixture.reads;
    await tick(15_000);
    expect(screen.queryByText(/설정된 시간이 끝났어요/)).toBeNull();
    expect(screen.getByLabelText(/경과 시간 00:50/)).toBeInTheDocument();
    expect(fixture.reads).toBe(initialReads);
    expect(fixture.commands).toEqual([]);
  });

  it('상태 조회 실패를 알리고 수동 재조회로 서버가 끝낸 기간을 복구해요', async () => {
    await openConsole();
    fixture.setReadError(true);
    await tick(5_000);
    expect(await screen.findByText(/서버 종료 상태를 읽지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정규 시간 종료' })).toBeEnabled();
    fixture.setReadError(false);
    fixture.endPeriod();
    fireEvent.click(screen.getByRole('button', { name: '종료 상태 다시 확인' }));
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(fixture.commands).toEqual([]);
  });

  it('수동 종료 응답이 실패하면 같은 요청 재시도로 확정할 때까지 성공을 표시하지 않아요', async () => {
    await openConsole();
    expect(await screen.findByText(/설정된 시간이 끝났어요/)).toBeInTheDocument();
    fixture.setCommandError(true);
    await requestManualEnd();
    const retry = await screen.findByRole('button', { name: '같은 요청 재시도' });
    expect(screen.getByText(/서버 응답을 받지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeNull();
    fixture.setCommandError(false);
    fireEvent.click(retry);
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(fixture.commands.map(({ command }) => command)).toEqual(['end-period', 'end-period']);
    expect(fixture.commands[1]?.body).toEqual(fixture.commands[0]?.body);
  });
});
