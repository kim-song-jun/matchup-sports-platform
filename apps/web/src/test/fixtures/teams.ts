import type { SportTeam } from '@/types/api';

export const mockTeam1: SportTeam = {
  id: 'team-1',
  name: '서울 FC',
  sportType: 'soccer',
  sportTypes: ['soccer'],
  memberCount: 11,
  level: 3,
  isRecruiting: true,
  ownerId: 'user-1',
  description: '서울 풋살 팀',
  city: '서울',
  district: '송파구',
};

export const mockTeam2: SportTeam = {
  id: 'team-2',
  name: '한강 농구단',
  sportType: 'basketball',
  sportTypes: ['basketball'],
  memberCount: 5,
  level: 2,
  isRecruiting: false,
  ownerId: 'user-1',
  description: '한강 농구 팀',
  city: '서울',
  district: '마포구',
};

// Membership-wrapped shape matching backend listUserTeams() response
export const mockMyTeamMemberships = [
  {
    id: 'mem-1',
    teamId: 'team-1',
    userId: 'user-1',
    role: 'owner' as const,
    status: 'active' as const,
    joinedAt: '2024-01-01T00:00:00.000Z',
    team: mockTeam1,
  },
  {
    id: 'mem-2',
    teamId: 'team-2',
    userId: 'user-1',
    role: 'member' as const,
    status: 'active' as const,
    joinedAt: '2024-01-02T00:00:00.000Z',
    team: mockTeam2,
  },
];

export const mockTeamMember = {
  id: 'mem-3',
  teamId: 'team-1',
  userId: 'user-2',
  role: 'member' as const,
  status: 'active' as const,
  joinedAt: '2024-02-01T00:00:00.000Z',
  user: { id: 'user-2', nickname: '상대유저', profileImageUrl: null },
};
