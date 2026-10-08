import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import type { CursorPage, V1ChatRoom, V1ChatRoomDetail } from '@/types/api';
import { useV1ChatRoom, useV1ChatRooms, useV1UpdateChatRoomMe } from './use-v1-api';

const api = 'http://localhost/api/v1';
const room: V1ChatRoom = {
  roomId: 'room-1', roomType: 'team', title: '우리 팀', status: 'active',
  teamContact: null, linkedTarget: { type: 'team', id: 'team-1', title: '우리 팀', route: '/teams/team-1' },
  linkedTargetCancelled: false, lastMessage: null, unreadCount: 0, pinned: false, muted: false,
};
let serverPinned = false;
let readsFail = false;
let visibility: DocumentVisibilityState = 'visible';
const readQueries: string[] = [];
const clients: ReturnType<typeof createV1QueryClient>[] = [];

function readFailure() {
  return HttpResponse.json({ status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE',
    message: '채팅 정보를 불러오지 못했어요.', timestamp: new Date().toISOString() }, { status: 503 });
}

const server = setupServer(
  http.get(`${api}/chat/rooms`, ({ request }) => {
    readQueries.push(new URL(request.url).search);
    if (readsFail) return readFailure();
    const data: CursorPage<V1ChatRoom> = {
      items: [{ ...room, pinned: serverPinned }], nextCursor: null,
      pageInfo: { hasNext: false, nextCursor: null },
    };
    return HttpResponse.json({ status: 'success', data });
  }),
  http.get(`${api}/chat/rooms/room-1`, () => {
    if (readsFail) return readFailure();
    const data: V1ChatRoomDetail = {
      roomId: room.roomId, roomType: room.roomType, title: room.title, status: room.status,
      teamContact: room.teamContact, linkedTarget: room.linkedTarget,
      me: { participantId: 'participant-1', status: 'active', pinned: serverPinned,
        mutedUntil: null, lastReadMessageId: null }, participants: [],
    };
    return HttpResponse.json({ status: 'success', data });
  }),
  http.patch(`${api}/chat/rooms/room-1/me`, async ({ request }) => {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('pinned' in body) || typeof body.pinned !== 'boolean') {
      return new HttpResponse(null, { status: 400 });
    }
    serverPinned = body.pinned;
    return HttpResponse.json({ status: 'success', data: {
      roomId: room.roomId, pinned: serverPinned, mutedUntil: null, lastReadMessageId: null, status: 'active',
    } });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

function createTab(staleTime = Infinity) {
  const client = createV1QueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, staleTime, retry: false } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

async function switchVisibility(next: DocumentVisibilityState) {
  visibility = next;
  await act(async () => { window.dispatchEvent(new Event('visibilitychange')); });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  serverPinned = false;
  readsFail = false;
  visibility = 'visible';
  readQueries.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  focusManager.setFocused(undefined);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  focusManager.setFocused(undefined);
});
afterAll(() => server.close());

describe.each([
  { cache: 'fresh', staleTime: Infinity },
  { cache: 'stale', staleTime: 0 },
])('chat tab return with a $cache cache', ({ staleTime }) => {
  it.each([true, false])('refreshes list, filtered list and detail when another tab sets pinned=%s', async (pinned) => {
    // Given: independent tabs have read the same account's original pin state.
    serverPinned = !pinned;
    const tabA = createTab(staleTime);
    const tabB = createTab(staleTime);
    const mutation = renderHook(() => useV1UpdateChatRoomMe(), { wrapper: tabA.wrapper });
    const { result } = renderHook(() => ({
      list: useV1ChatRooms({ refetchOnWindowFocus: 'always' }),
      filtered: useV1ChatRooms({ refetchOnWindowFocus: 'always' }, { roomType: 'team', status: 'active', limit: 50 }),
      detail: useV1ChatRoom(room.roomId),
    }), { wrapper: tabB.wrapper });
    await waitFor(() => {
      expect(result.current.list.data?.items[0]?.pinned).toBe(!pinned);
      expect(result.current.filtered.data?.items[0]?.pinned).toBe(!pinned);
      expect(result.current.detail.data?.me.pinned).toBe(!pinned);
    });
    await switchVisibility('hidden');
    await act(async () => { await mutation.result.current.mutateAsync({ roomId: room.roomId, pinned }); });
    expect(result.current.list.data?.items[0]?.pinned).toBe(!pinned);
    expect(result.current.detail.data?.me.pinned).toBe(!pinned);
    readQueries.length = 0;

    // When: tab B returns, without invalidation from tab A or a page reload.
    await switchVisibility('visible');

    // Then: all active chat surfaces expose the persisted pin or unpin value.
    await waitFor(() => {
      expect(result.current.list.data?.items[0]?.pinned).toBe(pinned);
      expect(result.current.filtered.data?.items[0]?.pinned).toBe(pinned);
      expect(result.current.detail.data?.me.pinned).toBe(pinned);
    });
    expect(readQueries).toContain('');
    expect(readQueries).toContain('?roomType=team&status=active&limit=50');
  });
});

describe('chat tab return guards and errors', () => {
  it('keeps the home caller\'s fresh default list on return without a forced request', async () => {
    // Given: home uses the shared list hook without opting into chat focus refresh.
    const tab = createTab();
    const { result } = renderHook(() => useV1ChatRooms({ enabled: true }), { wrapper: tab.wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await switchVisibility('hidden');
    readsFail = true;
    readQueries.length = 0;

    // When: home returns while a fresh cached list exists and the API is unavailable.
    await switchVisibility('visible');
    await waitFor(() => expect(tab.client.isFetching()).toBe(0));

    // Then: the default caller keeps its successful cache and sends no forced request.
    expect(readQueries).toEqual([]);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data?.items[0]?.title).toBe(room.title);
  });

  it('keeps signed-out lists and missing-room details idle on return', async () => {
    // Given: the viewer is signed out and there is no room context.
    const { result } = renderHook(() => ({
      list: useV1ChatRooms({ enabled: false, refetchOnWindowFocus: 'always' }), detail: useV1ChatRoom(''),
    }), { wrapper: createTab().wrapper });
    await switchVisibility('hidden');

    // When: the viewer returns to the tab.
    await switchVisibility('visible');

    // Then: protected queries remain disabled and no chat request is sent.
    expect(result.current.list.fetchStatus).toBe('idle');
    expect(result.current.detail.fetchStatus).toBe('idle');
    expect(result.current.list.data).toBeUndefined();
    expect(result.current.detail.data).toBeUndefined();
    expect(readQueries).toEqual([]);
  });

  it('exposes refetch failures without inventing a successful pin update', async () => {
    // Given: a fresh original state is cached, then the server becomes unavailable.
    const { result } = renderHook(() => ({
      list: useV1ChatRooms({ refetchOnWindowFocus: 'always' }), detail: useV1ChatRoom(room.roomId),
    }), { wrapper: createTab().wrapper });
    await waitFor(() => {
      expect(result.current.list.isSuccess).toBe(true);
      expect(result.current.detail.isSuccess).toBe(true);
    });
    await switchVisibility('hidden');
    serverPinned = true;
    readsFail = true;

    // When: the viewer returns and the refresh fails.
    await switchVisibility('visible');

    // Then: the actual failure is visible and the cached pin remains unchanged.
    await waitFor(() => {
      expect(result.current.list.isRefetchError).toBe(true);
      expect(result.current.detail.isRefetchError).toBe(true);
    });
    expect(result.current.list.error).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(result.current.detail.error).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(result.current.list.data?.items[0]?.pinned).toBe(false);
    expect(result.current.detail.data?.me.pinned).toBe(false);
  });
});
