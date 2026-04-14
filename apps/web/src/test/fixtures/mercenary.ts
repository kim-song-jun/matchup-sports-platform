import type { MercenaryPost, MercenaryApplication } from '@/types/api';

export const mockMercenaryPost: MercenaryPost = {
  id: 'merc-1',
  teamId: 'team-1',
  sportType: 'soccer',
  status: 'open',
  matchDate: '2026-05-10',
  venue: '서울 풋살장',
  position: '공격수',
  count: 1,
  level: 3,
  fee: 0,
  notes: '주말 풋살 용병 1명 구합니다',
};

export const mockMercenaryApplication: MercenaryApplication = {
  id: 'merc-app-1',
  postId: 'merc-1',
  userId: 'user-2',
  message: '참가하겠습니다',
  status: 'pending',
  appliedAt: '2024-01-05T10:00:00.000Z',
  decidedAt: null,
  user: { id: 'user-2', nickname: '상대유저', profileImageUrl: null },
};
