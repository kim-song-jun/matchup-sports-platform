import { http, HttpResponse } from 'msw';
import {
  v1AdminLogsFixture,
  v1AdminMeFixture,
  v1AdminOverviewFixture,
  v1AdminStatusChangeLogsFixture,
  v1ChatMessagesByRoomFixture,
  v1ChatMessagesFixture,
  v1ChatRoomsFixture,
  v1HomeFixture,
  v1MatchesFixture,
  v1NoticesFixture,
  v1NotificationsFixture,
  v1OpsAuditFixture,
  v1OpsDisputesFixture,
  v1OpsOverviewFixture,
  v1OpsPaymentsFixture,
  v1OpsReportsFixture,
  v1OpsSettlementsFixture,
  v1ProfileFixture,
  v1RecentSearchesFixture,
  v1RegionsFixture,
  v1ReviewMatchSourceFixture,
  v1ReviewsPendingFixture,
  v1ReviewsReceivedFixture,
  v1ReviewsWrittenFixture,
  v1ReviewSubmitFixture,
  v1ReviewTeamMatchSourceFixture,
  v1SettingsFixture,
  v1SportsFixture,
  v1TeamMatchesFixture,
  v1TeamsFixture,
  v1UserFixture,
} from './fixtures';

const api = '*/api/v1';

function ok<T>(data: T) {
  return HttpResponse.json({
    status: 'success',
    data,
    timestamp: '2026-05-18T00:00:00.000Z',
  });
}

function page<T>(items: T[]) {
  return { items, nextCursor: null };
}

export const v1MswHandlers = [
  http.get(`${api}/auth/me`, () => ok(v1UserFixture)),
  http.post(`${api}/auth/dev-login`, () => ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture })),
  http.post(`${api}/auth/login`, () => ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture })),
  http.post(`${api}/auth/register`, () => ok({ session: { userId: v1UserFixture.id, userEmail: v1UserFixture.email }, ...v1UserFixture })),
  http.get(`${api}/onboarding`, () => ok({ status: 'signup_done', currentStep: 'sport', canResume: true, missing: ['sports'], sports: [], regions: [], regionOptional: true })),
  http.patch(`${api}/onboarding/preferences`, async ({ request }) => ok(await request.json())),
  http.post(`${api}/onboarding/complete`, () => ok({ completed: true })),
  http.post(`${api}/onboarding/defer`, () => ok({ status: 'deferred', next: { route: '/home', reason: 'onboarding_deferred' }, missing: ['sports'], limited: true })),
  http.get(`${api}/master/sports`, () => ok(v1SportsFixture)),
  http.get(`${api}/master/regions`, () => ok(v1RegionsFixture)),
  http.get(`${api}/search/recent`, () => ok({ items: v1RecentSearchesFixture })),
  http.post(`${api}/search/recent`, async ({ request }) => {
    const body = await request.json() as { query: string; filters?: unknown };
    return ok({ id: 'recent-new', ...body, searchedAt: '2026-05-18T10:00:00.000Z' });
  }),
  http.get(`${api}/home`, () => ok(v1HomeFixture)),
  http.get(`${api}/notices`, ({ request }) => {
    const category = new URL(request.url).searchParams.get('category');
    const notices = category ? v1NoticesFixture.filter((item) => item.category === category) : v1NoticesFixture;
    return ok({ notices, pageInfo: { hasNextPage: false, nextCursor: null } });
  }),
  http.get(`${api}/notices/:noticeId`, ({ params }) => ok({ notice: v1NoticesFixture.find((item) => item.id === params.noticeId) ?? v1NoticesFixture[0] })),
  http.get(`${api}/matches`, ({ request }) => {
    const levelCodes = new URL(request.url).searchParams.get('levelCodes')?.split(',').filter(Boolean) ?? [];
    const matches = levelCodes.length
      ? v1MatchesFixture.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : v1MatchesFixture;
    return ok(page(matches));
  }),
  http.get(`${api}/matches/:matchId`, ({ params }) => ok(v1MatchesFixture.find((item) => item.id === params.matchId) ?? v1MatchesFixture[0])),
  http.get(`${api}/teams`, ({ request }) => {
    const sportId = new URL(request.url).searchParams.get('sportId');
    const levelCodes = new URL(request.url).searchParams.get('levelCodes')?.split(',').filter(Boolean) ?? [];
    const sport = v1SportsFixture.find((item) => item.id === sportId);
    const teamsBySport = sport
      ? v1TeamsFixture.filter((item) => item.sport?.sportId === sport.id || item.sportName === sport.name)
      : v1TeamsFixture;
    const teams = levelCodes.length
      ? teamsBySport.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : teamsBySport;
    return ok(page(teams));
  }),
  http.get(`${api}/teams/:teamId`, ({ params }) => ok(v1TeamsFixture.find((item) => item.id === params.teamId) ?? v1TeamsFixture[0])),
  http.get(`${api}/me/teams`, () => ok(v1TeamsFixture)),
  http.get(`${api}/team-matches`, ({ request }) => {
    const sportId = new URL(request.url).searchParams.get('sportId');
    const levelCodes = new URL(request.url).searchParams.get('levelCodes')?.split(',').filter(Boolean) ?? [];
    const sport = v1SportsFixture.find((item) => item.id === sportId);
    const teamMatchesBySport = sport
      ? v1TeamMatchesFixture.filter((item) => item.sport?.sportId === sport.id || item.sportName === sport.name)
      : v1TeamMatchesFixture;
    const teamMatches = levelCodes.length
      ? teamMatchesBySport.filter((item) => rangeMatches(levelCodes, item.minLevel?.code, item.maxLevel?.code))
      : teamMatchesBySport;
    return ok(page(teamMatches));
  }),
  http.get(`${api}/team-matches/:teamMatchId`, ({ params }) => ok(v1TeamMatchesFixture.find((item) => item.id === params.teamMatchId) ?? v1TeamMatchesFixture[0])),
  http.get(`${api}/chat/rooms`, () => ok(v1ChatRoomsFixture)),
  http.get(`${api}/chat/rooms/:roomId`, ({ params }) => {
    const room = v1ChatRoomsFixture.items.find((item) => item.roomId === params.roomId) ?? v1ChatRoomsFixture.items[0];
    return ok({
      roomId: room.roomId,
      roomType: room.roomType,
      status: room.status,
      title: room.title,
      linkedTarget: room.linkedTarget,
      me: {
        participantId: 'chat-participant-1',
        status: 'active',
        pinned: room.pinned,
        mutedUntil: null,
        lastReadMessageId: null,
      },
      participants: [
        { userId: 'user-1', displayName: '나', role: 'member' },
        { userId: 'user-2', displayName: '상대', role: 'member' },
      ],
    });
  }),
  http.get(`${api}/chat/rooms/:roomId/messages`, ({ params }) => ok(v1ChatMessagesByRoomFixture[String(params.roomId)] ?? v1ChatMessagesFixture)),
  http.post(`${api}/chat/rooms/:roomId/messages`, async ({ params, request }) => {
    const body = await request.json() as { content?: string };
    const sentAt = new Date().toISOString();
    const message = {
      messageId: `message-${Date.now()}`,
      sender: { userId: 'user-1', displayName: '나', profileImageUrl: null },
      content: body.content ?? '',
      status: 'sent',
      sentAt,
      mine: true,
    };
    const roomMessages = v1ChatMessagesByRoomFixture[String(params.roomId)] ?? v1ChatMessagesFixture;
    roomMessages.items.unshift(message);
    const room = v1ChatRoomsFixture.items.find((item) => item.roomId === params.roomId);
    if (room) {
      room.lastMessage = { messageId: message.messageId, contentPreview: `나: ${message.content}`, sentAt };
      room.unreadCount = 0;
    }
    return ok({ messageId: message.messageId, roomId: params.roomId, content: message.content, status: 'sent', sentAt });
  }),
  http.patch(`${api}/chat/rooms/:roomId/me`, async ({ params, request }) => {
    const body = await request.json() as { pinned?: boolean; lastReadMessageId?: string | null; mutedUntil?: string | null };
    const room = v1ChatRoomsFixture.items.find((item) => item.roomId === params.roomId);
    if (room && typeof body.pinned === 'boolean') room.pinned = body.pinned;
    if (room && body.lastReadMessageId !== undefined) room.unreadCount = 0;
    return ok({
      roomId: params.roomId,
      pinned: room?.pinned ?? Boolean(body.pinned),
      mutedUntil: body.mutedUntil ?? null,
      lastReadMessageId: body.lastReadMessageId ?? null,
      status: 'active',
    });
  }),
  http.post(`${api}/chat/rooms/:roomId/leave`, ({ params }) => {
    v1ChatRoomsFixture.items = v1ChatRoomsFixture.items.filter((item) => item.roomId !== params.roomId);
    return ok({ roomId: params.roomId, status: 'left' });
  }),
  http.get(`${api}/notifications`, () => ok(v1NotificationsFixture)),
  http.get(`${api}/reviews`, ({ request }) => {
    const tab = new URL(request.url).searchParams.get('tab');
    return ok(tab === 'written' ? v1ReviewsWrittenFixture : v1ReviewsPendingFixture);
  }),
  http.get(`${api}/reviews/received`, () => ok(v1ReviewsReceivedFixture)),
  http.get(`${api}/reviews/sources/:sourceType/:sourceId`, ({ params }) => {
    return ok(params.sourceType === 'team_match' ? v1ReviewTeamMatchSourceFixture : v1ReviewMatchSourceFixture);
  }),
  http.post(`${api}/reviews`, async ({ request }) => {
    const body = await request.json() as { targetTeamId?: string | null; targetUserId?: string | null };
    if (body.targetUserId === 'user-2') {
      return ok({ ...v1ReviewSubmitFixture, alreadySubmitted: true });
    }
    return ok(v1ReviewSubmitFixture);
  }),
  http.patch(`${api}/notifications/:notificationId/read`, ({ params }) => {
    const readAt = new Date().toISOString();
    const notification = v1NotificationsFixture.items.find((item) => item.notificationId === params.notificationId);
    if (notification) {
      notification.status = 'read';
      notification.readAt = readAt;
      v1NotificationsFixture.unreadCount = v1NotificationsFixture.items.filter((item) => item.status !== 'read').length;
    }
    return ok({ notificationId: params.notificationId, status: 'read', readAt });
  }),
  http.post(`${api}/notifications/read-all`, () => {
    const readAt = new Date().toISOString();
    const updatedCount = v1NotificationsFixture.items.filter((item) => item.status !== 'read').length;
    v1NotificationsFixture.items.forEach((item) => {
      item.status = 'read';
      item.readAt = item.readAt ?? readAt;
    });
    v1NotificationsFixture.unreadCount = 0;
    return ok({ updatedCount, readAt, unreadCount: 0 });
  }),
  http.get(`${api}/notification-preferences`, () => ok(v1SettingsFixture.notifications)),
  http.get(`${api}/me/profile`, () => ok(v1ProfileFixture)),
  http.get(`${api}/me/settings`, () => ok(v1SettingsFixture)),
  http.get(`${api}/admin/me`, () => ok(v1AdminMeFixture)),
  http.get(`${api}/admin/overview`, () => ok(v1AdminOverviewFixture)),
  http.get(`${api}/admin/action-logs`, () => ok(v1AdminLogsFixture)),
  http.get(`${api}/admin/status-change-logs`, () => ok(v1AdminStatusChangeLogsFixture)),
  http.get(`${api}/admin/ops/overview`, () => ok(v1OpsOverviewFixture)),
  http.get(`${api}/admin/reports`, () => ok(v1OpsReportsFixture)),
  http.post(`${api}/admin/reports/:reportId/actions`, async ({ request }) => {
    const body = await request.json() as { action?: string; reason?: string };
    const report = { ...v1OpsReportsFixture.items[0], status: body.action === 'dismiss' ? 'dismissed' : body.action === 'resolve' ? 'resolved' : 'reviewing', resolutionNote: body.reason ?? null };
    return ok({ report });
  }),
  http.get(`${api}/admin/disputes`, () => ok(v1OpsDisputesFixture)),
  http.post(`${api}/admin/disputes/:disputeId/actions`, async ({ request }) => {
    const body = await request.json() as { action?: string; reason?: string };
    const status = body.action === 'reject' ? 'rejected' : body.action === 'resolve' ? 'resolved' : body.action === 'wait' ? 'waiting_party' : 'assigned';
    return ok({ dispute: { ...v1OpsDisputesFixture.items[0], status, resolutionNote: body.reason ?? null } });
  }),
  http.get(`${api}/admin/payments`, () => ok(v1OpsPaymentsFixture)),
  http.post(`${api}/admin/payments/:paymentOrderId/refunds`, async ({ request }) => {
    const body = await request.json() as { amount?: number; reason?: string };
    return ok({
      refund: {
        ...v1OpsPaymentsFixture.items[0].refunds[0],
        amount: body.amount ?? v1OpsPaymentsFixture.items[0].refunds[0].amount,
        reason: body.reason ?? v1OpsPaymentsFixture.items[0].refunds[0].reason,
        status: 'failed',
        failureCode: 'TOSS_PROVIDER_ERROR',
        failureMessage: '테스트 provider 실패',
      },
      providerError: { code: 'TOSS_PROVIDER_ERROR', message: '테스트 provider 실패' },
    });
  }),
  http.get(`${api}/admin/settlements`, () => ok(v1OpsSettlementsFixture)),
  http.post(`${api}/admin/settlements/:settlementBatchId/actions`, async ({ request }) => {
    const body = await request.json() as { action?: string; reason?: string };
    const status = body.action === 'hold' ? 'held' : body.action === 'fail' ? 'failed' : body.action === 'approve' ? 'approved' : 'reviewing';
    return ok({ settlement: { ...v1OpsSettlementsFixture.items[0], status, holdReason: body.reason ?? null } });
  }),
  http.post(`${api}/admin/settlements/:settlementBatchId/payouts`, () => ok({
    payout: v1OpsSettlementsFixture.items[0].payoutAttempts[0],
    settlement: { ...v1OpsSettlementsFixture.items[0], status: 'failed' },
    providerError: { code: 'TOSS_PAYOUT_CONTRACT_REQUIRED', message: '지급대행 계약 및 JWE 보안 키 준비 전에는 지급 성공을 표시하지 않습니다.' },
  })),
  http.get(`${api}/admin/ops/audit`, () => ok(v1OpsAuditFixture)),
];

const levelOrder = ['beginner', 'novice', 'intermediate', 'advanced'];

function rangeMatches(selected: string[], minCode?: string, maxCode?: string) {
  const min = levelOrder.indexOf(minCode ?? '');
  const max = levelOrder.indexOf(maxCode ?? '');
  if (min < 0 || max < 0) return false;
  return selected.some((code) => {
    const order = levelOrder.indexOf(code);
    return order >= min && order <= max;
  });
}
