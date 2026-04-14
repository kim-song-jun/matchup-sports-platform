import { http } from 'msw';
import { success, paged } from './_utils';
import { mockTournament, mockBadge, mockReport, mockUpload } from '../../fixtures/misc';

export const miscHandlers = [
  http.get('/api/v1/tournaments', () => {
    return paged([mockTournament]);
  }),

  http.get('/api/v1/tournaments/:id', ({ params }) => {
    return success({ ...mockTournament, id: params.id as string });
  }),

  http.post('/api/v1/tournaments', () => {
    return success(mockTournament);
  }),

  // Badges
  http.get('/api/v1/badges', () => {
    return success([mockBadge]);
  }),

  http.get('/api/v1/badges/user/:userId', ({ params }) => {
    return success([{ ...mockBadge, userId: params.userId as string }]);
  }),

  // Reports
  http.get('/api/v1/reports', () => {
    return paged([mockReport]);
  }),

  http.post('/api/v1/reports', () => {
    return success(mockReport);
  }),

  // User-blocks
  http.get('/api/v1/user-blocks', () => {
    return success([]);
  }),

  http.post('/api/v1/user-blocks', () => {
    return success({ id: 'block-1', blockedId: 'user-2', createdAt: new Date().toISOString() });
  }),

  http.delete('/api/v1/user-blocks/:id', ({ params }) => {
    return success({ id: params.id as string });
  }),

  // Uploads
  http.post('/api/v1/uploads', () => {
    return success([mockUpload]);
  }),

  http.get('/api/v1/uploads/:id', ({ params }) => {
    return success({ ...mockUpload, id: params.id as string });
  }),

  http.delete('/api/v1/uploads/:id', ({ params }) => {
    return success({ id: params.id as string });
  }),

  // Health
  http.get('/api/v1/health', () => {
    return success({ status: 'ok', timestamp: new Date().toISOString() });
  }),
];
