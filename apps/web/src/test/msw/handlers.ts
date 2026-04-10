import { http, HttpResponse } from 'msw';

const timestamp = () => new Date().toISOString();

function success<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: timestamp() });
}

// ── Fixture data ──

const mockUser = {
  id: 'user-1',
  nickname: '테스트유저',
  email: 'test@example.com',
  profileImageUrl: null,
  mannerScore: 4.5,
  totalMatches: 10,
  role: 'user',
};

const mockTeam1 = {
  id: 'team-1',
  name: '서울 FC',
  sportType: 'SOCCER',
  memberCount: 11,
  level: 3,
  isRecruiting: true,
  ownerId: 'user-1',
  description: '서울 풋살 팀',
  city: '서울',
  district: '송파구',
  logoUrl: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockTeam2 = {
  id: 'team-2',
  name: '한강 농구단',
  sportType: 'BASKETBALL',
  memberCount: 5,
  level: 2,
  isRecruiting: false,
  ownerId: 'user-1',
  description: '한강 농구 팀',
  city: '서울',
  district: '마포구',
  logoUrl: null,
  createdAt: '2024-01-02T00:00:00.000Z',
};

// Membership-wrapped fixtures matching backend listUserTeams() shape
const mockMyTeamMemberships = [
  {
    id: 'mem-1',
    teamId: 'team-1',
    userId: 'user-1',
    role: 'owner',
    status: 'active',
    joinedAt: '2024-01-01T00:00:00.000Z',
    team: mockTeam1,
  },
  {
    id: 'mem-2',
    teamId: 'team-2',
    userId: 'user-1',
    role: 'member',
    status: 'active',
    joinedAt: '2024-01-02T00:00:00.000Z',
    team: mockTeam2,
  },
];

const mockMatch = {
  id: 'match-1',
  sportType: 'SOCCER',
  status: 'RECRUITING',
  scheduledAt: '2025-06-01T10:00:00.000Z',
  venueName: '서울 풋살장',
  maxParticipants: 10,
  currentParticipants: 5,
  fee: 10000,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockTeamMatch = {
  id: 'tm-1',
  hostTeamId: 'team-1',
  hostTeam: mockTeam1,
  sportType: 'soccer',
  title: '주말 친선 경기 모집',
  description: '',
  matchDate: '2026-05-10',
  startTime: '14:00',
  endTime: '16:00',
  totalMinutes: 120,
  quarterCount: 4,
  venueName: '서울 풋살장',
  venueAddress: '서울시 송파구 올림픽로 25',
  totalFee: 200000,
  opponentFee: 100000,
  requiredLevel: 3,
  hasProPlayers: false,
  allowMercenary: true,
  matchStyle: 'friendly',
  hasReferee: true,
  notes: '',
  status: 'recruiting',
  // task 17: match meta fields
  skillGrade: 'B+',
  gameFormat: '6:6',
  matchType: 'invitation' as const,
  proPlayerCount: 0,
  uniformColor: '파랑',
  isFreeInvitation: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockMercenaryPost = {
  id: 'merc-1',
  sportType: 'SOCCER',
  status: 'OPEN',
  title: '풋살 용병 구합니다',
  description: '주말 풋살 용병 1명 구합니다',
  teamMatchId: 'tm-1',
  teamId: 'team-1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockNotification = {
  id: 'notif-1',
  type: 'player_joined',
  title: '새 참가 신청',
  body: '새로운 참가 신청이 도착했어요.',
  isRead: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  data: { matchId: 'match-1' },
  category: 'match',
  link: '/matches/match-1',
  ctaLabel: '매치 보기',
};

const mockListing = {
  id: 'listing-1',
  type: 'SALE',
  title: '축구화 판매',
  price: 50000,
  status: 'ACTIVE',
  sellerId: 'user-1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ── Auth handlers ──
export const handlers = [
  http.post('/api/v1/auth/dev-login', () => {
    return success({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: mockUser });
  }),

  http.post('/api/v1/auth/login', () => {
    return success({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: mockUser });
  }),

  http.post('/api/v1/auth/register', () => {
    return success({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: mockUser });
  }),

  http.get('/api/v1/auth/me', () => {
    return success(mockUser);
  }),

  http.post('/api/v1/auth/refresh', () => {
    return success({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' });
  }),

  // ── Teams handlers ──
  http.get('/api/v1/teams/me', () => {
    // Returns membership-wrapped shape matching backend listUserTeams()
    return success(mockMyTeamMemberships);
  }),

  http.get('/api/v1/teams', () => {
    return success({ items: [mockTeam1, mockTeam2], nextCursor: null });
  }),

  http.post('/api/v1/teams', () => {
    return success(mockTeam1);
  }),

  // ── Matches handlers ──
  http.get('/api/v1/matches', () => {
    return success({ items: [mockMatch], nextCursor: null });
  }),

  http.post('/api/v1/matches', () => {
    return success(mockMatch);
  }),

  http.get('/api/v1/matches/:id', ({ params }) => {
    return success({ ...mockMatch, id: params.id as string });
  }),

  http.patch('/api/v1/matches/:id', ({ params }) => {
    return success({ ...mockMatch, id: params.id as string });
  }),

  http.post('/api/v1/matches/:id/join', () => {
    return success({ message: '참가 신청이 완료되었습니다' });
  }),

  http.post('/api/v1/matches/:id/cancel', ({ params }) => {
    return success({ ...mockMatch, id: params.id as string, status: 'CANCELLED' });
  }),

  http.post('/api/v1/matches/:id/close', ({ params }) => {
    return success({ ...mockMatch, id: params.id as string, status: 'FULL' });
  }),

  http.post('/api/v1/matches/:id/arrive', () => {
    return success({ arrivedAt: new Date().toISOString() });
  }),

  // ── Team Matches handlers ──
  http.get('/api/v1/team-matches', () => {
    return success({ items: [mockTeamMatch], nextCursor: null });
  }),

  http.get('/api/v1/team-matches/me/applications', () => {
    return success([
      {
        id: 'tma-1',
        status: 'pending',
        message: '참가 신청합니다',
        createdAt: '2024-01-10T10:00:00.000Z',
        teamMatch: {
          id: 'tm-1',
          title: '주말 친선 경기 모집',
          matchDate: '2026-05-10',
          startTime: '14:00',
          endTime: '16:00',
          venueName: '서울 풋살장',
          hostTeam: { id: 'team-1', name: '서울 FC' },
        },
        applicantTeam: { id: 'team-2', name: '한강 농구단' },
      },
      {
        id: 'tma-2',
        status: 'approved',
        message: null,
        createdAt: '2024-01-08T09:00:00.000Z',
        teamMatch: {
          id: 'tm-2',
          title: '평일 저녁 풋살',
          matchDate: '2026-05-07',
          startTime: '20:00',
          endTime: '22:00',
          venueName: '마포 실내 풋살장',
          hostTeam: { id: 'team-3', name: '마포 FC' },
        },
        applicantTeam: { id: 'team-2', name: '한강 농구단' },
      },
    ]);
  }),

  http.patch('/api/v1/team-matches/:id/applications/:appId/approve', ({ params }) => {
    return success({ id: params.appId as string, status: 'approved' });
  }),

  http.patch('/api/v1/team-matches/:id/applications/:appId/reject', ({ params }) => {
    return success({ id: params.appId as string, status: 'rejected' });
  }),

  // ── Mercenary handlers ──
  http.get('/api/v1/mercenary', () => {
    return success({ items: [mockMercenaryPost], nextCursor: null });
  }),

  // ── Notifications handlers ──
  http.get('/api/v1/notifications', () => {
    return success([mockNotification]);
  }),

  http.get('/api/v1/notifications/unread-count', () => {
    return success({ count: 1 });
  }),

  http.patch('/api/v1/notifications/read-all', () => {
    return success({ count: 1 });
  }),

  http.patch('/api/v1/notifications/:id/read', () => {
    return success({ ...mockNotification, isRead: true });
  }),

  http.get('/api/v1/notifications/preferences', () => {
    return success({
      id: 'pref-1',
      matchEnabled: true,
      teamEnabled: true,
      chatEnabled: true,
      paymentEnabled: true,
    });
  }),

  http.patch('/api/v1/notifications/preferences', async ({ request }) => {
    const body = await request.json() as Record<string, boolean>;
    return success({
      id: 'pref-1',
      matchEnabled: body.matchEnabled ?? true,
      teamEnabled: body.teamEnabled ?? true,
      chatEnabled: body.chatEnabled ?? true,
      paymentEnabled: body.paymentEnabled ?? true,
    });
  }),

  // ── Chat handlers ──
  http.get('/api/v1/chat/unread-count', () => {
    return success({ unreadCount: 2 });
  }),

  // ── Team Invitations handlers ──
  http.get('/api/v1/teams/:teamId/invitations', ({ params }) => {
    return success([
      {
        id: 'inv-1',
        teamId: params.teamId as string,
        team: { id: params.teamId as string, name: '서울 FC', logoUrl: null },
        inviter: { id: 'user-1', nickname: '테스트유저' },
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
  }),

  http.post('/api/v1/teams/:teamId/invitations', async ({ params, request }) => {
    const body = await request.json() as { inviteeId: string; role?: string };
    return success({
      id: 'inv-new',
      teamId: params.teamId as string,
      team: { id: params.teamId as string, name: '서울 FC', logoUrl: null },
      inviter: { id: 'user-1', nickname: '테스트유저' },
      role: body.role ?? 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
  }),

  http.patch('/api/v1/teams/:teamId/invitations/:invId/accept', ({ params }) => {
    return success({
      id: params.invId as string,
      teamId: params.teamId as string,
      team: { id: params.teamId as string, name: '서울 FC', logoUrl: null },
      inviter: { id: 'user-1', nickname: '테스트유저' },
      role: 'member',
      status: 'accepted',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
  }),

  http.patch('/api/v1/teams/:teamId/invitations/:invId/decline', ({ params }) => {
    return success({
      id: params.invId as string,
      teamId: params.teamId as string,
      team: { id: params.teamId as string, name: '서울 FC', logoUrl: null },
      inviter: { id: 'user-1', nickname: '테스트유저' },
      role: 'member',
      status: 'declined',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
  }),

  http.get('/api/v1/users/me/invitations', () => {
    return success([
      {
        id: 'inv-1',
        teamId: 'team-1',
        team: { id: 'team-1', name: '서울 FC', logoUrl: null },
        inviter: { id: 'user-2', nickname: '초대자' },
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
  }),

  // ── User Search handler ──
  http.get('/api/v1/users/search', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    return success(
      q.length >= 2
        ? [{ id: 'user-2', nickname: `${q}유저`, email: null, profileImageUrl: null, mannerScore: 4.0, totalMatches: 5 }]
        : [],
    );
  }),

  // ── Marketplace handlers ──
  http.get('/api/v1/marketplace/listings', () => {
    return success({ items: [mockListing], nextCursor: null });
  }),

  // ── Upload handlers ──
  http.post('/api/v1/uploads', () => {
    const mockUpload = {
      id: 'upload-1',
      userId: 'user-1',
      filename: 'mock-file.jpg',
      originalName: 'original.jpg',
      mimetype: 'image/jpeg',
      size: 102400,
      path: '/uploads/mock-file.jpg',
      width: 1280,
      height: 720,
      createdAt: new Date().toISOString(),
    };
    return success([mockUpload]);
  }),

  http.delete('/api/v1/uploads/:id', ({ params }) => {
    return success({ id: params.id as string });
  }),
];
