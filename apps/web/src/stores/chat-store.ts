import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  senderTeamName: string;
  message: string;
  timestamp: string;
  isSystem?: boolean;
  isRead?: boolean;
}

export interface ChatRoom {
  id: string;
  teamMatchId: string;
  matchTitle: string;
  matchDate: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

interface ChatState {
  chatRooms: ChatRoom[];
  messages: Record<string, ChatMessage[]>;
  currentUserId: string;
  currentUserName: string;
  currentTeamId: string;
  currentTeamName: string;
  sendMessage: (chatRoomId: string, message: string) => void;
  markAsRead: (chatRoomId: string) => void;
  getChatRooms: () => ChatRoom[];
  getChatMessages: (chatRoomId: string) => ChatMessage[];
  getTotalUnreadCount: () => number;
}

const MOCK_CHAT_ROOMS: ChatRoom[] = [
  {
    id: 'cr-1',
    teamMatchId: 'tm-101',
    matchTitle: '주말 친선 풋살 경기',
    matchDate: '2026-03-22',
    homeTeamId: 'team-a',
    homeTeamName: 'FC 번개',
    awayTeamId: 'team-b',
    awayTeamName: '올스타즈',
    lastMessage: '네 확인했습니다! 일찍 도착하겠습니다',
    lastMessageAt: '2026-03-19T14:30:00Z',
    unreadCount: 2,
  },
  {
    id: 'cr-2',
    teamMatchId: 'tm-102',
    matchTitle: '강남 축구 리그전',
    matchDate: '2026-03-29',
    homeTeamId: 'team-c',
    homeTeamName: '강남 유나이티드',
    awayTeamId: 'team-a',
    awayTeamName: 'FC 번개',
    lastMessage: '유니폼은 흰색으로 준비할게요',
    lastMessageAt: '2026-03-18T20:15:00Z',
    unreadCount: 0,
  },
  {
    id: 'cr-3',
    teamMatchId: 'tm-103',
    matchTitle: '송파 풋살 매치',
    matchDate: '2026-04-05',
    homeTeamId: 'team-a',
    homeTeamName: 'FC 번개',
    awayTeamId: 'team-d',
    awayTeamName: '드래곤 FC',
    lastMessage: '매칭이 성사되었습니다! 채팅으로 세부사항을 조율하세요.',
    lastMessageAt: '2026-03-17T10:00:00Z',
    unreadCount: 1,
  },
];

const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  'cr-1': [
    {
      id: 'msg-1-1',
      chatRoomId: 'cr-1',
      senderId: 'system',
      senderName: '시스템',
      senderTeamName: '',
      message: '매칭이 성사되었습니다! 채팅으로 세부사항을 조율하세요.',
      timestamp: '2026-03-18T09:00:00Z',
      isSystem: true, isRead: true,
    },
    {
      id: 'msg-1-2',
      chatRoomId: 'cr-1',
      senderId: 'user-a1',
      senderName: '김민수',
      senderTeamName: 'FC 번개',
      message: '안녕하세요! 매칭 감사합니다. 경기 관련해서 몇 가지 확인 부탁드립니다.',
      timestamp: '2026-03-18T09:05:00Z',
      isRead: true,
    },
    {
      id: 'msg-1-3',
      chatRoomId: 'cr-1',
      senderId: 'user-b1',
      senderName: '이준혁',
      senderTeamName: '올스타즈',
      message: '네 안녕하세요! 말씀해주세요.',
      timestamp: '2026-03-18T09:10:00Z',
      isRead: true,
    },
    {
      id: 'msg-1-4',
      chatRoomId: 'cr-1',
      senderId: 'user-a1',
      senderName: '김민수',
      senderTeamName: 'FC 번개',
      message: '유니폼 색상 어떻게 하실건가요? 저희는 파란색 유니폼입니다.',
      timestamp: '2026-03-18T09:12:00Z',
      isRead: true,
    },
    {
      id: 'msg-1-5',
      chatRoomId: 'cr-1',
      senderId: 'user-b1',
      senderName: '이준혁',
      senderTeamName: '올스타즈',
      message: '저희는 빨간색으로 갈게요. 겹치지 않아서 좋네요!',
      timestamp: '2026-03-18T09:15:00Z',
      isRead: true,
    },
    {
      id: 'msg-1-6',
      chatRoomId: 'cr-1',
      senderId: 'system',
      senderName: '시스템',
      senderTeamName: '',
      message: 'FC 번개 팀이 입금을 완료했습니다.',
      timestamp: '2026-03-19T10:00:00Z',
      isSystem: true, isRead: true,
    },
    {
      id: 'msg-1-7',
      chatRoomId: 'cr-1',
      senderId: 'user-b1',
      senderName: '이준혁',
      senderTeamName: '올스타즈',
      message: '저희도 곧 입금할게요. 주차장은 넉넉한가요?',
      timestamp: '2026-03-19T14:20:00Z',
      isRead: true,
    },
    {
      id: 'msg-1-8',
      chatRoomId: 'cr-1',
      senderId: 'user-a1',
      senderName: '김민수',
      senderTeamName: 'FC 번개',
      message: '네 확인했습니다! 일찍 도착하겠습니다',
      timestamp: '2026-03-19T14:30:00Z',
      isRead: false,
    },
  ],
  'cr-2': [
    {
      id: 'msg-2-1',
      chatRoomId: 'cr-2',
      senderId: 'system',
      senderName: '시스템',
      senderTeamName: '',
      message: '매칭이 성사되었습니다! 채팅으로 세부사항을 조율하세요.',
      timestamp: '2026-03-16T11:00:00Z',
      isSystem: true, isRead: true,
    },
    {
      id: 'msg-2-2',
      chatRoomId: 'cr-2',
      senderId: 'user-c1',
      senderName: '박서준',
      senderTeamName: '강남 유나이티드',
      message: '반갑습니다! 강남 유나이티드 주장 박서준입니다.',
      timestamp: '2026-03-16T11:30:00Z',
    },
    {
      id: 'msg-2-3',
      chatRoomId: 'cr-2',
      senderId: 'user-a1',
      senderName: '김민수',
      senderTeamName: 'FC 번개',
      message: '안녕하세요! 잘 부탁드립니다. 경기 장소 주차 관련해서 안내 부탁드립니다.',
      timestamp: '2026-03-16T12:00:00Z',
    },
    {
      id: 'msg-2-4',
      chatRoomId: 'cr-2',
      senderId: 'user-c1',
      senderName: '박서준',
      senderTeamName: '강남 유나이티드',
      message: '주차장 무료이고 50대 수용 가능합니다. 구장 바로 옆이에요.',
      timestamp: '2026-03-16T12:10:00Z',
    },
    {
      id: 'msg-2-5',
      chatRoomId: 'cr-2',
      senderId: 'user-a1',
      senderName: '김민수',
      senderTeamName: 'FC 번개',
      message: '감사합니다! 비용은 어떻게 정산하면 될까요?',
      timestamp: '2026-03-17T09:00:00Z',
    },
    {
      id: 'msg-2-6',
      chatRoomId: 'cr-2',
      senderId: 'user-c1',
      senderName: '박서준',
      senderTeamName: '강남 유나이티드',
      message: '앱에서 결제해주시면 됩니다. 그리고 유니폼은 흰색으로 준비할게요',
      timestamp: '2026-03-18T20:15:00Z',
    },
  ],
  'cr-3': [
    {
      id: 'msg-3-1',
      chatRoomId: 'cr-3',
      senderId: 'system',
      senderName: '시스템',
      senderTeamName: '',
      message: '매칭이 성사되었습니다! 채팅으로 세부사항을 조율하세요.',
      timestamp: '2026-03-17T10:00:00Z',
      isSystem: true, isRead: true,
    },
    {
      id: 'msg-3-2',
      chatRoomId: 'cr-3',
      senderId: 'user-d1',
      senderName: '정우진',
      senderTeamName: '드래곤 FC',
      message: '안녕하세요! 경기 기대됩니다.',
      timestamp: '2026-03-17T10:30:00Z',
    },
    {
      id: 'msg-3-3',
      chatRoomId: 'cr-3',
      senderId: 'user-a1',
      senderName: '김민수',
      senderTeamName: 'FC 번개',
      message: '반갑습니다! 송파 구장 처음인데 찾아가기 편한가요?',
      timestamp: '2026-03-17T10:45:00Z',
    },
    {
      id: 'msg-3-4',
      chatRoomId: 'cr-3',
      senderId: 'user-d1',
      senderName: '정우진',
      senderTeamName: '드래곤 FC',
      message: '8호선 송파역 2번 출구에서 도보 5분이에요. 경기 전에 위치 공유해드릴게요!',
      timestamp: '2026-03-17T11:00:00Z',
    },
    {
      id: 'msg-3-5',
      chatRoomId: 'cr-3',
      senderId: 'user-a1',
      senderName: '김민수',
      senderTeamName: 'FC 번개',
      message: '감사합니다! 그때 뵙겠습니다 👍',
      timestamp: '2026-03-17T11:05:00Z',
    },
  ],
};

const CURRENT_USER_ID = 'user-a1';
const CURRENT_USER_NAME = '김민수';
const CURRENT_TEAM_ID = 'team-a';
const CURRENT_TEAM_NAME = 'FC 번개';

export const useChatStore = create<ChatState>((set, get) => ({
  chatRooms: MOCK_CHAT_ROOMS,
  messages: MOCK_MESSAGES,
  currentUserId: CURRENT_USER_ID,
  currentUserName: CURRENT_USER_NAME,
  currentTeamId: CURRENT_TEAM_ID,
  currentTeamName: CURRENT_TEAM_NAME,

  sendMessage: (chatRoomId: string, message: string) => {
    const state = get();
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      chatRoomId,
      senderId: state.currentUserId,
      senderName: state.currentUserName,
      senderTeamName: state.currentTeamName,
      message,
      timestamp: new Date().toISOString(),
    };

    const roomMessages = state.messages[chatRoomId] ?? [];

    set({
      messages: {
        ...state.messages,
        [chatRoomId]: [...roomMessages, newMessage],
      },
      chatRooms: state.chatRooms.map((room) =>
        room.id === chatRoomId
          ? { ...room, lastMessage: message, lastMessageAt: newMessage.timestamp }
          : room,
      ),
    });
  },

  markAsRead: (chatRoomId: string) => {
    const state = get();
    set({
      chatRooms: state.chatRooms.map((room) =>
        room.id === chatRoomId ? { ...room, unreadCount: 0 } : room,
      ),
    });
  },

  getChatRooms: () => {
    const state = get();
    return [...state.chatRooms].sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  },

  getChatMessages: (chatRoomId: string) => {
    return get().messages[chatRoomId] ?? [];
  },

  getTotalUnreadCount: () => {
    return get().chatRooms.reduce((sum, room) => sum + room.unreadCount, 0);
  },
}));
