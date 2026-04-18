import { http } from 'msw';
import { success } from './_utils';
import { mockNotification, mockNotificationRead, mockNotificationPreference } from '../../fixtures/notifications';

const newTypeNotifications = [
  {
    id: 'notif-team-app-received',
    type: 'team_application_received' as const,
    title: '팀 참여 신청',
    body: '신청자A님이 팀에 참여 신청했어요.',
    isRead: false,
    createdAt: '2024-03-01T00:00:00.000Z',
    data: { teamId: 'team-1', applicantUserId: 'user-3' },
    category: 'team' as const,
    link: '/teams/team-1/members?tab=applicants',
    ctaLabel: '신청 확인',
  },
  {
    id: 'notif-team-app-accepted',
    type: 'team_application_accepted' as const,
    title: '팀 가입 수락',
    body: '서울 FC에 가입이 수락되었어요.',
    isRead: true,
    createdAt: '2024-03-02T00:00:00.000Z',
    data: { teamId: 'team-1' },
    category: 'team' as const,
    link: '/teams/team-1',
    ctaLabel: '팀 보기',
  },
  {
    id: 'notif-mercenary-applied',
    type: 'mercenary_applied' as const,
    title: '용병 지원',
    body: '새로운 용병 지원자가 있어요.',
    isRead: false,
    createdAt: '2024-03-03T00:00:00.000Z',
    data: { postId: 'post-1' },
    category: 'team' as const,
    link: '/mercenary/post-1',
    ctaLabel: '지원 확인',
  },
  {
    id: 'notif-review-received',
    type: 'review_received' as const,
    title: '리뷰 도착',
    body: '새로운 평가를 받았어요.',
    isRead: false,
    createdAt: '2024-03-04T00:00:00.000Z',
    data: { matchId: 'match-1' },
    category: 'match' as const,
    link: '/reviews',
    ctaLabel: '리뷰 보기',
  },
];

export const notificationsHandlers = [
  http.get('/api/v1/notifications', () => {
    return success([mockNotification, mockNotificationRead, ...newTypeNotifications]);
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
