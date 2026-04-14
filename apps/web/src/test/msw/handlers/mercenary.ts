import { http } from 'msw';
import { success, paged } from './_utils';
import { mockMercenaryPost, mockMercenaryApplication } from '../../fixtures/mercenary';

export const mercenaryHandlers = [
  http.get('/api/v1/mercenary', () => {
    return paged([mockMercenaryPost]);
  }),

  http.post('/api/v1/mercenary', () => {
    return success(mockMercenaryPost);
  }),

  http.get('/api/v1/mercenary/:id', ({ params }) => {
    return success({ ...mockMercenaryPost, id: params.id as string });
  }),

  http.post('/api/v1/mercenary/:id/apply', ({ params }) => {
    return success({ ...mockMercenaryApplication, postId: params.id as string });
  }),

  http.get('/api/v1/mercenary/me/applications', () => {
    return success([mockMercenaryApplication]);
  }),

  http.patch('/api/v1/mercenary/:id/applications/:appId/accept', ({ params }) => {
    return success({ id: params.appId as string, status: 'accepted' });
  }),

  http.patch('/api/v1/mercenary/:id/applications/:appId/reject', ({ params }) => {
    return success({ id: params.appId as string, status: 'rejected' });
  }),

  http.delete('/api/v1/mercenary/:id/applications/me', ({ params }) => {
    return success({ postId: params.id as string, withdrawn: true });
  }),
];
