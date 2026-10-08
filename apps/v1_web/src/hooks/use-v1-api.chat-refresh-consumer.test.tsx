import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatListPageClient, ChatRoomPageClient } from '@/components/community/community-api-clients';
import { createV1QueryClient } from '@/lib/query-client';
import type { V1ChatMessage, V1ChatRoom, V1ChatRoomDetail } from '@/types/api';

const navigation = vi.hoisted(() => ({ search: '', pathname: '/chat' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
// Keep real query and consumer hooks; only the external socket connection is replaced.
vi.mock('@/lib/v1-socket', () => ({ getV1Socket: () => ({ on: vi.fn(), off: vi.fn() }) }));

const api = 'http://localhost/api/v1';
const room: V1ChatRoom = {
  roomId: 'room-1', roomType: 'team', title: '우리 팀', status: 'active',
  teamContact: null, linkedTarget: { type: 'team', id: 'team-1', title: '우리 팀', route: '/teams/team-1' },
  linkedTargetCancelled: false, lastMessage: null, unreadCount: 0, pinned: false, muted: false,
};
const archived: V1ChatRoom = {
  ...room, roomId: 'room-archived', roomType: 'team_contact', status: 'archived', title: '종료된 컨택',
  teamContact: {
    contactId: 'contact-1', status: 'withdrawn', expiresAt: '2026-10-01T00:00:00Z', declineReason: null,
    mySide: 'from', fromTeam: { id: 'team-1', name: '우리 팀' }, toTeam: { id: 'team-2', name: '상대 팀' },
  },
  linkedTarget: { type: 'team_contact', id: 'contact-1', title: '종료된 컨택', route: '/chat/room-archived' },
};
const message: V1ChatMessage = {
  messageId: 'message-1', sender: { userId: 'user-2', displayName: '팀원', profileImageUrl: null },
  content: '캐시에 남아 있는 대화', status: 'sent', sentAt: '2026-10-08T00:00:00Z', mine: false,
};
const messages = Array.from({ length: 20 }, (_, index) => ({
  ...message, messageId: `message-${index + 1}`,
  content: index === 0 ? message.content : `캐시 대화 ${index + 1}`,
}));
type FailedSurface = 'base' | 'filtered' | 'archived' | 'detail' | 'denied' | null;
let failedSurface: FailedSurface = null;
let serverPinned = false;
let serverTitle = room.title;
let visibility: DocumentVisibilityState = 'visible';
let resizeThread = () => {};
const clients: ReturnType<typeof createV1QueryClient>[] = [];

function failedRead(denied = false) {
  const statusCode = denied ? 403 : 503;
  return HttpResponse.json({
    status: 'error', statusCode, code: denied ? 'NOT_TEAM_MEMBER' : 'SERVICE_UNAVAILABLE',
    message: denied ? '팀 멤버만 볼 수 있어요.' : '채팅 정보를 불러오지 못했어요.',
  }, { status: statusCode });
}

const server = setupServer(
  http.get(`${api}/chat/rooms`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const isArchived = params.get('status') === 'archived';
    const type = params.get('roomType');
    if ((failedSurface === 'base' && !type)
      || (failedSurface === 'filtered' && type === 'team')
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
  it.each(['base', 'filtered', 'archived'] as const)('shows and retries a failed %s list on tab return', async (surface) => {
    // Given: the real consumer has loaded an ordinary, filtered or archived list.
    if (surface === 'archived') navigation.search = 'category=team_contact';
    const { container, client } = renderConsumer(<ChatListPageClient />);
    const pane = mobilePane(container);
    if (surface === 'filtered') fireEvent.click(pane.getByRole('button', { name: /^팀(?: \d+)?$/ }));
    if (surface === 'archived') fireEvent.click(pane.getByRole('button', { name: '종료된 컨택 보기' }));
    await waitFor(() => expect(pane.getByText(surface === 'archived' ? `${room.title} 종료된 컨택` : room.title)).toBeVisible());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await switchVisibility('hidden');
    failedSurface = surface;
    serverPinned = true;
    serverTitle = '최신 팀';

    // When: return refresh fails while the old room cache is still populated.
    await switchVisibility('visible');

    // Then: the failure and real retry action stay visible next to cached content.
    await waitFor(() => expect(pane.getByRole('alert')).toHaveTextContent('불러오지 못했어요'));
    const retry = pane.getByRole('button', { name: '다시 불러오기' });
    failedSurface = null;
    fireEvent.click(retry);
    await waitFor(() => {
      expect(pane.queryByRole('alert')).not.toBeInTheDocument();
      expect(pane.getByText(surface === 'archived' ? '최신 팀 종료된 컨택' : '최신 팀')).toBeVisible();
      if (surface !== 'archived') expect(pane.getByText('고정 1')).toBeVisible();
    });
  });
});

describe('chat detail refresh failure with cached messages', () => {
  it('offers retry and restores the composer only after a successful refresh', async () => {
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
    await switchVisibility('hidden');
    failedSurface = 'detail';

    // When: the room detail refresh fails after returning to the tab.
    await switchVisibility('visible');

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
