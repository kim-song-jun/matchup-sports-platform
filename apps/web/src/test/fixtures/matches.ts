import type { Match } from '@/types/api';

export const mockMatch: Match = {
  id: 'match-1',
  hostId: 'user-1',
  sportType: 'soccer',
  status: 'recruiting',
  title: '주말 풋살 경기',
  description: null,
  venueId: 'venue-1',
  matchDate: '2026-05-10',
  startTime: '14:00',
  endTime: '16:00',
  maxPlayers: 10,
  currentPlayers: 5,
  fee: 10000,
  levelMin: 1,
  levelMax: 5,
  gender: 'all',
  teamConfig: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

export const mockMatchCompleted: Match = {
  ...mockMatch,
  id: 'match-2',
  status: 'completed',
  title: '완료된 풋살 경기',
};

export const mockMatchCancelled: Match = {
  ...mockMatch,
  id: 'match-3',
  status: 'cancelled',
  title: '취소된 풋살 경기',
};
