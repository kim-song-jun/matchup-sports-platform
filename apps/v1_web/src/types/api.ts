export type ApiEnvelope<T> = {
  status: 'success';
  data: T;
  timestamp: string;
};

export type ApiErrorBody = {
  status: 'error';
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type V1Status = 'open' | 'pending' | 'confirmed' | 'closed' | 'cancelled';
export type TrustState = 'verified' | 'estimated' | 'sample';

export type V1User = {
  id: string;
  email: string;
  displayName: string;
  onboardingStatus: 'pending' | 'completed' | 'deferred';
};

export type V1Sport = {
  id: string;
  name: string;
  levels: { id: string; name: string }[];
};

export type V1Region = {
  id: string;
  name: string;
  parentId: string | null;
};

export type V1Notice = {
  id: string;
  title: string;
  category: string;
  publishedAt: string;
  body?: string;
};

export type V1Match = {
  id: string;
  title: string;
  sportName: string;
  levelLabel: string;
  placeName: string;
  startsAt: string;
  capacityText: string;
  status: V1Status;
  ctaState?: string;
};

export type V1Team = {
  id: string;
  name: string;
  sportName: string;
  regionName: string;
  memberCount: number;
  trustState: TrustState;
  joinPolicy: 'approval_required' | 'closed';
};

export type V1TeamMatch = V1Match & {
  hostTeamId: string;
  hostTeamName: string;
  applicantTeamState?: string;
};

export type V1ChatRoom = {
  id: string;
  targetType: 'match' | 'team_match';
  targetId: string;
  title: string;
  lastMessagePreview: string;
  unreadCount: number;
  updatedAt: string;
};

export type V1ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: string;
};

export type V1Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  href: string;
  createdAt: string;
};

export type V1NotificationPreferences = {
  importantEnabled: boolean;
  activityEnabled: boolean;
  marketingEnabled: boolean;
};

export type V1Profile = {
  userId: string;
  displayName: string;
  regionName: string;
  bio: string;
  trustState: TrustState;
};

export type V1Settings = {
  notifications: V1NotificationPreferences;
  withdrawalRequested: boolean;
};

export type V1Home = {
  notices: V1Notice[];
  recommendedMatches: V1Match[];
  recommendedTeamMatches: V1TeamMatch[];
  recommendedTeams: V1Team[];
};

export type V1AdminOverview = {
  users: number;
  matches: number;
  teams: number;
  teamMatches: number;
  pendingActions: number;
};

export type V1AdminLog = {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
};
