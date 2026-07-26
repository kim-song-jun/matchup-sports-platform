import type { ChatListViewModel, ChatRoomModel, ChatRoomViewModel } from './community.types';

const CHAT_AVATARS = {
  개인매치: '/mock/profile/profile-01.svg',
  팀매치: '/mock/profile/profile-03.svg',
  팀: '/mock/profile/profile-02.svg',
} satisfies Record<ChatRoomModel['type'], string>;

// Loading-state placeholder rooms — shown only until useV1ChatRooms resolves.
// hrefs point to real list pages, never to mock detail ids: a mock id like
// `/teams/team-1` 404s (the detail page fetches real data) and Next prefetches
// it on render, spamming the console.
const rooms: ChatRoomModel[] = [
  { id: 'chat-match-1', title: '성수 풋살 5:5', type: '개인매치' as const, href: '/matches', last: '오늘 경기 준비물 확인해 주세요', time: '2분 전', unread: 2, pinned: true, initials: '성', avatarUrl: CHAT_AVATARS.개인매치 },
  { id: 'chat-match-2', title: '강동 러닝 번개', type: '개인매치' as const, href: '/matches', last: '나: 10분 전에 도착할게요', time: '18분 전', unread: 0, initials: '강', avatarUrl: CHAT_AVATARS.개인매치 },
  { id: 'chat-team-1', title: '성수 러너스 FC', type: '팀' as const, href: '/teams', last: '새 멤버 신청이 들어왔어요', time: '32분 전', unread: 4, initials: '성', avatarUrl: CHAT_AVATARS.팀 },
  { id: 'chat-team-2', title: '강동 위클리 풋살', type: '팀' as const, href: '/teams', last: '나: 회비 공지 올려둘게요', time: '어제', unread: 0, initials: '강', avatarUrl: CHAT_AVATARS.팀 },
  { id: 'chat-team-match-1', title: '마포 FC 팀매치', type: '팀매치' as const, href: '/team-matches', last: '상대팀 유니폼은 흰색입니다', time: '어제', unread: 1, initials: '마', avatarUrl: CHAT_AVATARS.팀매치 },
  { id: 'chat-team-match-2', title: '잠실 교환매치', type: '팀매치' as const, href: '/team-matches', last: '나: 심판 섭외는 제가 할게요', time: '2일 전', unread: 0, initials: '잠', avatarUrl: CHAT_AVATARS.팀매치 },
];

export function getChatListViewModel(): ChatListViewModel {
  return {
    categories: [
      { label: '전체', count: rooms.length, active: true },
      { label: '개인매치', count: rooms.filter((room) => room.type === '개인매치').length },
      { label: '팀매치', count: rooms.filter((room) => room.type === '팀매치').length },
      { label: '팀', count: rooms.filter((room) => room.type === '팀').length },
    ],
    pinnedRooms: rooms.filter((room) => room.pinned),
    rooms: rooms.filter((room) => !room.pinned),
  };
}

export function getChatRoomViewModel(): ChatRoomViewModel {
  return {
    title: '주말 풋살 매치',
    context: {
      title: '개인매치 상세',
      sub: '이 채팅방과 연결된 개인매치예요',
      href: '/matches',
    },
    messages: [
      { id: 'm1', who: 'other', senderId: 'user-opponent', label: '상대', body: '오늘 14:00 경기 인원 확인해 주세요', sentAt: '2026-05-17T04:55:00.000Z' },
      { id: 'm2', who: 'me', senderId: 'user-me', label: '나', body: '네. 20분 전에 도착하겠습니다.', sentAt: '2026-05-17T05:00:00.000Z', unreadCount: 1 },
      { id: 'm3', who: 'other', senderId: 'user-opponent', label: '상대', body: '참가가 승인됐어요. 현장 준비 내용도 확인해 주세요.', sentAt: '2026-05-18T03:00:00.000Z' },
      { id: 'm4', who: 'system', senderId: 'system', label: '시스템', body: '수아님이 참가 승인됐어요', sentAt: '2026-05-18T03:01:00.000Z' },
    ],
  };
}
