/**
 * 컨택 응답(수락/거절/철회) 뒤 상태 카드·입력 잠금·목록 배지·대기 건수가 30초 stale 로 남지 않는지
 * 못박는다. 서버가 `chatRoomId: null` 을 돌려주는 레거시 경로에서도 지금 보고 있는 방이
 * 갱신돼야 한다(후속 리뷰 Important 2·3) — `chatRooms()` 접두사 무효화가 방·메시지까지 덮는다. 무효화 호출을 세지 않고 **v1Get 이 다시
 * 불리는지**를 본다 — 키를 틀리게 넘겨도 호출 수 세기는 통과하기 때문이다.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { v1Get, v1Patch, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Patch: vi.fn(), v1Post: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get, v1Patch, v1Post };
});

import {
  useV1AcceptTeamContact,
  useV1ChatRoom,
  useV1ChatRooms,
  useV1DeclineTeamContact,
  useV1TeamContactSummary,
  useV1WithdrawTeamContact,
} from './use-v1-api';

const ROOM = 'room-1';
const CONTACT = 'contact-1';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function fetchCount(path: string) {
  return v1Get.mock.calls.filter(([p]) => p === path).length;
}

describe('컨택 응답 뒤 캐시 갱신', () => {
  beforeEach(() => {
    v1Get.mockReset(); v1Patch.mockReset(); v1Post.mockReset();
    v1Get.mockImplementation(async (path: string) => {
      if (path === `/chat/rooms/${ROOM}`) return { roomId: ROOM, teamContact: null };
      if (path === '/chat/rooms') return { items: [], pageInfo: { nextCursor: null, hasNext: false } };
      if (path === '/me/team-contacts/summary') return { pendingInbound: 1, byTeam: [] };
      return {};
    });
  });

  it.each([
    ['수락', () => useV1AcceptTeamContact(CONTACT), v1Patch],
    ['거절', () => useV1DeclineTeamContact(CONTACT), v1Patch],
    ['철회', () => useV1WithdrawTeamContact(CONTACT), v1Post],
  ] as const)('%s — 서버가 chatRoomId 를 비워도 방·목록·대기 건수를 다시 불러온다', async (_label, useAction, transport) => {
    transport.mockResolvedValue({ contact: { id: CONTACT }, alreadyProcessed: false, chatRoomId: null });
    const { result } = renderHook(
      () => ({ room: useV1ChatRoom(ROOM), rooms: useV1ChatRooms(), summary: useV1TeamContactSummary(), action: useAction() }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(fetchCount(`/chat/rooms/${ROOM}`)).toBe(1));
    await waitFor(() => expect(fetchCount('/me/team-contacts/summary')).toBe(1));

    (result.current.action as { mutate: (v?: unknown) => void }).mutate({});

    await waitFor(() => expect(result.current.action.isSuccess).toBe(true));
    // 최소 한 번은 다시 불려야 한다(정확히 몇 번인지는 React Query 의 중복 제거 타이밍에 달렸다).
    await waitFor(() => expect(fetchCount(`/chat/rooms/${ROOM}`)).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(fetchCount('/chat/rooms')).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(fetchCount('/me/team-contacts/summary')).toBeGreaterThanOrEqual(2));
  });
});
