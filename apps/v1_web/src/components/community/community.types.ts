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
  actionPending?: boolean;
  onTogglePin?: () => void;
  onRequestLeave?: () => void;
};

export type ChatListViewModel = {
  categories: Array<{ label: ChatRoomModel['type'] | '전체'; count: number; active?: boolean; onSelect?: () => void }>;
  pinnedRooms: ChatRoomModel[];
  rooms: ChatRoomModel[];
  status?: 'loading' | 'error' | 'ready';
  emptyTitle?: string;
  emptyBody?: string;
  emptyHref?: string;
  onRetry?: () => void;
  leaveConfirm?: {
    title: string;
    body: string;
    pending?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  };
};

export type ChatRoomViewModel = {
  title: string;
  context: { title: string; sub: string; href: string };
  messages: Array<{ id: string; who: 'me' | 'other' | 'system'; label: string; body: string }>;
  draft?: string;
  sending?: boolean;
  onDraftChange?: (value: string) => void;
  onSend?: () => void;
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
  readAllPending?: boolean;
  onReadAll?: () => void;
  onOpen?: (notification: NotificationModel) => void;
};
