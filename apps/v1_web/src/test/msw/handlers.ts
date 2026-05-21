import { http, HttpResponse } from 'msw';
import {
  v1AdminLogsFixture,
  v1AdminOverviewFixture,
  v1ChatMessagesFixture,
  v1ChatRoomsFixture,
  v1HomeFixture,
  v1MatchesFixture,
  v1NoticesFixture,
  v1NotificationsFixture,
  v1ProfileFixture,
  v1RegionsFixture,
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
  http.get(`${api}/home`, () => ok(v1HomeFixture)),
  http.get(`${api}/notices`, () => ok({ notices: v1NoticesFixture, pageInfo: { hasNextPage: false, nextCursor: null } })),
  http.get(`${api}/notices/:noticeId`, ({ params }) => ok({ notice: v1NoticesFixture.find((item) => item.id === params.noticeId) ?? v1NoticesFixture[0] })),
  http.get(`${api}/matches`, () => ok(page(v1MatchesFixture))),
  http.get(`${api}/matches/:matchId`, ({ params }) => ok(v1MatchesFixture.find((item) => item.id === params.matchId) ?? v1MatchesFixture[0])),
  http.get(`${api}/teams`, () => ok(page(v1TeamsFixture))),
  http.get(`${api}/teams/:teamId`, ({ params }) => ok(v1TeamsFixture.find((item) => item.id === params.teamId) ?? v1TeamsFixture[0])),
  http.get(`${api}/me/teams`, () => ok(v1TeamsFixture)),
  http.get(`${api}/team-matches`, () => ok(page(v1TeamMatchesFixture))),
  http.get(`${api}/team-matches/:teamMatchId`, ({ params }) => ok(v1TeamMatchesFixture.find((item) => item.id === params.teamMatchId) ?? v1TeamMatchesFixture[0])),
  http.get(`${api}/chat/rooms`, () => ok(v1ChatRoomsFixture)),
  http.get(`${api}/chat/rooms/:roomId/messages`, () => ok(v1ChatMessagesFixture)),
  http.get(`${api}/notifications`, () => ok(v1NotificationsFixture)),
  http.patch(`${api}/notifications/:notificationId/read`, ({ params }) => ok({ id: params.notificationId, read: true })),
  http.get(`${api}/notification-preferences`, () => ok(v1SettingsFixture.notifications)),
  http.get(`${api}/me/profile`, () => ok(v1ProfileFixture)),
  http.get(`${api}/me/settings`, () => ok(v1SettingsFixture)),
  http.get(`${api}/admin/overview`, () => ok(v1AdminOverviewFixture)),
  http.get(`${api}/admin/action-logs`, () => ok(v1AdminLogsFixture)),
];
