export type ChatRoomModel = {
  id: string;
  title: string;
  type: '개인매치' | '팀매치' | '팀';
  href: string;
  last: string;
  time: string;
  unread: number;
  pinned?: boolean;
  initials: string;
};

export type ChatListViewModel = {
  categories: Array<{ label: string; count: number; active?: boolean }>;
  pinnedRooms: ChatRoomModel[];
  rooms: ChatRoomModel[];
};

export type ChatRoomViewModel = {
  title: string;
  context: { title: string; sub: string; href: string };
  messages: Array<{ id: string; who: 'me' | 'other' | 'system'; label: string; body: string }>;
};

export type NotificationModel = {
  id: string;
  group: '오늘' | '어제';
  title: string;
  body: string;
  time: string;
  unread: boolean;
  href: string;
  actionLabel: string;
};

export type NotificationsViewModel = {
  unreadCount: number;
  notifications: NotificationModel[];
};
