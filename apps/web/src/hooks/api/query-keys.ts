'use client';

// Centralized query key factory — import from domain files re-export this through index.ts
export const queryKeys = {
  me: ['me'] as const,
  matches: {
    all: ['matches'] as const,
    list: (params?: Record<string, string>) => ['matches', params] as const,
    detail: (id: string) => ['matches', id] as const,
    recommended: ['matches', 'recommended'] as const,
    my: (params?: Record<string, string>) => ['my-matches', params] as const,
  },
  teams: {
    all: ['teams'] as const,
    list: (params?: Record<string, string>) => ['teams', params] as const,
    detail: (id: string) => ['teams', id] as const,
    hub: (id: string) => ['teams', id, 'hub'] as const,
    me: ['teams', 'me'] as const,
  },
  teamMatches: {
    all: ['team-matches'] as const,
    list: (params?: Record<string, string>) => ['team-matches', params] as const,
    detail: (id: string) => ['team-matches', id] as const,
    referee: (id: string) => ['team-matches', id, 'referee'] as const,
  },
  lessons: {
    all: ['lessons'] as const,
    list: (params?: Record<string, string>) => ['lessons', params] as const,
    detail: (id: string) => ['lessons', id] as const,
    myTickets: ['lessons', 'tickets', 'me'] as const,
  },
  venues: {
    all: ['venues'] as const,
    list: (params?: Record<string, string>) => ['venues', params] as const,
    detail: (id: string) => ['venues', id] as const,
    hub: (id: string) => ['venues', id, 'hub'] as const,
    schedule: (id: string) => ['venues', id, 'schedule'] as const,
  },
  tournaments: {
    all: ['tournaments'] as const,
    list: (params?: Record<string, string>) => ['tournaments', params] as const,
    detail: (id: string) => ['tournaments', id] as const,
  },
  listings: {
    all: ['listings'] as const,
    list: (params?: Record<string, string>) => ['listings', params] as const,
    detail: (id: string) => ['listings', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    detail: (id: string) => ['payments', id] as const,
  },
  chat: {
    rooms: ['chat', 'rooms'] as const,
    messages: (roomId: string) => ['chat', 'messages', roomId] as const,
    unreadCount: ['chat', 'unread-count'] as const,
  },
  mercenary: {
    all: ['mercenary'] as const,
    list: (params?: Record<string, string>) => ['mercenary', params] as const,
    detail: (id: string) => ['mercenary', id] as const,
    myApplications: (status?: string) => ['mercenary', 'me', 'applications', status] as const,
  },
  teamMembers: {
    list: (teamId: string) => ['teams', teamId, 'members'] as const,
  },
  teamMatchApplications: {
    byMatch: (matchId: string) => ['team-matches', matchId, 'applications'] as const,
    mine: ['team-matches', 'me', 'applications'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (isRead?: boolean) => ['notifications', { isRead }] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    preferences: ['notifications', 'preferences'] as const,
  },
  invitations: {
    byTeam: (teamId: string) => ['invitations', 'team', teamId] as const,
    mine: ['invitations', 'me'] as const,
  },
  users: {
    search: (query: string) => ['users', 'search', query] as const,
  },
  badges: {
    all: ['badges'] as const,
    team: (teamId: string) => ['badges', 'team', teamId] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    pending: ['reviews', 'pending'] as const,
  },
  user: (id: string) => ['user', id] as const,
  admin: {
    users: (params?: Record<string, string>) => ['admin', 'users', params] as const,
    user: (id: string) => ['admin', 'user', id] as const,
    team: (id: string) => ['admin', 'team', id] as const,
    matches: ['admin', 'matches'] as const,
    lessons: ['admin', 'lessons'] as const,
    teams: ['admin', 'teams'] as const,
    venues: ['admin', 'venues'] as const,
    venue: (id: string) => ['admin', 'venue', id] as const,
    payments: ['admin', 'payments'] as const,
    stats: ['admin', 'stats'] as const,
    reviews: ['admin', 'reviews'] as const,
    mercenary: ['admin', 'mercenary'] as const,
    statistics: ['admin', 'statistics'] as const,
    disputes: ['admin', 'disputes'] as const,
    dispute: (id: string) => ['admin', 'dispute', id] as const,
    settlements: ['admin', 'settlements'] as const,
    settlementsSummary: ['admin', 'settlements', 'summary'] as const,
  },
} as const;
