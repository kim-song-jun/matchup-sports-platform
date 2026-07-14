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
  trailing: string;
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
  weatherRefreshing?: boolean;
  refreshWeather?: () => void;
  popup: HomePopup | null;
  notices: HomeNotice[];
};
