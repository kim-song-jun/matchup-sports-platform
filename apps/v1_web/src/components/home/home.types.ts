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
  stats: HomeStats;
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
  /** 휴대폰 본인인증을 아직 완료하지 않은 레거시 계정에게 로그인마다 다시 유도하는 닫을 수 있는 배너. undefined면 렌더하지 않는다. */
  phoneVerifyNudge?: {
    onVerify: () => void;
    onDismiss: () => void;
  };
};
