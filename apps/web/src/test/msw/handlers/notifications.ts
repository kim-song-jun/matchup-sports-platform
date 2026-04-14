import { http } from 'msw';
import { success } from './_utils';
import { mockNotification, mockNotificationPreference } from '../../fixtures/notifications';

export const notificationsHandlers = [
  http.get('/api/v1/notifications', () => {
    return success([mockNotification]);
  }),

  http.get('/api/v1/notifications/unread-count', () => {
    return success({ count: 1 });
  }),

  http.patch('/api/v1/notifications/read-all', () => {
    return success({ count: 1 });
  }),

  http.patch('/api/v1/notifications/:id/read', ({ params }) => {
    return success({ ...mockNotification, id: params.id as string, isRead: true });
  }),

  http.get('/api/v1/notifications/preferences', () => {
    return success(mockNotificationPreference);
  }),

  http.patch('/api/v1/notifications/preferences', async ({ request }) => {
    const body = await request.json() as Partial<typeof mockNotificationPreference>;
    return success({ ...mockNotificationPreference, ...body });
  }),

  http.post('/api/v1/notifications/push-subscribe', () => {
    return success({ subscribed: true });
  }),

  http.delete('/api/v1/notifications/push-unsubscribe', () => {
    return success({ unsubscribed: true });
  }),

  http.get('/api/v1/notifications/vapid-public-key', () => {
    return success({ publicKey: 'mock-vapid-public-key' });
  }),
];
