import type { ChatRoom, ChatMessage } from '@/types/api';

export const mockChatRoom: ChatRoom = {
  id: 'room-1',
  name: '팀 매치 채팅',
  type: 'team_match',
  lastMessage: '안녕하세요!',
  lastMessageAt: '2024-01-05T10:00:00.000Z',
  unreadCount: 2,
};

export const mockDirectChatRoom: ChatRoom = {
  id: 'room-2',
  name: '1:1 채팅',
  type: 'direct',
  lastMessage: '네 알겠습니다',
  lastMessageAt: '2024-01-04T09:00:00.000Z',
  unreadCount: 0,
};

export const mockChatMessage: ChatMessage = {
  id: 'msg-1',
  roomId: 'room-1',
  senderId: 'user-1',
  content: '안녕하세요!',
  createdAt: '2024-01-05T10:00:00.000Z',
  sender: { id: 'user-1', nickname: '테스트유저', profileImageUrl: null },
};
