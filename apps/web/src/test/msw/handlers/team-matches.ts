import { http } from 'msw';
import { success, paged } from './_utils';
import { mockTeamMatch, mockTeamMatchApplication, mockMyTeamMatchApplications } from '../../fixtures/team-matches';

export const teamMatchesHandlers = [
  http.get('/api/v1/team-matches', () => {
    return paged([mockTeamMatch]);
  }),

  http.post('/api/v1/team-matches', () => {
    return success(mockTeamMatch);
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
