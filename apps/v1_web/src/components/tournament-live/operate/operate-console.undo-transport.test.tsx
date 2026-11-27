import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { transferableAbortController } from 'node:util';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';
import { SEND_ACK_TIMEOUT_MS } from '@/hooks/use-v1-game-operations-console';
import { saveStoredV1Session } from '@/lib/session-storage';
import { __resetOverlayHistoryForTests, waitForOverlayHistory } from '@/lib/overlay-history';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { OperateConsole } from './operate-console';
import { createUndoFixture } from './operate-console.undo-transport.fixtures';

const NOW = new Date('2026-10-16T00:01:00.000Z');
const server = setupServer();
let fixture: ReturnType<typeof createUndoFixture>;
let queryClient: QueryClient;

// Console, hooks, queue and REST client are real. Only the socket transport is replaced —
// no Socket.IO server runs in jsdom — and REST goes to an in-memory game server.
vi.mock('@/lib/v1-game-operations-socket', () => ({
  getV1GameOperationsSocket: () => fixture.socket,
  setGameOperationsAuthorizationSubjectVersion: () => {},
}));

// The status sheet (BottomSheet) reads the app router; nothing here navigates.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const RECORDED = '골 · 홈 팀 (선수 모름) 기록했어요';

async function openConsole() {
  render(
    <QueryClientProvider client={queryClient}>
      <TournamentOpsRoleProvider role="TOURNAMENT_DIRECTOR">
        <OperateConsole tournamentId="t-undo" fixtureId="f-undo" />
      </TournamentOpsRoleProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: '골' })).toBeEnabled());
}

/** Records a goal with no player ("선수 모름") — the fixture has no roster to pick from. */
async function recordGoal(team: '홈 팀' | '원정 팀' = '홈 팀') {
  fireEvent.click(screen.getByRole('button', { name: '골' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: `${team} · 선수 모름` }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

async function tick(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

/** Opens the status line's detail sheet, where each notice's full text lives. */
function statusSheet() {
  const open = screen.queryByRole('dialog', { name: '경기 상태' });
  if (open) return open;
  fireEvent.click(screen.getByRole('button', { name: '자세히' }));
  return screen.getByRole('dialog', { name: '경기 상태' });
}

const score = () => screen.getByLabelText(/^스코어 /).getAttribute('aria-label');

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  // MSW uses Node Request; keep its real abort implementation in the same realm.
  const nativeAbort = transferableAbortController();
  vi.stubGlobal('AbortController', nativeAbort.constructor);
  vi.stubGlobal('AbortSignal', nativeAbort.signal.constructor);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost');
  // The send timeout is a 10s setTimeout; real time keeps flowing so awaits on the fake server still settle.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.history.replaceState({}, '', '/');
  window.localStorage.clear();
  saveStoredV1Session({ userId: 'operator-undo' });
  fixture = createUndoFixture(server);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => {
  cleanup();
  await waitForOverlayHistory();
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  queryClient.clear();
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('OperateConsole — 되돌리기는 서버의 실제 상태를 보고 정한다', () => {
  it('기준선: 확정된 기록은 그 서버 이벤트를 한 번 되돌린다', async () => {
    await openConsole();
    await recordGoal();
    expect(await screen.findByText(RECORDED)).toBeInTheDocument();
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 1점, 원정 팀 0점'));

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    expect(fixture.reversals).toHaveLength(1);
    expect(fixture.reversals[0]).toMatchObject({ eventId: 'server-event-1', expectedVersion: 6, outcome: 'reversed', reason: '골 기록 되돌리기' });
    expect(fixture.reversals[0].idempotencyKey).toBe(fixture.reversals[0].clientEventId);
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 0점, 원정 팀 0점'));
  });

  it('응답 시간 초과로 실패 처리된 기록이 서버에는 저장돼 있으면, 되돌리기는 그 기록을 찾아 되돌린다', async () => {
    // 서버는 골을 커밋했지만 응답과 방송이 이 기기에 닿지 않는다.
    fixture.nextAppends('commit-without-reply');
    await openConsole();
    await recordGoal();
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }));
    expect(await screen.findByText('기록을 보내는 중이에요. 서버에 닿으면 되돌릴게요.')).toBeInTheDocument();
    expect(fixture.reversals).toHaveLength(0);

    // 10초 뒤 큐가 이 기록을 「전송 실패」로 바꾼다 — 그래도 서버에는 골이 있다.
    await tick(SEND_ACK_TIMEOUT_MS);

    await waitFor(() => expect(fixture.reversals).toHaveLength(1));
    expect(fixture.reversals[0]).toMatchObject({ eventId: 'server-event-1', expectedVersion: 6, reason: '골 기록 되돌리기' });
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    expect(fixture.reversals[0].outcome).toBe('reversed');
    expect(fixture.events.map((event) => event.type)).toEqual(['GOAL', 'CORRECTION']);
    // 골은 점수에서 빠지고, 화면 어디에도 「되돌릴 것이 없어요」나 실패 안내가 남지 않는다.
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 0점, 원정 팀 0점'));
    expect(document.body).not.toHaveTextContent('되돌릴 것이 없어요');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(within(statusSheet()).queryByText('보낼 기록')).toBeNull();
  });

  it('실패 처리된 뒤 늦은 확정이 도착한 기록도 되돌린다 — 목록에 나타난 기록을 그대로 쓴다', async () => {
    fixture.nextAppends('hold');
    await openConsole();
    await recordGoal();
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }));
    await screen.findByText('기록을 보내는 중이에요. 서버에 닿으면 되돌릴게요.');

    // 응답이 10초를 넘기기 직전, 느린 망을 지나 서버가 확정하고 응답·방송이 도착한다.
    await tick(SEND_ACK_TIMEOUT_MS - 1_000);
    expect(fixture.reversals).toHaveLength(0);
    act(() => fixture.releaseHeld());

    await waitFor(() => expect(fixture.reversals).toHaveLength(1));
    expect(fixture.reversals[0]).toMatchObject({ eventId: 'server-event-1', expectedVersion: 6 });
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 0점, 원정 팀 0점'));
  });

  it('서버가 그런 기록이 없다고 확인해 줄 때만 되돌릴 것이 없다고 말한다', async () => {
    fixture.nextAppends('drop');
    await openConsole();
    await recordGoal();
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }));
    await tick(SEND_ACK_TIMEOUT_MS);

    await waitFor(() => expect(fixture.eventsReads).toBeGreaterThan(0));
    expect(
      await within(statusSheet()).findByText('서버에 저장되지 않은 기록이라 되돌릴 것이 없어요. 뒤늦게 기록 목록에 나타나면 「고치기」에서 취소해 주세요.'),
    ).toBeInTheDocument();
    expect(fixture.reversals).toHaveLength(0);
    expect(fixture.events).toHaveLength(0);
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });

  it('서버에 물어볼 수 없으면 없다고 단정하지 않고 결과를 모른다고 말한다', async () => {
    fixture.nextAppends('commit-without-reply');
    fixture.setEventsReadFails(true);
    await openConsole();
    await recordGoal();
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }));
    await tick(SEND_ACK_TIMEOUT_MS);

    expect(
      await within(statusSheet()).findByText('전송 결과를 아직 확인하지 못했어요. 기록 목록에 나타나면 「고치기」에서 취소해 주세요.'),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('되돌릴 것이 없어요');
    expect(fixture.reversals).toHaveLength(0);
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });
});
