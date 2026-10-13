import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStoredV1Session } from '@/lib/session-storage';
import { API, ASSIST_ID, createActionFixture, GAME_A, GAME_B, USER_ID } from './use-v1-game-operations-console-stale-rest-actions.fixtures';

const server = setupServer(http.post(`${API}/logs/client-error`, () => new HttpResponse(null, { status: 204 })));
const clients: QueryClient[] = [];
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_API_URL', API); saveStoredV1Session({ userId: USER_ID }); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); server.resetHandlers(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.resetModules(); vi.unstubAllEnvs(); window.localStorage.clear(); });
afterAll(() => server.close());

async function mount() {
  const transport = createActionFixture();
  server.use(transport.restHandler);
  vi.doMock('@/lib/v1-game-operations-socket', () => ({ getV1GameOperationsSocket: () => transport.socket, setGameOperationsAuthorizationSubjectVersion: transport.setAuthorizationVersion }));
  const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  function wrapper({ children }: { readonly children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
  const hook = renderHook(({ gameId }: { readonly gameId: string }) => useV1GameOperationsConsole({ tournamentId: null, gameId, myUserId: USER_ID, initialLastSequence: 1 }), { wrapper, initialProps: { gameId: GAME_A } });
  await waitFor(() => expect(hook.result.current.gameSnapshot).toEqual({ state: 'LIVE', version: 5 }));
  await waitFor(() => expect(transport.requests).toHaveLength(1));
  return { ...hook, transport };
}
type ConsoleHook = Awaited<ReturnType<typeof mount>>;
type Action = 'reverse' | 'assist';
function captureAction(hook: ConsoleHook, action: Action, gameId: string) {
  const { reverseEvent, assignAssist } = hook.result.current;
  return () => action === 'reverse'
    ? reverseEvent({ eventId: `goal-${gameId}`, reason: '잘못 기록한 골을 되돌려요.' })
    : assignAssist({ eventId: `goal-${gameId}`, assistParticipantId: ASSIST_ID });
}
async function expectHeld(hook: ConsoleHook, gameId: string) {
  await waitFor(() => expect(hook.result.current.takeover.status).toBe('held'));
  const grant = hook.transport.leases.get(gameId);
  if (!grant) throw new Error('The real fixture registry must grant this game lease.');
  expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: grant.takeoverToken });
  return grant;
}
async function switchToB(hook: ConsoleHook) {
  act(() => hook.rerender({ gameId: GAME_B }));
  await waitFor(() => expect(hook.transport.requests).toHaveLength(2));
  await waitFor(() => expect(hook.result.current.liveEvents[0]?.gameId).toBe(GAME_B));
  expect(hook.result.current.gameSnapshot).toEqual({ state: 'LIVE', version: 5 });
  return expectHeld(hook, GAME_B);
}
async function recordFailure(action: () => Promise<void>) {
  let error: unknown;
  await act(async () => { try { await action(); } catch (caught) { error = caught; } });
  return error;
}

describe('MD-QA #139 — stale REST actions at the actual API client/MSW boundary', () => {
  it.each<Action>(['reverse', 'assist'])('stored A %s callback cannot POST after B has the same version and its own lease', async (action) => {
    const hook = await mount();
    await expectHeld(hook, GAME_A);
    const oldAction = captureAction(hook, action, GAME_A);
    const grantB = await switchToB(hook);
    const before = { snapshot: hook.result.current.gameSnapshot, takeover: hook.result.current.takeover, banner: hook.result.current.bannerMessage };
    const error = await recordFailure(oldAction);
    expect(hook.transport.posts).toEqual([]);
    expect(error).toBeInstanceOf(Error);
    expect(hook.transport.games.get(GAME_A)?.version).toBe(5);
    expect(hook.result.current.gameSnapshot).toEqual(before.snapshot);
    expect(hook.result.current.takeover).toEqual(before.takeover);
    expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: grantB.takeoverToken });
    expect(hook.result.current.bannerMessage).toBe(before.banner);
  });

  it.each<Action>(['reverse', 'assist'])('stored %s callback cannot POST after unmount', async (action) => {
    const hook = await mount();
    await expectHeld(hook, GAME_A);
    const oldAction = captureAction(hook, action, GAME_A);
    const before = hook.result.current;
    hook.unmount();
    const error = await recordFailure(oldAction);
    expect(hook.transport.posts).toEqual([]);
    expect(error).toBeInstanceOf(Error);
    expect(hook.transport.games.get(GAME_A)?.version).toBe(5);
    expect(hook.result.current).toBe(before);
  });

  it.each<Action>(['reverse', 'assist'])('current B %s still reaches the real API client with its authorized lease', async (action) => {
    const hook = await mount();
    await expectHeld(hook, GAME_A);
    const grantB = await switchToB(hook);
    await act(async () => { await captureAction(hook, action, GAME_B)(); });
    expect(hook.transport.posts).toHaveLength(1);
    const post = hook.transport.posts[0];
    if (!post || typeof post.body !== 'object' || post.body === null || !('clientEventId' in post.body)) throw new Error('The actual client must send an idempotent REST body.');
    expect(post).toMatchObject({ gameId: GAME_B, action, idempotencyKey: post.body.clientEventId, body: { expectedVersion: 5, takeoverToken: grantB.takeoverToken } });
    expect(post.body).toHaveProperty(action === 'reverse' ? 'reason' : 'assistParticipantId', action === 'reverse' ? '잘못 기록한 골을 되돌려요.' : ASSIST_ID);
    await waitFor(() => expect(hook.result.current.gameSnapshot).toEqual({ state: 'LIVE', version: 6 }));
    expect(hook.transport.games.get(GAME_A)?.version).toBe(5);
    expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: grantB.takeoverToken });
    expect(hook.result.current.bannerMessage).toBeNull();
  });

  it.each<Action>(['reverse', 'assist'])('stored A %s callback cannot POST after returning to A with a newly granted token', async (action) => {
    const hook = await mount();
    const firstGrantA = await expectHeld(hook, GAME_A);
    const oldAction = captureAction(hook, action, GAME_A);
    await switchToB(hook);
    act(() => hook.rerender({ gameId: GAME_A }));
    await waitFor(() => expect(hook.transport.requests).toHaveLength(3));
    await waitFor(() => expect(hook.result.current.liveEvents[0]?.gameId).toBe(GAME_A));
    const currentGrantA = await expectHeld(hook, GAME_A);
    expect(currentGrantA.takeoverToken).not.toBe(firstGrantA.takeoverToken);
    const before = { snapshot: hook.result.current.gameSnapshot, takeover: hook.result.current.takeover, banner: hook.result.current.bannerMessage };
    const error = await recordFailure(oldAction);
    expect(hook.transport.posts).toEqual([]);
    expect(error).toBeInstanceOf(Error);
    expect(hook.transport.games.get(GAME_A)?.version).toBe(5);
    expect(hook.result.current.gameSnapshot).toEqual(before.snapshot);
    expect(hook.result.current.takeover).toEqual(before.takeover);
    expect(hook.result.current.bannerMessage).toBe(before.banner);
    await act(async () => { await captureAction(hook, action, GAME_A)(); });
    expect(hook.transport.posts).toHaveLength(1);
    expect(hook.transport.posts[0]).toMatchObject({ gameId: GAME_A, action, body: { expectedVersion: 5, takeoverToken: currentGrantA.takeoverToken } });
    await waitFor(() => expect(hook.result.current.gameSnapshot?.version).toBe(6));
  });

});
