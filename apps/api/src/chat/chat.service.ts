import { Injectable, NotFoundException } from '@nestjs/common';

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
  isSystem: boolean;
}

export interface ChatRoom {
  id: string;
  teamMatchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  createdAt: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

@Injectable()
export class ChatService {
  private rooms: ChatRoom[] = [
    {
      id: 'room-1',
      teamMatchId: 'tm-001',
      homeTeamId: 'team-001',
      awayTeamId: 'team-002',
      homeTeamName: 'FC 서울 유나이티드',
      awayTeamName: '강남 풋살클럽',
      createdAt: '2026-03-15T09:00:00Z',
      lastMessage: '경기장에서 뵙겠습니다!',
      lastMessageAt: '2026-03-20T14:30:00Z',
    },
    {
      id: 'room-2',
      teamMatchId: 'tm-002',
      homeTeamId: 'team-003',
      awayTeamId: 'team-004',
      homeTeamName: '판교 농구단',
      awayTeamName: '수원 슬래머즈',
      createdAt: '2026-03-16T10:00:00Z',
      lastMessage: '유니폼 색상 겹치는데 저희가 바꿀게요',
      lastMessageAt: '2026-03-20T16:00:00Z',
    },
    {
      id: 'room-3',
      teamMatchId: 'tm-003',
      homeTeamId: 'team-005',
      awayTeamId: 'team-006',
      homeTeamName: '홍대 배드민턴',
      awayTeamName: '마포 셔틀콕',
      createdAt: '2026-03-18T11:00:00Z',
      lastMessage: '셔틀콕은 저희가 준비할게요',
      lastMessageAt: '2026-03-21T09:15:00Z',
    },
  ];

  private messages: ChatMessage[] = [
    // Room 1 messages
    {
      id: 'msg-101',
      chatRoomId: 'room-1',
      senderId: 'system',
      senderName: '시스템',
      message: '채팅방이 생성되었습니다. FC 서울 유나이티드 vs 강남 풋살클럽',
      timestamp: '2026-03-15T09:00:00Z',
      isSystem: true,
    },
    {
      id: 'msg-102',
      chatRoomId: 'room-1',
      senderId: 'user-001',
      senderName: '김주장',
      message: '안녕하세요! 이번 주 토요일 경기 잘 부탁드립니다.',
      timestamp: '2026-03-18T10:00:00Z',
      isSystem: false,
    },
    {
      id: 'msg-103',
      chatRoomId: 'room-1',
      senderId: 'user-002',
      senderName: '이캡틴',
      message: '네 반갑습니다! 혹시 경기장 주차 가능한가요?',
      timestamp: '2026-03-18T10:05:00Z',
      isSystem: false,
    },
    {
      id: 'msg-104',
      chatRoomId: 'room-1',
      senderId: 'user-001',
      senderName: '김주장',
      message: '네 지하주차장 이용 가능합니다. 무료에요.',
      timestamp: '2026-03-18T10:10:00Z',
      isSystem: false,
    },
    {
      id: 'msg-105',
      chatRoomId: 'room-1',
      senderId: 'user-002',
      senderName: '이캡틴',
      message: '좋습니다! 저희 인원은 10명 확정입니다.',
      timestamp: '2026-03-19T08:00:00Z',
      isSystem: false,
    },
    {
      id: 'msg-106',
      chatRoomId: 'room-1',
      senderId: 'user-001',
      senderName: '김주장',
      message: '경기장에서 뵙겠습니다!',
      timestamp: '2026-03-20T14:30:00Z',
      isSystem: false,
    },
    // Room 2 messages
    {
      id: 'msg-201',
      chatRoomId: 'room-2',
      senderId: 'system',
      senderName: '시스템',
      message: '채팅방이 생성되었습니다. 판교 농구단 vs 수원 슬래머즈',
      timestamp: '2026-03-16T10:00:00Z',
      isSystem: true,
    },
    {
      id: 'msg-202',
      chatRoomId: 'room-2',
      senderId: 'user-003',
      senderName: '박가드',
      message: '안녕하세요, 이번 매치 관련해서 몇 가지 확인 부탁드려요.',
      timestamp: '2026-03-17T14:00:00Z',
      isSystem: false,
    },
    {
      id: 'msg-203',
      chatRoomId: 'room-2',
      senderId: 'user-004',
      senderName: '최센터',
      message: '네 말씀하세요!',
      timestamp: '2026-03-17T14:10:00Z',
      isSystem: false,
    },
    {
      id: 'msg-204',
      chatRoomId: 'room-2',
      senderId: 'user-003',
      senderName: '박가드',
      message: '심판은 어떻게 할까요? 저희 쪽에서 한 분 섭외 가능합니다.',
      timestamp: '2026-03-18T09:00:00Z',
      isSystem: false,
    },
    {
      id: 'msg-205',
      chatRoomId: 'room-2',
      senderId: 'user-004',
      senderName: '최센터',
      message: '좋습니다. 비용은 반반 할까요?',
      timestamp: '2026-03-18T09:30:00Z',
      isSystem: false,
    },
    {
      id: 'msg-206',
      chatRoomId: 'room-2',
      senderId: 'user-003',
      senderName: '박가드',
      message: '유니폼 색상 겹치는데 저희가 바꿀게요',
      timestamp: '2026-03-20T16:00:00Z',
      isSystem: false,
    },
    // Room 3 messages
    {
      id: 'msg-301',
      chatRoomId: 'room-3',
      senderId: 'system',
      senderName: '시스템',
      message: '채팅방이 생성되었습니다. 홍대 배드민턴 vs 마포 셔틀콕',
      timestamp: '2026-03-18T11:00:00Z',
      isSystem: true,
    },
    {
      id: 'msg-302',
      chatRoomId: 'room-3',
      senderId: 'user-005',
      senderName: '정스매시',
      message: '반갑습니다! 복식 위주로 진행할까요?',
      timestamp: '2026-03-19T10:00:00Z',
      isSystem: false,
    },
    {
      id: 'msg-303',
      chatRoomId: 'room-3',
      senderId: 'user-006',
      senderName: '한드롭',
      message: '네 복식으로 하면 좋을 것 같아요. 코트 4면 예약했습니다.',
      timestamp: '2026-03-19T10:15:00Z',
      isSystem: false,
    },
    {
      id: 'msg-304',
      chatRoomId: 'room-3',
      senderId: 'user-005',
      senderName: '정스매시',
      message: '혹시 셔틀콕은 어떤 걸로 쓸까요?',
      timestamp: '2026-03-20T11:00:00Z',
      isSystem: false,
    },
    {
      id: 'msg-305',
      chatRoomId: 'room-3',
      senderId: 'user-006',
      senderName: '한드롭',
      message: '요넥스 마비스로 준비하겠습니다.',
      timestamp: '2026-03-20T11:30:00Z',
      isSystem: false,
    },
    {
      id: 'msg-306',
      chatRoomId: 'room-3',
      senderId: 'user-006',
      senderName: '한드롭',
      message: '셔틀콕은 저희가 준비할게요',
      timestamp: '2026-03-21T09:15:00Z',
      isSystem: false,
    },
  ];

  private nextRoomId = 4;
  private nextMsgId = 400;

  getRooms(): ChatRoom[] {
    return this.rooms;
  }

  getMessages(roomId: string): ChatMessage[] {
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }
    return this.messages.filter((m) => m.chatRoomId === roomId);
  }

  sendMessage(
    roomId: string,
    senderId: string,
    message: string,
  ): ChatMessage {
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }

    const newMessage: ChatMessage = {
      id: `msg-${this.nextMsgId++}`,
      chatRoomId: roomId,
      senderId,
      senderName: '사용자',
      message,
      timestamp: new Date().toISOString(),
      isSystem: false,
    };

    this.messages.push(newMessage);
    room.lastMessage = message;
    room.lastMessageAt = newMessage.timestamp;

    return newMessage;
  }

  createRoom(data: {
    teamMatchId: string;
    homeTeamId: string;
    awayTeamId: string;
  }): ChatRoom {
    const room: ChatRoom = {
      id: `room-${this.nextRoomId++}`,
      teamMatchId: data.teamMatchId,
      homeTeamId: data.homeTeamId,
      awayTeamId: data.awayTeamId,
      homeTeamName: '홈팀',
      awayTeamName: '어웨이팀',
      createdAt: new Date().toISOString(),
      lastMessage: null,
      lastMessageAt: null,
    };

    this.rooms.push(room);

    // Add system message
    const systemMsg: ChatMessage = {
      id: `msg-${this.nextMsgId++}`,
      chatRoomId: room.id,
      senderId: 'system',
      senderName: '시스템',
      message: `채팅방이 생성되었습니다. ${room.homeTeamName} vs ${room.awayTeamName}`,
      timestamp: room.createdAt,
      isSystem: true,
    };
    this.messages.push(systemMsg);

    return room;
  }
}
