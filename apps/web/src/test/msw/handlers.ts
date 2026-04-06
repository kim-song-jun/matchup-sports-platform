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
  ownerId: 'user-1',
  description: '서울 풋살 팀',
  logoImageUrl: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockTeam2 = {
  id: 'team-2',
  name: '한강 농구단',
  sportType: 'BASKETBALL',
  memberCount: 5,
  ownerId: 'user-1',
  description: '한강 농구 팀',
  logoImageUrl: null,
  createdAt: '2024-01-02T00:00:00.000Z',
};

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
  sportType: 'SOCCER',
  status: 'RECRUITING',
  scheduledAt: '2025-06-01T14:00:00.000Z',
  venueName: '서울 풋살장',
  hostTeamId: 'team-1',
  hostTeam: mockTeam1,
  createdAt: '2024-01-01T00:00:00.000Z',
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
  type: 'match',
  title: '매치 알림',
  body: '매치가 시작됩니다',
  isRead: false,
  createdAt: '2024-01-01T00:00:00.000Z',
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
    return success([mockTeam1, mockTeam2]);
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

  http.post('/api/v1/matches/:id/join', () => {
    return success({ message: '참가 신청이 완료되었습니다' });
  }),

  // ── Team Matches handlers ──
  http.get('/api/v1/team-matches', () => {
    return success({ items: [mockTeamMatch], nextCursor: null });
  }),

  // ── Mercenary handlers ──
  http.get('/api/v1/mercenary', () => {
    return success({ items: [mockMercenaryPost], nextCursor: null });
  }),

  // ── Notifications handlers ──
  http.get('/api/v1/notifications', () => {
    return success({ items: [mockNotification], nextCursor: null });
  }),

  // ── Marketplace handlers ──
  http.get('/api/v1/marketplace/listings', () => {
    return success({ items: [mockListing], nextCursor: null });
  }),
];
