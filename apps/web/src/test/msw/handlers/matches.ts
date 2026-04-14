import { http } from 'msw';
import { success, paged } from './_utils';
import { mockMatch } from '../../fixtures/matches';

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

  http.post('/api/v1/matches/:id/teams', () => {
    return success({ message: '팀 편성이 완료되었습니다' });
  }),

  http.post('/api/v1/matches/:id/complete', ({ params }) => {
    return success({ ...mockMatch, id: params.id as string, status: 'completed' });
  }),
];
