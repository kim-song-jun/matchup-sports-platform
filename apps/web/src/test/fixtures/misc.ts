import type { Tournament, Badge, Upload } from '@/types/api';

export const mockTournament: Tournament = {
  id: 'tournament-1',
  title: '서울 풋살 토너먼트',
  sportType: 'soccer',
  city: '서울',
  district: '송파구',
  venueName: '서울 풋살장',
  eventDate: '2026-06-01',
  startTime: '09:00',
  endTime: '18:00',
  entryFee: 50000,
  status: 'recruiting',
  participantCount: 8,
  maxParticipants: 16,
  createdAt: '2024-01-01T00:00:00.000Z',
};

export const mockBadge: Badge = {
  id: 'badge-1',
  type: 'first_match',
  name: '첫 경기',
  description: '첫 번째 경기에 참여했어요',
  earned: true,
  earnedAt: '2024-01-05T10:00:00.000Z',
};

export const mockReport = {
  id: 'report-1',
  reporterId: 'user-1',
  targetType: 'user' as const,
  targetId: 'user-2',
  reason: '비매너 플레이',
  status: 'pending' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
};

export const mockUpload: Upload = {
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

export const mockReview = {
  id: 'review-1',
  matchId: 'match-1',
  reviewerId: 'user-1',
  targetId: 'user-2',
  mannerRating: 5,
  skillRating: 4,
  comment: '매너 좋은 플레이어에요',
  createdAt: '2024-01-05T10:00:00.000Z',
  reviewer: { id: 'user-1', nickname: '테스트유저', profileImageUrl: null },
  target: { id: 'user-2', nickname: '상대유저', profileImageUrl: null },
};
