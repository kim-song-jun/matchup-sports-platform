import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  type: 'match' | 'team' | 'chat' | 'system';
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

interface NotificationState {
  notifications: NotificationItem[];
  getUnreadCount: () => number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const mockNotifications: NotificationItem[] = [
  { id: 'n1', type: 'match', title: '매치 참가 확정', body: '강남 풋살파크 주말 매치에 참가가 확정되었어요.', isRead: false, createdAt: '2026-03-25T14:00:00', link: '/matches/match-1' },
  { id: 'n2', type: 'team', title: '팀 가입 승인', body: 'FC 서울 유나이티드에서 가입을 승인했어요.', isRead: false, createdAt: '2026-03-25T11:30:00', link: '/teams/team-1' },
  { id: 'n3', type: 'chat', title: '새 메시지', body: '김선수님이 메시지를 보냈어요: "내일 경기 참가 가능한가요?"', isRead: false, createdAt: '2026-03-25T10:15:00', link: '/chat' },
  { id: 'n4', type: 'match', title: '매치 시작 1시간 전', body: '잠실 농구 픽업게임이 1시간 후에 시작돼요. 준비하세요!', isRead: true, createdAt: '2026-03-24T18:00:00', link: '/matches/match-2' },
  { id: 'n5', type: 'system', title: '매너 점수 상승', body: '최근 매치에서 좋은 평가를 받아 매너 점수가 올랐어요. 현재 4.5점', isRead: true, createdAt: '2026-03-24T12:00:00', link: '/profile' },
  { id: 'n6', type: 'match', title: '매치 인원 마감 임박', body: '배드민턴 초급 매치가 1자리 남았어요.', isRead: true, createdAt: '2026-03-23T16:00:00', link: '/matches/match-5' },
  { id: 'n7', type: 'team', title: '팀 매칭 성사', body: 'FC 서울 vs 강남 FC 팀 매칭이 확정되었어요.', isRead: true, createdAt: '2026-03-23T09:00:00', link: '/team-matches/tm-1' },
  { id: 'n8', type: 'system', title: '뱃지 획득', body: '"첫 매치 참가" 뱃지를 획득했어요!', isRead: true, createdAt: '2026-03-22T15:00:00', link: '/badges' },
];

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: mockNotifications,

  getUnreadCount: () => {
    return get().notifications.filter(n => !n.isRead && n.type !== 'chat').length;
  },

  markAsRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    }));
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, isRead: true })),
    }));
  },
}));
