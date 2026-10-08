import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import type { V1ChatRoom, V1Home } from '@/types/api';
import { HomePageClient } from './home-client';

const socket = vi.hoisted(() => ({
  listeners: new Map<string, Set<(payload: unknown) => void>>(),
  connections: vi.fn(),
}));
vi.mock('@/lib/v1-socket', () => ({
  getV1Socket: () => {
    socket.connections();
    return {
      on: (event: string, listener: (payload: unknown) => void) => {
        const listeners = socket.listeners.get(event) ?? new Set();
        listeners.add(listener);
        socket.listeners.set(event, listeners);
      },
      off: (event: string, listener: (payload: unknown) => void) => socket.listeners.get(event)?.delete(listener),
    };
  },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/home', useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));
// Unrelated banners do not own the home or chat HTTP/query contract under test.
vi.mock('./use-record-consent-nudge', () => ({ useRecordConsentNudge: () => undefined }));
vi.mock('@/components/lineup/lineup-todo-card', () => ({ LineupTodoCard: () => null }));
vi.mock('@/components/tournaments/pending-review-card', () => ({
  PendingReviewsCard: () => null, usePendingReviewsSummary: () => ({ total: 0 }),
}));

const timestamp = '2026-10-08T10:00:00.000Z';
const pageInfo = { nextCursor: null, hasNext: false };
const signedInHome: V1Home = {
  viewer: { authenticated: true, displayName: '동기화 테스터', onboardingStatus: 'completed' },
};
const signedOutHome: V1Home = {
  viewer: { authenticated: false, displayName: null, onboardingStatus: null },
};
let home: V1Home;
let room: V1ChatRoom;
let listReads = 0;
const clients: QueryClient[] = [];
function success(data: unknown) {
  return HttpResponse.json({ status: 'success', data, timestamp });
}
const server = setupServer(
  http.get('*/api/v1/home', () => success(home)),
  http.get('*/api/v1/auth/me', () => success({
    user: { id: 'user-a', email: 'user-a@example.com', onboardingStatus: 'completed' },
    profile: { displayName: '동기화 테스터' },
    verification: { emailVerified: true, phoneVerified: true },
  })),
  http.get('*/api/v1/chat/rooms', () => {
    listReads += 1;
    return success({ items: [room], pageInfo });
  }),
  http.get('*/api/v1/tournaments', () => success({ items: [], pageInfo })),
  http.get('*/api/v1/league-matches', () => success({ items: [], pageInfo })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  home = signedInHome;
  listReads = 0;
  room = {
    roomId: 'room-1', roomType: 'team', title: '동기화 팀', status: 'active',
    linkedTarget: { type: 'team', id: 'team-1', title: '동기화 팀', route: '/teams/team-1' },
    linkedTargetCancelled: false, teamContact: null, pinned: false, muted: false, unreadCount: 1,
    lastMessage: { messageId: 'msg-old', contentPreview: '이전 홈 미리보기', sentAt: timestamp },
  };
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  socket.listeners.clear();
  socket.connections.mockClear();
  server.resetHandlers();
  vi.unstubAllEnvs();
});
function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><HomePageClient /></QueryClientProvider>);
  return { client, ...view };
}
function emitMessage() {
  act(() => {
    for (const listener of socket.listeners.get('chat:message') ?? []) {
      listener({ roomId: 'room-1', messageId: 'msg-new', senderUserId: 'user-a' });
    }
  });
}

describe('HomePageClient 실제 최근 채팅 HTTP 소비자', () => {
  it('메시지 이벤트만으로 실제 미리보기와 읽지 않은 총계를 갱신하고 구독을 정리한다', async () => {
    // Given the real home page has hydrated its authenticated HTTP response and chat list.
    const { client, unmount } = renderHome();
    await screen.findByText('이전 홈 미리보기');
    expect(screen.getByText('읽지 않은 메시지 1개')).toBeInTheDocument();
    room = { ...room, unreadCount: 2,
      lastMessage: { messageId: 'msg-new', contentPreview: '다른 탭에서 갱신한 홈 메시지', sentAt: timestamp } };
    // When the same-account event arrives, without notification:new or navigation.
    emitMessage();
    // Then real query hooks render new HTTP data in both home chat surfaces.
    expect(await screen.findByText('다른 탭에서 갱신한 홈 메시지')).toBeInTheDocument();
    expect(screen.getByText('읽지 않은 메시지 2개')).toBeInTheDocument();
    expect(listReads).toBe(2);
    act(() => client.setQueryData(v1Keys.home(), signedOutHome));
    await screen.findByText('로그인하면 매치와 팀 채팅을 이어볼 수 있어요.');
    expect(socket.listeners.get('chat:message')?.size ?? 0).toBe(0);
    unmount();
    expect(socket.listeners.get('chat:message')?.size ?? 0).toBe(0);
  });

  it('비로그인 홈은 socket을 만들지 않고 인증된 HTTP 상태로 바뀐 뒤에만 구독한다', async () => {
    // Given an anonymous page consumes the actual signed-out home HTTP contract.
    home = signedOutHome;
    const { client } = renderHome();
    await screen.findByText('로그인하면 매치와 팀 채팅을 이어볼 수 있어요.');
    expect(socket.connections).not.toHaveBeenCalled();
    expect(listReads).toBe(0);
    // When the authenticated home response is hydrated in the existing query cache.
    act(() => client.setQueryData(v1Keys.home(), signedInHome));
    // Then the actual list loads and only that session mounts the message listener.
    await screen.findByText('이전 홈 미리보기');
    await waitFor(() => expect(socket.listeners.get('chat:message')?.size).toBe(1));
    expect(socket.connections).toHaveBeenCalledTimes(1);
    expect(listReads).toBe(1);
  });
});
