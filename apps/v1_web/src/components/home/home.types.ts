import type { HomeBannerDecision } from '@/lib/home-banner-policy';

export type HomeMatchCard = {
  id: string;
  sport: string;
  sportLabel: string;
  title: string;
  venue: string;
  date: string;
  time: string;
  currentParticipants: number;
  maxParticipants: number;
  actionLabel: string;
  imageUrl: string;
  reason?: string;
};

export type HomeQuickAction = {
  key?: 'matches' | 'team_matches' | 'teams' | 'my_team';
  label: string;
  sub: string;
  href?: string;
  disabled?: boolean;
  color: string;
};

export type HomeNotice = {
  id: string;
  title: string;
  summary: string;
  trailing: string;
  body?: string;
};

export type HomePopup = {
  id: string;
  title: string;
  body: string;
  content?: import('@/types/api').V1RichContentDocument | null;
  trailing: string;
  linkUrl?: string | null;
  linkLabel?: string | null;
};

export type HomeChatRoom = {
  id: string;
  title: string;
  typeLabel: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  href: string;
};

export type HomeStats = {
  monthlyActivity: number | '-';
  monthlyActivitySub: string;
  mannerScore: string;
  mannerScoreSub: string;
  joined: number | '-';
  trustState: string;
  pending: string;
};

export type HomeViewModel = {
  viewerName: string | null;
  signedOut: boolean;
  network: boolean;
  hasNewNotification: boolean;
  chatUnreadCount: number;
  chatHref: string;
  chatStatus: 'loading' | 'error' | 'ready';
  chatRooms: HomeChatRoom[];
  retry?: () => void;
  /** 채팅방 목록 조회 전용 재시도 — 전체 홈 데이터(retry)와 별도 쿼리이므로 분리한다. */
  chatRetry?: () => void;
  stats: HomeStats;
  /** 홈 요약을 아직 못 받은 상태. true면 통계 자리에 스켈레톤을 그린다(목업 숫자·'-' 대신). */
  statsLoading?: boolean;
  featuredMatch: HomeMatchCard | null;
  recommendedMatches: HomeMatchCard[];
  quickActions: HomeQuickAction[];
  weather: {
    city: string;
    temp: number | string;
    cond: string;
    wind: number | string;
    feelsLike?: number | string;
    status?: string;
    icon?: 'sun' | 'cloud-sun' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm';
  };
  weatherPermission?: 'checking' | 'prompt' | 'granted' | 'denied' | 'unsupported';
  weatherRefreshing?: boolean;
  refreshWeather?: () => void;
  popup: HomePopup | null;
  notices: HomeNotice[];
  /** 온보딩에서 알림을 거부/미응답한 기존 유저에게 로그인마다 1번 다시 유도하는 닫을 수 있는 배너. undefined면 렌더하지 않는다. */
  pushNudge?: {
    subscribing: boolean;
    onSubscribe: () => void;
    onDismiss: () => void;
  };
  /**
   * 홈 상단 배너 표시 결정 (Task 154 P2-1). 각 배너의 `undefined` 여부와 **별개**로,
   * 이 값이 "이번 방문에 실제로 어느 유도 배너를 보여줄지"를 정한다 -- 조건이 맞아도
   * 여기서 선택되지 않은 유도 배너는 렌더하지 않는다. 차단성(휴대폰 인증)은 이 예산
   * 밖이라 조건만 맞으면 항상 보인다. 정책은 `lib/home-banner-policy.ts`.
   */
  bannerDecision: HomeBannerDecision;
  /**
   * 경기 기록 공개 동의 유도 배너 (Task 154 P0-3). undefined면 렌더하지 않는다.
   * 아직 응답한 적 없고, **켜면 실제로 공개될 기록이 있는** 사용자에게만 뜬다 --
   * 연결·공식확정이 안 끝난 사람에게 조르면 켜도 화면이 그대로라 신뢰만 잃는다.
   */
  recordConsentNudge?: {
    /** 지금 켜면 공개될 경기 수. 0이면 애초에 이 객체가 undefined 다. */
    pendingCount: number;
    saving: boolean;
    onGrant: () => void;
    onDismiss: () => void;
  };
  /**
   * 휴대폰 본인인증을 아직 완료하지 않은 계정에게 상시 노출하는 배너. undefined면 렌더하지 않는다.
   * 인증 전에는 쓰기가 전부 막히므로 닫기(dismiss)를 제공하지 않는다.
   */
  phoneVerifyNudge?: {
    onVerify: () => void;
  };
};
