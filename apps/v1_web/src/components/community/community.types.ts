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

/** 말풍선에 그리는 공유 카드. href 는 돌아올 곳(?from)까지 붙인 경로다. */
export type ChatShareCardModel = {
  label: string;
  title: string;
  when: string | null;
  place: string | null;
  sub: string | null;
  href: string;
};

/** 공유 선택 시트의 한 줄. */
export type ChatShareCandidate = {
  kind: 'team_schedule' | 'match';
  targetId: string;
  title: string;
  when: string | null;
  sub: string | null;
};

/** 공유 선택 시트 — 열릴 때만 내 팀 일정·내 매치를 불러온다. */
export type ChatShareSheetModel = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  status: 'loading' | 'error' | 'ready';
  schedules: ChatShareCandidate[];
  matches: ChatShareCandidate[];
  onPick: (candidate: ChatShareCandidate) => void;
  onRetry?: () => void;
};

export type ChatRoomViewModel = {
  onMessageSafety?: (message: { id: string; label: string }) => void;
  onManageBlocked?: () => void;
  title: string;
  context: { title: string; sub: string; href: string };
  /** 팀컨택 방이면 상단 컨텍스트 카드 대신 상태 카드를 그린다. */
  teamContact?: V1ChatRoomTeamContact | null;
  /** 값이 있으면 입력창을 잠그고 이 문구를 placeholder 로 보여준다(수락 전·종료된 컨택). */
  inputLockedMessage?: string;
  messages: Array<{
    id: string;
    who: 'me' | 'other' | 'system';
    senderId: string;
    label: string;
    body: string;
    sentAt: string;
    unreadCount?: number;
    /** 사진 메시지. `imageUrl` 이 null 이면 볼 수 없는 사진(숨김·삭제·업로드 삭제). */
    kind?: 'image' | 'share' | 'file';
    imageUrl?: string | null;
    /** 일정·매치 공유 카드. 없으면(숨김·삭제) body 대체 문구만 보인다. */
    share?: ChatShareCardModel | null;
    /** 파일 메시지 — 이름·크기·받기 경로(참여자 인증). 없으면(숨김·삭제) body 대체 문구만 보인다. */
    file?: { name: string; sizeLabel: string; href: string } | null;
  }>;
  status?: 'loading' | 'error' | 'ready';
  emptyTitle?: string;
  emptyBody?: string;
  draft?: string;
  sending?: boolean;
  /** 보내기 실패 문구 — 서버·연결 이유가 있으면 그 문장, 없으면 기본 안내. 실패가 없으면 undefined. */
  sendError?: string;
  onDraftChange?: (value: string) => void;
  onSend?: () => void;
  /** + 패널에서 고른 사진(앨범·카메라). 없으면 + 가 비활성이다. */
  onPickImages?: (files: File[]) => void;
  /** 사진 업로드·전송 중. */
  sendingImages?: boolean;
  /** + 패널의 "파일"에서 고른 문서(Task 181 ③). 없으면 칸이 안 보인다. */
  onPickFile?: (file: File) => void;
  /** 파일 업로드·전송 중. */
  sendingFile?: boolean;
  /** 사진·공유 전송 실패·안내 문구. */
  imageNotice?: string;
  /** + 패널의 "일정·매치" — 없으면 칸이 안 보인다. */
  share?: ChatShareSheetModel;
  onRetry?: () => void;
  /** 다시 불러와도 소용없는 막힘(권한 없음)일 때 재시도 대신 돌아갈 곳. */
  errorBack?: { href: string; label: string };
  /** 대화 맨 위 안내 한 줄 — 팀 채팅은 입장한 뒤의 대화만 보인다(H2, 서버 visibleFromAt). */
  historyNotice?: string;
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
  /** "더 보기" — my-page.tsx MyMatchesPageView 와 동일한 무한 목록 패턴. */
  hasNext?: boolean;
  loadMorePending?: boolean;
  loadMoreError?: boolean;
  onLoadMore?: () => void;
  /** 알림 카드 탭 — 읽음 처리·분석 이벤트만 담당하고, 화면 이동은 onNavigate가 맡는다. */
  onOpen?: (notification: NotificationModel) => void;
  /** 상세 시트의 CTA — 알림 대상 화면으로 이동한다. */
  onNavigate?: (notification: NotificationModel) => void;
};
