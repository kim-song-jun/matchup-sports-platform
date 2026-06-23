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
  retry?: () => void;
  stats: HomeStats;
  featuredMatch: HomeMatchCard;
  recommendedMatches: HomeMatchCard[];
  quickActions: HomeQuickAction[];
  weather: {
    city: string;
    temp: number | string;
    cond: string;
    wind: number | string;
    feelsLike?: number | string;
    status?: string;
  };
  weatherRefreshing?: boolean;
  refreshWeather?: () => void;
  notices: HomeNotice[];
};
