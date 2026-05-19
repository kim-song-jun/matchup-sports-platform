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
  fee: number;
  imageUrl: string;
};

export type HomeQuickAction = {
  label: string;
  sub: string;
  href?: string;
  disabled?: boolean;
  color: string;
  background: string;
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
  mvp: number | '-';
  paid: string;
};

export type HomeViewModel = {
  viewerName: string | null;
  signedOut: boolean;
  network: boolean;
  hasNewNotification: boolean;
  chatUnreadCount: number;
  chatHref: string;
  stats: HomeStats;
  featuredMatch: HomeMatchCard;
  recommendedMatches: HomeMatchCard[];
  quickActions: HomeQuickAction[];
  weather: {
    city: string;
    temp: number | string;
    cond: string;
    wind: number | string;
  };
  notices: HomeNotice[];
};
