import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatListPageClient, ChatRoomPageClient } from '@/components/community/community-api-clients';
import { createV1QueryClient } from '@/lib/query-client';
import type { V1ChatRoomDetail } from '@/types/api';
import {
  api, archived, deferredMatchCategoryHandler, failedRead, matchRoom, message, messages, room,
} from './use-v1-api.chat-refresh-consumer.fixtures';

const navigation = vi.hoisted(() => ({ search: '', pathname: '/chat' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
// Keep real query and consumer hooks; only the external socket connection is replaced.
vi.mock('@/lib/v1-socket', () => ({ getV1Socket: () => ({ on: vi.fn(), off: vi.fn() }) }));

type FailedSurface = 'base' | 'filtered' | 'lists' | 'archived' | 'detail' | 'denied' | null;
let failedSurface: FailedSurface = null;
let serverPinned = false;
let serverTitle = room.title;
let visibility: DocumentVisibilityState = 'visible';
let resizeThread = () => {};
let holdFiltered = false;
let releaseFiltered: (() => void) | undefined;
const reads = { active: 0, archived: 0, base: 0, filtered: 0 };
const clients: ReturnType<typeof createV1QueryClient>[] = [];

const server = setupServer(
  http.get(`${api}/chat/rooms`, async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const isArchived = params.get('status') === 'archived';
    const type = params.get('roomType');
    if (isArchived) reads.archived += 1; else reads.active += 1;
    if (!type) reads.base += 1; else if (type === 'team') reads.filtered += 1;
    if (type === 'team' && holdFiltered) await new Promise<void>((resolve) => { releaseFiltered = resolve; });
    if ((failedSurface === 'base' && !type)
      || (failedSurface === 'filtered' && type === 'team')
      || (failedSurface === 'lists' && !isArchived)
      || (failedSurface === 'archived' && isArchived)) return failedRead();
    const items = isArchived
      ? [{ ...archived, title: `${serverTitle} 종료된 컨택`, pinned: serverPinned }]
      : type === 'team_contact' ? [] : [{ ...room, title: serverTitle, pinned: serverPinned }];
    return HttpResponse.json({ status: 'success', data: {
      items, nextCursor: null, pageInfo: { hasNext: false, nextCursor: null },
    } });
  }),
  http.get(`${api}/chat/rooms/room-1`, () => {
    if (failedSurface === 'detail' || failedSurface === 'denied') return failedRead(failedSurface === 'denied');
    const data: V1ChatRoomDetail = {
      roomId: room.roomId, roomType: room.roomType, title: serverTitle, status: room.status,
      teamContact: room.teamContact, linkedTarget: room.linkedTarget,
      me: { participantId: 'participant-1', status: 'active', pinned: serverPinned,
        mutedUntil: null, lastReadMessageId: message.messageId }, participants: [],
    };
    return HttpResponse.json({ status: 'success', data });
  }),
  http.get(`${api}/chat/rooms/room-1/messages`, () => HttpResponse.json({ status: 'success', data: {
    items: messages, nextCursor: null, pageInfo: { hasNext: false, nextCursor: null },
  } })),
  http.patch(`${api}/chat/rooms/room-1/me`, () => HttpResponse.json({ status: 'success', data: {
    roomId: room.roomId, pinned: serverPinned, mutedUntil: null,
    lastReadMessageId: message.messageId, status: 'active',
  } })),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

function renderConsumer(children: ReactNode) {
  const client = createV1QueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, staleTime: Infinity, retry: false } });
  clients.push(client);
  return { ...render(<QueryClientProvider client={client}>{children}</QueryClientProvider>), client };
}

async function switchVisibility(next: DocumentVisibilityState) {
  visibility = next;
  await act(async () => { window.dispatchEvent(new Event('visibilitychange')); });
}

function mobilePane(container: HTMLElement) {
  const pane = container.querySelector<HTMLElement>('.tm-chat-mobile-pane');
  if (!pane) throw new Error('Chat list mobile pane is missing');
  return within(pane);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  failedSurface = null;
  serverPinned = false;
  serverTitle = room.title;
  visibility = 'visible';
  resizeThread = () => {};
  holdFiltered = false;
  releaseFiltered = undefined;
  reads.active = reads.archived = reads.base = reads.filtered = 0;
  navigation.search = '';
  navigation.pathname = '/chat';
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  // jsdom has no layout observer; deliver its browser callback explicitly.
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeThread = callback; }
    observe() {}
    disconnect() {}
  });
  focusManager.setFocused(undefined);
});
afterEach(() => {
  releaseFiltered?.();
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});
afterAll(() => server.close());

describe('chat list refresh failure with cached rooms', () => {
  it.each((['base', 'filtered', 'archived'] as const).flatMap((surface) => ['visibilitychange', 'focus'].map((event) => ({ surface, event }))))(
    'shows and retries a failed $surface list on $event return', async ({ surface, event }) => {
    // Given: the real consumer has loaded an ordinary, filtered or archived list.
    if (surface === 'archived') navigation.search = 'category=team_contact';
    const { container, client } = renderConsumer(<ChatListPageClient />);
    const pane = mobilePane(container);
    if (surface === 'filtered') fireEvent.click(pane.getByRole('button', { name: /^팀(?: \d+)?$/ }));
    if (surface === 'archived') fireEvent.click(pane.getByRole('button', { name: '종료된 컨택 보기' }));
    await waitFor(() => expect(pane.getByText(surface === 'archived' ? `${room.title} 종료된 컨택` : room.title)).toBeVisible());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    if (event === 'focus') await act(async () => { window.dispatchEvent(new Event('blur')); }); else await switchVisibility('hidden');
    failedSurface = surface;
    serverPinned = true;
    serverTitle = '최신 팀';

    // When: return refresh fails while the old room cache is still populated.
    if (event === 'focus') await act(async () => { window.dispatchEvent(new Event('focus')); }); else await switchVisibility('visible');

    // Then: the failure and real retry action stay visible next to cached content.
    await waitFor(() => expect(pane.getByRole('alert')).toHaveTextContent('불러오지 못했어요'));
    if (surface === 'archived') {
      expect(pane.queryByText('채팅방을 불러오지 못했어요')).not.toBeInTheDocument();
      expect(pane.getByRole('alert')).toHaveTextContent('종료된 컨택을 불러오지 못했어요');
      expect(pane.getAllByText(/^종료된 컨택을 불러오지 못했어요\.?$/)).toHaveLength(1);
    }
    const activeReads = reads.active;
    const retry = pane.getByRole('button', { name: '다시 불러오기' });
    failedSurface = null;
    fireEvent.click(retry);
    await waitFor(() => {
      expect(pane.queryByRole('alert')).not.toBeInTheDocument();
      expect(pane.getByText(surface === 'archived' ? '최신 팀 종료된 컨택' : '최신 팀')).toBeVisible();
      if (surface !== 'archived') expect(pane.getByText('고정 1')).toBeVisible();
    });
    if (surface === 'archived') expect(reads.active).toBe(activeReads);
  });

  it('recovers both failed list requests before switching from a retried category to all rooms', async () => {
    // Given: both the ordinary list and the selected category have populated caches.
    const { container, client } = renderConsumer(<ChatListPageClient />);
    const pane = mobilePane(container);
    await waitFor(() => expect(pane.getByText(room.title)).toBeVisible());
    fireEvent.click(pane.getByRole('button', { name: /^팀(?: \d+)?$/ }));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const initialReads = { base: reads.base, filtered: reads.filtered };
    await switchVisibility('hidden');
    failedSurface = 'lists';
    serverTitle = '최신 팀';

    // When: focus refresh fails for both lists, then the selected category is retried.
    await switchVisibility('visible');
    await waitFor(() => expect(pane.getByRole('alert')).toHaveTextContent('채팅방을 불러오지 못했어요'));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(reads.base).toBeGreaterThan(initialReads.base);
    expect(reads.filtered).toBeGreaterThan(initialReads.filtered);
    failedSurface = null;
    fireEvent.click(pane.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(pane.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(client.isFetching()).toBe(0));

    // Then: switching to all rooms also exposes the recovered server list without another error.
    fireEvent.click(pane.getByRole('button', { name: /^전체(?: \d+)?$/ }));
    expect(pane.queryByRole('alert')).not.toBeInTheDocument();
    expect(pane.getByText('최신 팀')).toBeVisible();
  });

  it('waits for a category outside the cached first page without showing a false empty state or CTA', async () => {
    // Given: the first 50 rooms are teams, while a match room exists beyond that page.
    server.use(deferredMatchCategoryHandler((release) => { releaseFiltered = release; }));
    const { container, client } = renderConsumer(<ChatListPageClient />);
    const pane = mobilePane(container);
    await waitFor(() => expect(pane.getByRole('button', { name: '전체 50' })).toBeVisible());
    await waitFor(() => expect(client.isFetching()).toBe(0));

    // When: the category's first actual HTTP response remains pending without fallback rows.
    fireEvent.click(pane.getByRole('button', { name: /^개인매치(?: \d+)?$/ }));
    await waitFor(() => expect(releaseFiltered).toBeTypeOf('function'));

    // Then: the list stays undecided until the server returns its real category rows.
    expect(pane.queryByText('개인매치 채팅방이 없어요')).not.toBeInTheDocument();
    expect(pane.queryByRole('link', { name: '매치 찾아보기' })).not.toBeInTheDocument();
    await act(async () => { releaseFiltered?.(); });
    await waitFor(() => expect(pane.getByText(matchRoom.title)).toBeVisible());
    expect(pane.queryByText('개인매치 채팅방이 없어요')).not.toBeInTheDocument();
    expect(pane.queryByRole('link', { name: '매치 찾아보기' })).not.toBeInTheDocument();
  });

  it('keeps cached fallback rows without stacking a skeleton during a delayed new filter load', async () => {
    // Given: the ordinary list is cached, but this category has never loaded.
    const { container, client } = renderConsumer(<ChatListPageClient />);
    const pane = mobilePane(container);
    await waitFor(() => expect(pane.getByText(room.title)).toBeVisible());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    holdFiltered = true;

    // When: the category request is held at the HTTP boundary.
    fireEvent.click(pane.getByRole('button', { name: /^팀(?: \d+)?$/ }));
    await waitFor(() => expect(releaseFiltered).toBeTypeOf('function'));

    // Then: cached rows remain available with no second skeleton layout above them.
    expect(pane.getByText(room.title)).toBeVisible();
    expect(container.querySelector('.tm-chat-mobile-pane .tm-skeleton-page')).not.toBeInTheDocument();
    await act(async () => { releaseFiltered?.(); });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(pane.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('chat detail refresh failure with cached messages', () => {
  it.each(['visibilitychange', 'focus'])('offers retry and restores the composer only after a successful %s refresh', async (event) => {
    // Given: the real room consumer has loaded a message and an enabled composer.
    navigation.pathname = '/chat/room-1';
    const { container, client } = renderConsumer(<ChatRoomPageClient roomId={room.roomId} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '메시지 입력' })).toBeEnabled());
    await waitFor(() => {
      expect(client.isFetching()).toBe(0);
      expect(client.isMutating()).toBe(0);
    });
    expect(screen.getByText(message.content ?? '')).toBeVisible();
    const thread = container.querySelector<HTMLElement>('.tm-chat-thread');
    if (!thread) throw new Error('Chat thread is missing');
    // jsdom has no geometry: represent a long, already scrolled cached thread.
    Object.defineProperty(thread, 'scrollHeight', { configurable: true, value: 1000 });
    thread.scrollTop = 850;
    if (event === 'focus') await act(async () => { window.dispatchEvent(new Event('blur')); }); else await switchVisibility('hidden');
    failedSurface = 'detail';

    // When: the room detail refresh fails after returning to the tab.
    if (event === 'focus') await act(async () => { window.dispatchEvent(new Event('focus')); }); else await switchVisibility('visible');

    // Then: cached messages do not hide the error, and retry recovers real readiness.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('채팅방을 불러오지 못했어요'));
    expect(thread.scrollTop).toBe(0);
    act(() => resizeThread());
    expect(thread.scrollTop).toBe(0);
    expect(screen.getByRole('textbox', { name: '메시지 입력' })).toBeDisabled();
    failedSurface = null;
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: '메시지 입력' })).toBeEnabled();
    });
    fireEvent.change(screen.getByRole('textbox', { name: '메시지 입력' }), { target: { value: '입력 복구 확인' } });
    expect(screen.getByRole('button', { name: '전송' })).toBeEnabled();
  });

  it('shows a permission denial and a way out without suggesting a network retry', async () => {
    // Given: a previously loaded room's server-side access is later revoked.
    navigation.pathname = '/chat/room-1';
    const { client } = renderConsumer(<ChatRoomPageClient roomId={room.roomId} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '메시지 입력' })).toBeEnabled());
    await waitFor(() => {
      expect(client.isFetching()).toBe(0);
      expect(client.isMutating()).toBe(0);
    });
    await switchVisibility('hidden');
    failedSurface = 'denied';

    // When: the real API returns 403 to the focus refresh.
    await switchVisibility('visible');

    // Then: the permission explanation remains visible despite cached messages.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('참여 중인 멤버만 볼 수 있어요'));
    expect(screen.getByRole('textbox', { name: '메시지 입력' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '채팅 목록으로' })).toHaveAttribute('href', '/chat');
  });
});
