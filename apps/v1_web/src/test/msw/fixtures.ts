import type {
  CursorPage,
  V1AdminLog,
  V1AdminOverview,
  V1ChatMessage,
  V1ChatRoom,
  V1Home,
  V1Match,
  V1Notification,
  V1Notice,
  V1Profile,
  V1Region,
  V1Settings,
  V1Sport,
  V1Team,
  V1TeamMatch,
  V1User,
} from '@/types/api';

export const v1UserFixture: V1User = {
  id: 'user-1',
  email: 'songjun@example.com',
  displayName: '송준',
  onboardingStatus: 'completed',
};

export const v1SportsFixture: V1Sport[] = [
  { id: 'sport-futsal', name: '풋살', levels: [{ id: 'level-beginner', name: '초급' }, { id: 'level-middle', name: '중급' }] },
  { id: 'sport-running', name: '러닝', levels: [{ id: 'level-entry', name: '입문' }] },
];

export const v1RegionsFixture: V1Region[] = [
  { id: 'region-seoul', name: '서울', parentId: null },
  { id: 'region-gangdong', name: '강동', parentId: 'region-seoul' },
  { id: 'region-songpa', name: '송파', parentId: 'region-seoul' },
];

export const v1NoticesFixture: V1Notice[] = [
  {
    id: 'notice-1',
    title: 'v1 베타 운영 기준 안내',
    category: '운영',
    publishedAt: '2026-05-18T00:00:00.000Z',
    body: 'SM New v1은 새 앱과 새 데이터베이스에서 검증 중입니다.',
  },
  {
    id: 'notice-2',
    title: '결제와 환불 기능은 이번 v1 범위에서 제외됩니다',
    category: '범위',
    publishedAt: '2026-05-17T00:00:00.000Z',
    body: '참여 신청과 승인 흐름까지만 제공합니다.',
  },
];

export const v1MatchesFixture: V1Match[] = [
  {
    id: 'match-1',
    title: '성수 풋살장 동네 5:5',
    sportName: '풋살',
    levelLabel: '초급-중급',
    placeName: '성수 실내풋살장',
    startsAt: '2026-05-18T20:00:00.000Z',
    capacityText: '7/10명',
    status: 'open',
    ctaState: 'can_apply',
  },
];

export const v1TeamsFixture: V1Team[] = [
  {
    id: 'team-1',
    name: '성수 볼러즈',
    sportName: '풋살',
    regionName: '서울 강동',
    memberCount: 18,
    trustState: 'verified',
    joinPolicy: 'approval_required',
  },
];

export const v1TeamMatchesFixture: V1TeamMatch[] = [
  {
    id: 'team-match-1',
    title: '마포 FC 상대팀 모집',
    sportName: '축구',
    levelLabel: 'A-',
    placeName: '마포 월드컵 보조구장',
    startsAt: '2026-05-22T21:00:00.000Z',
    capacityText: '상대 0/1팀',
    status: 'open',
    hostTeamId: 'team-1',
    hostTeamName: '마포 FC',
    applicantTeamState: 'eligible',
  },
];

export const v1ChatRoomsFixture: CursorPage<V1ChatRoom> = {
  items: [
    {
      id: 'chat-1',
      targetType: 'match',
      targetId: 'match-1',
      title: '성수 풋살장 동네 5:5',
      lastMessagePreview: '오늘 경기 전 준비물을 확인해 주세요.',
      unreadCount: 2,
      updatedAt: '2026-05-18T09:00:00.000Z',
    },
  ],
  nextCursor: null,
};

export const v1ChatMessagesFixture: CursorPage<V1ChatMessage> = {
  items: [
    {
      id: 'message-1',
      roomId: 'chat-1',
      senderId: 'user-2',
      content: '오늘 경기 전 준비물을 확인해 주세요.',
      createdAt: '2026-05-18T09:00:00.000Z',
    },
  ],
  nextCursor: null,
};

export const v1NotificationsFixture: CursorPage<V1Notification> = {
  items: [
    {
      id: 'notification-1',
      type: 'match_application',
      title: '매치 신청이 접수되었습니다',
      body: '호스트 승인을 기다리고 있습니다.',
      read: false,
      href: '/matches/match-1',
      createdAt: '2026-05-18T09:00:00.000Z',
    },
  ],
  nextCursor: null,
};

export const v1ProfileFixture: V1Profile = {
  userId: 'user-1',
  displayName: '송준',
  regionName: '서울 강동',
  bio: '풋살과 러닝을 중심으로 활동 중입니다.',
  trustState: 'sample',
};

export const v1SettingsFixture: V1Settings = {
  notifications: {
    importantEnabled: true,
    activityEnabled: true,
    marketingEnabled: false,
  },
  withdrawalRequested: false,
};

export const v1HomeFixture: V1Home = {
  notices: v1NoticesFixture,
  recommendedMatches: v1MatchesFixture,
  recommendedTeamMatches: v1TeamMatchesFixture,
  recommendedTeams: v1TeamsFixture,
};

export const v1AdminOverviewFixture: V1AdminOverview = {
  users: 12,
  matches: 3,
  teams: 4,
  teamMatches: 2,
  pendingActions: 1,
};

export const v1AdminLogsFixture: CursorPage<V1AdminLog> = {
  items: [
    {
      id: 'admin-log-1',
      actorId: 'admin-1',
      action: 'status_check',
      targetType: 'system',
      targetId: 'v1',
      reason: 'smoke',
      createdAt: '2026-05-18T09:00:00.000Z',
    },
  ],
  nextCursor: null,
};
