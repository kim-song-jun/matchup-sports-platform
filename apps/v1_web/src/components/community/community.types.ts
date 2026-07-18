export type ChatRoomModel = {
  id: string;
  title: string;
  type: '개인매치' | '팀매치' | '팀';
  href: string;
  last: string;
  time: string;
  unread: number;
  pinned?: boolean;
  muted?: boolean;
  mutedUntil?: string | null;
  initials: string;
  avatarUrl?: string;
  actionPending?: boolean;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
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
};

export type ChatRoomViewModel = {
  title: string;
  context: { title: string; sub: string; href: string };
  messages: Array<{ id: string; who: 'me' | 'other' | 'system'; senderId: string; label: string; body: string; sentAt: string; unreadCount?: number }>;
  status?: 'loading' | 'error' | 'ready';
  emptyTitle?: string;
  emptyBody?: string;
  draft?: string;
  sending?: boolean;
  sendError?: boolean;
  onDraftChange?: (value: string) => void;
  onSend?: () => void;
  onRetry?: () => void;
};

export type NotificationModel = {
  id: string;
  /** 원본 알림 타입(예: chat, team_application_accepted). GA 이벤트 파라미터 용도. */
  type: string;
  group: string;
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
  /** API 로딩/에러 상태. 뷰에서 loading/error 분기에 사용 */
  status?: 'loading' | 'error' | 'ready';
  onRetry?: () => void;
  readAllPending?: boolean;
  readAllToastVisible?: boolean;
  onReadAll?: () => void;
  onOpen?: (notification: NotificationModel) => void;
};
