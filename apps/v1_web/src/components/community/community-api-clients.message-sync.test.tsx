import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1ChatMessage, V1ChatRoom, V1ChatRoomDetail } from '@/types/api';
import { ChatListPageClient, ChatRoomPageClient } from './community-api-clients';

const socket = vi.hoisted(() => ({ listeners: new Map<string, Set<(payload: unknown) => void>>() }));
vi.mock('@/lib/v1-socket', () => ({
  getV1Socket: () => ({
    on: (event: string, listener: (payload: unknown) => void) => {
      const listeners = socket.listeners.get(event) ?? new Set();
      listeners.add(listener);
      socket.listeners.set(event, listeners);
    },
    off: (event: string, listener: (payload: unknown) => void) => socket.listeners.get(event)?.delete(listener),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/chat/room-1',
  useSearchParams: () => new URLSearchParams(),
}));

const linkedTarget = { type: 'team', id: 'team-1', title: '동기화 테스트 팀', route: '/teams/team-1' } as const;
const roomDetail: V1ChatRoomDetail = {
  roomId: 'room-1', roomType: 'team', title: '동기화 테스트 팀', status: 'active', teamContact: null,
  linkedTarget,
  me: { participantId: 'participant-a', status: 'active', pinned: false, mutedUntil: null, lastReadMessageId: null },
  participants: [{ userId: 'user-a', displayName: '나', role: 'owner' }],
};
function message(messageId: string, content: string): V1ChatMessage {
  return {
    messageId, content, sender: { userId: 'user-a', displayName: '나', profileImageUrl: null },
    messageType: 'text', mine: true, status: 'sent', sentAt: '2026-10-08T10:00:00.000Z', unreadCount: 0,
  };
}
let messages: V1ChatMessage[] = [];
let roomListRequests = 0;
const clients: QueryClient[] = [];
const timestamp = '2026-10-08T10:00:00.000Z';
const pageInfo = { nextCursor: null, hasNext: false };
function roomListItem(): V1ChatRoom {
  const last = messages.at(-1);
  return {
    roomId: 'room-1', roomType: 'team', title: roomDetail.title, status: 'active', linkedTarget,
    linkedTargetCancelled: false, teamContact: null, unreadCount: 0, pinned: false, muted: false,
    lastMessage: last ? { messageId: last.messageId, contentPreview: last.content ?? '', sentAt: last.sentAt } : null,
  };
}
const server = setupServer(
  http.get('*/api/v1/chat/rooms', () => {
    roomListRequests += 1;
    return HttpResponse.json({ status: 'success', data: { items: [roomListItem()], pageInfo }, timestamp });
  }),
  http.get('*/api/v1/chat/rooms/room-1', () => HttpResponse.json({ status: 'success', data: roomDetail, timestamp })),
  http.get('*/api/v1/chat/rooms/room-1/messages', () => HttpResponse.json({
    status: 'success', data: { items: [...messages].reverse(), pageInfo }, timestamp,
  })),
  http.patch('*/api/v1/chat/rooms/room-1/me', async ({ request }) => {
    const body = await request.json();
    const lastReadMessageId = typeof body === 'object' && body !== null && 'lastReadMessageId' in body
      ? body.lastReadMessageId : null;
    return HttpResponse.json({ status: 'success', data: {
      roomId: 'room-1', status: 'active', pinned: false, mutedUntil: null, lastReadMessageId,
    }, timestamp });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  messages = [message('msg-old', '이전 메시지')];
  roomListRequests = 0;
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  socket.listeners.clear();
  server.resetHandlers();
  vi.unstubAllEnvs();
});
function renderPage(page: 'list' | 'room') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>
    {page === 'list' ? <ChatListPageClient /> : <ChatRoomPageClient roomId="room-1" />}
  </QueryClientProvider>);
}
function emitSenderMessage() {
  act(() => {
    for (const listener of socket.listeners.get('chat:message') ?? []) {
      listener({ roomId: 'room-1', messageId: 'msg-new', senderUserId: 'user-a' });
    }
  });
}

describe('채팅 메시지 동기화 — 실제 화면·조회 훅·HTTP', () => {
  it('발신자 메시지 이벤트만으로 열려 있는 본문과 사이드 목록 미리보기를 함께 갱신한다', async () => {
    // Given the same account's other tab has loaded the old message and preview.
    renderPage('room');
    await waitFor(() => expect(screen.getAllByText('이전 메시지')).toHaveLength(2));
    messages.push(message('msg-new', '다른 탭에서 보낸 메시지'));
    // When the persisted sender event arrives, with no notification:new event.
    emitSenderMessage();
    // Then real HTTP responses update both surfaces.
    await waitFor(() => expect(screen.getAllByText('다른 탭에서 보낸 메시지')).toHaveLength(2));
    expect(within(screen.getByRole('complementary', { name: '채팅방 목록' })).getByText('다른 탭에서 보낸 메시지')).toBeInTheDocument();
  });

  it('단독 채팅 목록도 발신자 이벤트로 기존 미리보기를 갱신한다', async () => {
    // Given a standalone list with an already loaded preview.
    renderPage('list');
    await screen.findAllByText('이전 메시지');
    const initialRequests = roomListRequests;
    messages.push(message('msg-new', '목록에 갱신된 메시지'));
    // When only the sender's message event arrives.
    emitSenderMessage();
    // Then the mounted list consumes it and makes one HTTP refresh.
    expect(await screen.findAllByText('목록에 갱신된 메시지')).toHaveLength(2);
    expect(roomListRequests).toBe(initialRequests + 1);
  });

  it('팀 필터를 연 목록은 전체·필터 캐시를 각각 한 번 갱신한다', async () => {
    // Given both the base list and selected team list are active.
    renderPage('list');
    await screen.findAllByText('이전 메시지');
    fireEvent.click(screen.getAllByRole('button', { name: '팀' })[0]);
    await waitFor(() => expect(roomListRequests).toBe(2));
    messages.push(message('msg-new', '필터에도 갱신된 메시지'));
    // When the sender's message event arrives.
    emitSenderMessage();
    // Then both actual query variants refresh, without duplicate requests.
    expect(await screen.findAllByText('필터에도 갱신된 메시지')).toHaveLength(2);
    expect(roomListRequests).toBe(4);
  });
});
