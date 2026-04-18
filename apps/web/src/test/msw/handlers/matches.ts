import { http } from 'msw';
import { success, paged } from './_utils';
import { mockMatch } from '../../fixtures/matches';
import type { PreviewTeamsResponse, MatchTeamMember } from '@/types/api';

// Deterministic fixture used by both preview and compose handlers.
// Team A: ELO [1400, 1300, 1200, 1100, 1000] — avgElo 1200
// Team B: ELO [950, 900, 850, 800, 750]      — avgElo 850
function buildTeamPreviewFixture(seed: number): PreviewTeamsResponse {
  return {
    teams: [
      {
        index: 0,
        name: '팀 A',
        color: '#3182F6',
        avgElo: 1200,
        members: [
          { userId: 'user-1', nickname: '플레이어1', profileImageUrl: null, eloRating: 1400, hasProfile: true },
          { userId: 'user-2', nickname: '플레이어2', profileImageUrl: null, eloRating: 1300, hasProfile: true },
          { userId: 'user-3', nickname: '플레이어3', profileImageUrl: null, eloRating: 1200, hasProfile: true },
          { userId: 'user-4', nickname: '플레이어4', profileImageUrl: null, eloRating: 1100, hasProfile: true },
          { userId: 'user-5', nickname: '플레이어5', profileImageUrl: null, eloRating: 1000, hasProfile: false },
        ],
      },
      {
        index: 1,
        name: '팀 B',
        color: '#F04452',
        avgElo: 850,
        members: [
          { userId: 'user-6', nickname: '플레이어6', profileImageUrl: null, eloRating: 950, hasProfile: true },
          { userId: 'user-7', nickname: '플레이어7', profileImageUrl: null, eloRating: 900, hasProfile: true },
          { userId: 'user-8', nickname: '플레이어8', profileImageUrl: null, eloRating: 850, hasProfile: false },
          { userId: 'user-9', nickname: '플레이어9', profileImageUrl: null, eloRating: 800, hasProfile: false },
          { userId: 'user-10', nickname: '플레이어10', profileImageUrl: null, eloRating: 750, hasProfile: false },
        ],
      },
    ],
    metrics: {
      maxEloGap: 50,
      variance: 625,
      stdDev: 25,
      teamAvgElos: [1200, 850],
      coldStartCount: 0,
    },
    seed,
  };
}

export const matchesHandlers = [
  http.get('/api/v1/matches', () => {
    return paged([mockMatch]);
  }),

  http.get('/api/v1/matches/recommended', () => {
    return success([{ ...mockMatch, score: 0.95, reasons: [{ type: 'level', label: '레벨 적합' }] }]);
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

  http.delete('/api/v1/matches/:id/leave', () => {
    return success({ message: '참가를 취소했습니다' });
  }),

  http.post('/api/v1/matches/:id/cancel', ({ params }) => {
    return success({ ...mockMatch, id: params.id as string, status: 'cancelled' });
  }),

  http.post('/api/v1/matches/:id/close', ({ params }) => {
    return success({ ...mockMatch, id: params.id as string, status: 'full' });
  }),

  http.post('/api/v1/matches/:id/arrive', () => {
    return success({ arrivedAt: new Date().toISOString() });
  }),

  http.post('/api/v1/matches/:id/teams/preview', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { seed?: number };
    const seed = typeof body?.seed === 'number' ? body.seed : 42;
    return success(buildTeamPreviewFixture(seed));
  }),

  http.post('/api/v1/matches/:id/teams', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { seed?: number };
    const seed = typeof body?.seed === 'number' ? body.seed : 42;
    return success(buildTeamPreviewFixture(seed));
  }),

  http.post('/api/v1/matches/:id/complete', ({ params }) => {
    return success({ ...mockMatch, id: params.id as string, status: 'completed' });
  }),
];
