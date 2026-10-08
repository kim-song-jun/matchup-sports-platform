import { http, HttpResponse } from 'msw';
import type { V1ChatMessage, V1ChatRoom } from '@/types/api';

export const api = 'http://localhost/api/v1';
export const room: V1ChatRoom = {
  roomId: 'room-1', roomType: 'team', title: '우리 팀', status: 'active',
  teamContact: null, linkedTarget: { type: 'team', id: 'team-1', title: '우리 팀', route: '/teams/team-1' },
  linkedTargetCancelled: false, lastMessage: null, unreadCount: 0, pinned: false, muted: false,
};
export const archived: V1ChatRoom = {
  ...room, roomId: 'room-archived', roomType: 'team_contact', status: 'archived', title: '종료된 컨택',
  teamContact: {
    contactId: 'contact-1', status: 'withdrawn', expiresAt: '2026-10-01T00:00:00Z', declineReason: null,
    mySide: 'from', fromTeam: { id: 'team-1', name: '우리 팀' }, toTeam: { id: 'team-2', name: '상대 팀' },
  },
  linkedTarget: { type: 'team_contact', id: 'contact-1', title: '종료된 컨택', route: '/chat/room-archived' },
};
export const message: V1ChatMessage = {
  messageId: 'message-1', sender: { userId: 'user-2', displayName: '팀원', profileImageUrl: null },
  content: '캐시에 남아 있는 대화', status: 'sent', sentAt: '2026-10-08T00:00:00Z', mine: false,
};
export const messages = Array.from({ length: 20 }, (_, index) => ({
  ...message, messageId: `message-${index + 1}`,
  content: index === 0 ? message.content : `캐시 대화 ${index + 1}`,
}));

export function failedRead(denied = false) {
  const statusCode = denied ? 403 : 503;
  return HttpResponse.json({
    status: 'error', statusCode, code: denied ? 'NOT_TEAM_MEMBER' : 'SERVICE_UNAVAILABLE',
    message: denied ? '팀 멤버만 볼 수 있어요.' : '채팅 정보를 불러오지 못했어요.',
  }, { status: statusCode });
}

export const matchRoom: V1ChatRoom = {
  ...room, roomId: 'match-room', roomType: 'match', title: '첫 페이지 밖 개인매치',
  linkedTarget: { type: 'match', id: 'match-1', title: '첫 페이지 밖 개인매치', route: '/matches/match-1' },
};

export function deferredMatchCategoryHandler(onPending: (release: () => void) => void) {
  const firstPage = Array.from({ length: 50 }, (_, index) => ({ ...room, roomId: `team-${index}`, title: `캐시 팀 ${index}` }));
  return http.get(`${api}/chat/rooms`, async ({ request }) => {
    const filtered = new URL(request.url).searchParams.get('roomType') === 'match';
    if (filtered) await new Promise<void>((resolve) => { onPending(resolve); });
    const nextCursor = filtered ? null : 'next-page';
    return HttpResponse.json({ status: 'success', data: {
      items: filtered ? [matchRoom] : firstPage, nextCursor,
      pageInfo: { hasNext: !filtered, nextCursor },
    } });
  });
}
