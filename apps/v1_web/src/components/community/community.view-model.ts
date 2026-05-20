import type { ChatListViewModel, ChatRoomViewModel, NotificationsViewModel } from './community.types';

const rooms = [
  { id: 'room-1', title: '성수 러너스 FC', type: '팀' as const, href: '/teams/team-1', last: '이번 주 정기전 참석 가능하신가요?', time: '2분 전', unread: 3, pinned: true, initials: '성' },
  { id: 'room-2', title: '주말 풋살 매치', type: '개인매치' as const, href: '/matches/match-1', last: '참가 승인 완료됐습니다.', time: '18분 전', unread: 1, initials: '풋' },
  { id: 'room-3', title: '마포 배드민턴 팀매치', type: '팀매치' as const, href: '/team-matches/team-match-1', last: '상대팀 유니폼은 흰색입니다.', time: '어제', unread: 0, initials: '마' },
  { id: 'room-4', title: '강동 위클리 풋살', type: '팀' as const, href: '/teams/team-1', last: '새 멤버 신청이 들어왔어요.', time: '2일 전', unread: 0, initials: '강' },
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
      title: '개인매치 상세조회',
      sub: '카테고리에 맞는 맥락 바로가기 박스를 상단에 고정합니다.',
      href: '/matches/match-1',
    },
    messages: [
      { id: 'm1', who: 'other', label: '상대', body: '오늘 14:00 경기 인원 확인 부탁드려요.' },
      { id: 'm2', who: 'me', label: '나', body: '네. 20분 전에 도착하겠습니다.' },
      { id: 'm3', who: 'other', label: '상대', body: '참가 승인 완료했습니다. 현장 준비 내용도 확인했어요.' },
      { id: 'm4', who: 'system', label: '시스템', body: '수아님이 참가 승인되었습니다.' },
    ],
  };
}

export function getNotificationsViewModel(readAll = false): NotificationsViewModel {
  const notifications = [
    { id: 'n1', group: '오늘' as const, title: '매치 참가 확정', body: '성수 풋살파크 · 10명 · 현장 준비 필요', time: '방금 전', unread: !readAll, href: '/matches/match-1', actionLabel: '매치 보기' },
    { id: 'n2', group: '오늘' as const, title: '팀 초대', body: '성수 러너스 FC · 풋살 · 신입 환영', time: '10분 전', unread: !readAll, href: '/teams/team-1', actionLabel: '팀 보기' },
    { id: 'n3', group: '어제' as const, title: '리뷰 요청', body: '지난 경기 후기를 남겨주세요', time: '어제', unread: false, href: '/my', actionLabel: '리뷰 확인' },
    { id: 'n4', group: '어제' as const, title: '새 메시지', body: '강동 위클리 풋살에서 메시지를 보냈어요.', time: '어제', unread: false, href: '/chat/room-1', actionLabel: '채팅 열기' },
  ];

  return {
    unreadCount: notifications.filter((notification) => notification.unread).length,
    notifications,
  };
}
