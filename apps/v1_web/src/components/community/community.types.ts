import type { V1ChatRoomTeamContact } from '@/types/api';

export type ChatRoomModel = {
  id: string;
  title: string;
  type: '개인매치' | '팀매치' | '팀' | '팀컨택';
  href: string;
  /** 팀컨택 방의 컨택 상태(표시값). 다른 방 종류는 undefined. */
  contactStatus?: V1ChatRoomTeamContact['status'];
  /** 받는 팀 운영진이 아직 답하지 않은 요청 — 목록에서 "답장 필요" 로 강조한다. */
  contactNeedsReply?: boolean;
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
  /** count 는 '전체'와 선택된 카테고리에만 있다 — 나머지는 첫 페이지만 세는 값이라 목록과 어긋나 보여 주지 않는다. */
  categories: Array<{ label: ChatRoomModel['type'] | '전체'; count?: number; active?: boolean; onSelect?: () => void }>;
  pinnedRooms: ChatRoomModel[];
  rooms: ChatRoomModel[];
  status?: 'loading' | 'error' | 'ready';
  emptyTitle?: string;
  emptyBody?: string;
  emptyHref?: string;
  onRetry?: () => void;
  /**
   * 팀컨택 필터에서만 존재. 거절·철회·만료로 보관(archived)된 컨택 방을 "종료된 컨택 보기" 로
   * 펼쳐 본다 — 기본 목록에서는 자동으로 치워지므로 이력은 여기서만 닿는다.
   */
  endedContacts?: {
    visible: boolean;
    onToggle: () => void;
    rooms: ChatRoomModel[];
    status: 'loading' | 'error' | 'ready';
  };
};

export type ChatRoomViewModel = {
  title: string;
  context: { title: string; sub: string; href: string };
  /** 팀컨택 방이면 상단 컨텍스트 카드 대신 상태 카드를 그린다. */
  teamContact?: V1ChatRoomTeamContact | null;
  /** 값이 있으면 입력창을 잠그고 이 문구를 placeholder 로 보여준다(수락 전·종료된 컨택). */
  inputLockedMessage?: string;
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
  /** 알림 카드 탭 — 읽음 처리·분석 이벤트만 담당하고, 화면 이동은 onNavigate가 맡는다. */
  onOpen?: (notification: NotificationModel) => void;
  /** 상세 시트의 CTA — 알림 대상 화면으로 이동한다. */
  onNavigate?: (notification: NotificationModel) => void;
};
