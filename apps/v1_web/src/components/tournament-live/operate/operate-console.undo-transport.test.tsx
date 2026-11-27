import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

/** The one-line status row above the record grid. */
const statusRow = () => screen.getByRole('button', { name: '자세히' }).closest('[role="status"],[role="alert"]') as HTMLElement;

/** Records a home goal and waits until the server has committed it and the console shows it. */
async function recordConfirmedHomeGoal() {
  await recordGoal('홈 팀');
  await waitFor(() => expect(fixture.events).toHaveLength(1));
  await waitFor(() => expect(score()).toBe('스코어 홈 팀 1점, 원정 팀 0점'));
  await screen.findByText(RECORDED);
}

/** The undo button of the toast that announced this record. */
function undoButtonOf(message: string) {
  return within(screen.getByText(message).closest('[role="status"]') as HTMLElement).getByRole('button', { name: '되돌리기' });
}

/** Lets requests already on their way reach the fake server (real event-loop turns, no clock movement). */
async function flushTransport() {
  await act(async () => {
    for (let turn = 0; turn < 40; turn += 1) await new Promise<void>((resolve) => setImmediate(resolve));
  });
}

// Every step crosses the real hook, queue and REST client, so a busy machine needs more than the 1s default per wait.
vi.setConfig({ testTimeout: 30_000 });
beforeAll(() => {
  configure({ asyncUtilTimeout: 5_000 });
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1_000 });
  server.close();
});
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

  it('응답이 늦어도 제한 시간 안에 확정되면 목록에 나타난 그 기록을 되돌린다', async () => {
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
    expect(fixture.eventsReads).toBe(0);
  });

  it('실패 처리된 뒤 늦은 확정이 도착한 기록도 되돌린다', async () => {
    fixture.nextAppends('hold');
    await openConsole();
    await recordGoal();
    fireEvent.click(await screen.findByRole('button', { name: '되돌리기' }));
    await screen.findByText('기록을 보내는 중이에요. 서버에 닿으면 되돌릴게요.');
    const read = fixture.holdNextEventsRead();

    // 10초 뒤 큐가 「전송 실패」로 바꾸고, 되돌리기는 서버 목록을 읽으러 간다.
    await tick(SEND_ACK_TIMEOUT_MS);
    await act(async () => { await read.started; });
    expect(fixture.reversals).toHaveLength(0);
    // 그 답이 오기 전에, 느린 망을 지난 골이 뒤늦게 확정되고 응답·방송이 도착한다.
    act(() => fixture.releaseHeld());
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 1점, 원정 팀 0점'));
    await act(async () => { read.release(); });

    await waitFor(() => expect(fixture.reversals).toHaveLength(1));
    expect(fixture.reversals[0]).toMatchObject({ eventId: 'server-event-1', expectedVersion: 6 });
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    expect(fixture.reversals[0].outcome).toBe('reversed');
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 0점, 원정 팀 0점'));
    expect(document.body).not.toHaveTextContent('되돌릴 것이 없어요');
    expect(within(statusSheet()).queryByText('보낼 기록')).toBeNull();
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

describe('OperateConsole — 되돌리기와 다른 전송은 같은 버전으로 겹치지 않는다', () => {
  const HOME_GOAL = '골 · 홈 팀 (선수 모름) 기록했어요';
  const AWAY_GOAL = '골 · 원정 팀 (선수 모름) 기록했어요';

  it('다른 기록이 나가는 중이면 그 기록이 확정된 뒤에 되돌린다 — 새 기록이 거절되지 않는다', async () => {
    await openConsole();
    await recordConfirmedHomeGoal();
    // 원정 골은 느린 망을 지나는 중이다.
    fixture.nextAppends('hold');
    await recordGoal('원정 팀');
    await waitFor(() => expect(fixture.heldCount).toBe(1));

    fireEvent.click(undoButtonOf(HOME_GOAL));
    await flushTransport();
    expect(fixture.reversals).toHaveLength(0);
    expect(screen.getByText('다른 기록을 보내는 중이에요. 다 보내면 되돌릴게요.')).toBeInTheDocument();

    act(() => fixture.releaseHeld());

    await waitFor(() => expect(fixture.reversals).toHaveLength(1));
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    // 원정 골이 올린 버전(7)으로 되돌리기를 보낸다.
    expect(fixture.reversals[0]).toMatchObject({ eventId: 'server-event-1', expectedVersion: 7, outcome: 'reversed' });
    expect(fixture.appends.map((append) => append.outcome)).toEqual(['committed', 'committed']);
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 0점, 원정 팀 1점'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('되돌리기가 서버에 가 있는 동안 골을 두 번 눌러도 새 기록이 나가지 않고, 끝난 뒤 한 번 누르면 기록된다', async () => {
    await openConsole();
    await recordConfirmedHomeGoal();
    const reversal = fixture.holdNextReversal();
    fireEvent.click(undoButtonOf(HOME_GOAL));
    await act(async () => { await reversal.started; });

    // 누른 결과가 바로 보인다: 상태 줄이 말하고 기록 버튼이 잠긴다.
    await waitFor(() => expect(statusRow()).toHaveTextContent('되돌리는 중이에요…'));
    const goal = screen.getByRole('button', { name: '골' });
    expect(goal).toBeDisabled();
    fireEvent.click(goal);
    fireEvent.click(goal);
    await flushTransport();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fixture.appends).toHaveLength(1);

    await act(async () => { reversal.release(); });

    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '골' })).toBeEnabled());
    expect(statusRow()).not.toHaveTextContent('되돌리는 중이에요');
    await recordGoal('원정 팀');
    expect(await screen.findByText(AWAY_GOAL)).toBeInTheDocument();
    await waitFor(() => expect(fixture.appends).toHaveLength(2));
    await flushTransport();
    expect(fixture.appends).toHaveLength(2);
    expect(fixture.reversals).toHaveLength(1);
    expect(fixture.reversals[0]).toMatchObject({ expectedVersion: 6, outcome: 'reversed' });
    // 되돌리기가 올린 버전(7)으로 원정 골이 한 번 나간다.
    expect(fixture.appends[1]).toMatchObject({ expectedVersion: 7, outcome: 'committed' });
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 0점, 원정 팀 1점'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('선수 시트를 열어 둔 채 되돌리기가 시작됐으면, 고른 기록은 기다린다고 알리고 되돌리기가 끝난 뒤에 한 번 보낸다', async () => {
    await openConsole();
    await recordConfirmedHomeGoal();
    fireEvent.click(screen.getByRole('button', { name: '골' }));
    const sheet = await screen.findByRole('dialog');
    const reversal = fixture.holdNextReversal();
    fireEvent.click(undoButtonOf(HOME_GOAL));
    await act(async () => { await reversal.started; });

    fireEvent.click(within(sheet).getByRole('button', { name: '원정 팀 · 선수 모름' }));

    expect(await screen.findByText('되돌리기를 마치면 바로 기록할게요.')).toBeInTheDocument();
    await flushTransport();
    // 되돌리기가 아직 서버에 있다 — 원정 골은 같은 버전(6)으로 나가지 않고 기다린다.
    expect(fixture.appends).toHaveLength(1);

    await act(async () => { reversal.release(); });

    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    expect(await screen.findByText(AWAY_GOAL)).toBeInTheDocument();
    await waitFor(() => expect(fixture.appends).toHaveLength(2));
    expect(fixture.reversals).toHaveLength(1);
    expect(fixture.reversals[0]).toMatchObject({ expectedVersion: 6, outcome: 'reversed' });
    expect(fixture.appends[1]).toMatchObject({ expectedVersion: 7, outcome: 'committed' });
    await waitFor(() => expect(score()).toBe('스코어 홈 팀 0점, 원정 팀 1점'));
    expect(document.body).not.toHaveTextContent('Expected version is stale');
  });

  it('그래도 남는 버전 충돌은 서버 영어 원문이 아니라 해요체로 알린다', async () => {
    await openConsole();
    await recordConfirmedHomeGoal();
    // 다른 기기가 경기를 바꿨고 이 기기는 아직 모른다.
    fixture.bumpVersionElsewhere();

    fireEvent.click(undoButtonOf(HOME_GOAL));

    await waitFor(() => expect(fixture.reversals[0]?.outcome).toBe('conflict'));
    expect(
      await within(statusSheet()).findByText('그사이 경기 기록이 바뀌어 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Expected version is stale');
    expect(screen.queryByText('되돌렸어요')).toBeNull();
    expect(score()).toBe('스코어 홈 팀 1점, 원정 팀 0점');
  });
});
