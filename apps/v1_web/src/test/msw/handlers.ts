import { http, HttpResponse } from 'msw';
import {
  v1AdminLogsFixture,
  v1AdminNoticesFixture,
  v1AdminOverviewFixture,
  v1ChatMessagesByRoomFixture,
  v1ChatMessagesFixture,
  v1ChatRoomsFixture,
  v1HomeFixture,
  v1MatchesFixture,
  v1NoticesFixture,
  v1NotificationsFixture,
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

function teamDetail(teamId: string) {
  const team = v1TeamsFixture.find((item) => item.id === teamId) ?? v1TeamsFixture[0];
  return {
    ...team,
    teamId: team.id,
    status: 'active',
    visibility: 'public',
    membersVisibilityEnabled: false,
    canViewMembers: false,
    version: '2026-05-18T00:00:00.000Z',
    sport: team.sport ?? { sportId: 'sport-badminton', name: team.sportName },
    region: team.region ?? { regionId: 'region-seoul-gangdong', name: team.regionName },
    profile: {
      logoUrl: team.logoUrl ?? null,
      coverImageUrl: team.coverImageUrl ?? null,
      introduction: team.introductionPreview ?? null,
      activityAreaText: null,
      skillLevelText: team.skillLevelText ?? team.levelLabel ?? null,
      levelLabel: team.levelLabel ?? null,
      minLevel: team.minLevel ?? null,
      maxLevel: team.maxLevel ?? null,
      genderRule: team.genderRule ?? null,
      joinPolicy: team.joinPolicy,
      memberGoalCount: null,
    },
    owner: {
      userId: 'user-1',
      displayName: '팀장',
      profileImageUrl: null,
    },
    membersPreview: [],
    managerCount: 0,
    trust: {
      trustState: team.trustState === 'none' ? 'sample' : team.trustState,
      score: null,
    },
    viewer: {
      role: 'none',
      membershipId: null,
      joinState: 'none',
      canRequestJoin: team.joinPolicy === 'approval_required',
      disabledReason: null,
      manageRoute: null,
    },
  };
}

export const v1MswHandlers = [
  http.get(`${api}/auth/me`, () => ok(v1UserFixture)),
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
  http.get(`${api}/teams/:teamId`, ({ params }) => ok(teamDetail(String(params.teamId)))),
  http.get(`${api}/teams/:teamId/members`, () => ok({
    items: [
      {
        membershipId: 'membership-1',
        userId: 'user-1',
        displayName: '김도윤',
        realName: '김도윤',
        phone: '01012345678',
        birthDate: '1995-03-15',
        profileImageUrl: null,
        role: 'owner',
        status: 'active',
        joinedAt: '2026-05-18T00:00:00.000Z',
        canChangeRole: false,
        canRemove: false,
      },
      {
        membershipId: 'membership-2',
        userId: 'user-2',
        displayName: '박서준',
        realName: '박서준',
        phone: null,
        birthDate: '1997-08-20',
        profileImageUrl: null,
        role: 'member',
        status: 'active',
        joinedAt: '2026-05-18T00:00:00.000Z',
        canChangeRole: true,
        canRemove: true,
      },
    ],
    summary: { ownerCount: 1, managerCount: 0, memberCount: 2 },
    viewerRole: 'owner',
    membersVisibilityEnabled: true,
    pageInfo: { nextCursor: null, hasNext: false },
  })),
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
        mutedUntil: room.mutedUntil ?? null,
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
    if (room && body.mutedUntil !== undefined) {
      room.mutedUntil = body.mutedUntil;
      room.muted = Boolean(body.mutedUntil && new Date(body.mutedUntil).getTime() > Date.now());
    }
    if (room && body.lastReadMessageId !== undefined) room.unreadCount = 0;
    return ok({
      roomId: params.roomId,
      pinned: room?.pinned ?? Boolean(body.pinned),
      mutedUntil: room?.mutedUntil ?? body.mutedUntil ?? null,
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
  http.get(`${api}/admin/overview`, () => ok(v1AdminOverviewFixture)),
  http.get(`${api}/admin/action-logs`, () => ok(v1AdminLogsFixture)),
  http.get(`${api}/admin/notices`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const category = params.get('category');
    const audience = params.get('audience');
    const q = params.get('q')?.trim().toLowerCase();
    const rows = v1AdminNoticesFixture.filter((notice) => {
      if (status && notice.status !== status) return false;
      if (category && notice.category !== category) return false;
      if (audience && notice.audience !== audience) return false;
      if (q && !`${notice.title} ${notice.body}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return ok(page(rows));
  }),
  http.post(`${api}/admin/notices`, async ({ request }) => {
    const body = await request.json() as {
      audience: 'public' | 'users' | 'admins';
      category: '고정' | '업데이트' | '안내';
      pinned: boolean;
      title: string;
      body: string;
      status: 'draft' | 'published';
    };
    const now = '2026-05-18T10:00:00.000Z';
    const notice = {
      noticeId: 'notice-new',
      audience: body.audience,
      category: body.pinned ? '고정' : body.category === '고정' ? '안내' : body.category,
      pinned: body.pinned,
      title: body.title,
      body: body.body,
      status: body.status,
      publishedAt: body.status === 'published' ? now : null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return ok({ notice });
  }),
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
