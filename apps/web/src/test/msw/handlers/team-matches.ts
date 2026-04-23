import { http } from 'msw';
import { success, paged } from './_utils';
import { mockTeamMatch, mockTeamMatchApplication, mockMyTeamMatchApplications } from '../../fixtures/team-matches';

export const teamMatchesHandlers = [
  http.get('/api/v1/team-matches', ({ request }) => {
    const url = new URL(request.url);
    const teamId = url.searchParams.get('teamId');
    const status = url.searchParams.get('status');

    const baseMatches = [
      mockTeamMatch,
      { ...mockTeamMatch, id: 'tm-2', status: 'scheduled', title: '수요일 팀 매치', hostTeamId: teamId ?? mockTeamMatch.hostTeamId },
      { ...mockTeamMatch, id: 'tm-3', status: 'completed', title: '지난 경기 기록', hostTeamId: teamId ?? mockTeamMatch.hostTeamId },
      { ...mockTeamMatch, id: 'tm-4', status: 'cancelled', title: '취소된 매치', hostTeamId: teamId ?? mockTeamMatch.hostTeamId },
    ];

    const filtered = status
      ? baseMatches.filter((match) => status.split(',').includes(match.status))
      : [mockTeamMatch];

    return paged(filtered.map((match) => (teamId ? { ...match, hostTeamId: teamId } : match)));
  }),

  http.post('/api/v1/team-matches', () => {
    return success(mockTeamMatch);
  }),

  http.patch('/api/v1/team-matches/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return success({
      ...mockTeamMatch,
      id: params.id as string,
      ...body,
    });
  }),

  http.get('/api/v1/team-matches/me/applications', () => {
    return success(mockMyTeamMatchApplications);
  }),

  http.get('/api/v1/team-matches/:id', ({ params }) => {
    return success({ ...mockTeamMatch, id: params.id as string });
  }),

  http.post('/api/v1/team-matches/:id/apply', ({ params }) => {
    return success({ ...mockTeamMatchApplication, teamMatchId: params.id as string });
  }),

  http.get('/api/v1/team-matches/:id/applications', ({ params }) => {
    return success([{ ...mockTeamMatchApplication, teamMatchId: params.id as string }]);
  }),

  http.patch('/api/v1/team-matches/:id/applications/:appId/approve', ({ params }) => {
    return success({ id: params.appId as string, status: 'approved' });
  }),

  http.patch('/api/v1/team-matches/:id/applications/:appId/reject', ({ params }) => {
    return success({ id: params.appId as string, status: 'rejected' });
  }),

  http.post('/api/v1/team-matches/:id/check-in', ({ params }) => {
    return success({ teamMatchId: params.id as string, arrivedAt: new Date().toISOString() });
  }),

  http.post('/api/v1/team-matches/:id/result', ({ params }) => {
    return success({ ...mockTeamMatch, id: params.id as string, status: 'completed' });
  }),

  http.post('/api/v1/team-matches/:id/evaluate', ({ params }) => {
    return success({ teamMatchId: params.id as string, evaluated: true });
  }),

  http.get('/api/v1/team-matches/:id/referee-schedule', ({ params }) => {
    return success({
      hasReferee: mockTeamMatch.hasReferee,
      quarterCount: mockTeamMatch.quarterCount,
      schedule: null,
      teamMatchId: params.id as string,
    });
  }),
];
