import { http } from 'msw';
import { success, paged } from './_utils';
import {
  mockTeam1,
  mockTeam2,
  mockMyTeamMemberships,
  mockTeamMember,
  mockTeamApplication1,
  mockTeamApplication2,
} from '../../fixtures/teams';

export const teamsHandlers = [
  http.get('/api/v1/teams/me', () => {
    return success(mockMyTeamMemberships);
  }),

  http.get('/api/v1/teams', () => {
    return paged([mockTeam1, mockTeam2]);
  }),

  http.post('/api/v1/teams', () => {
    return success(mockTeam1);
  }),

  http.get('/api/v1/teams/:id', ({ params }) => {
    return success({ ...mockTeam1, id: params.id as string });
  }),

  http.patch('/api/v1/teams/:id', ({ params }) => {
    return success({ ...mockTeam1, id: params.id as string });
  }),

  http.delete('/api/v1/teams/:id', ({ params }) => {
    return success({ id: params.id as string });
  }),

  http.post('/api/v1/teams/:id/apply', ({ params }) => {
    return success({ teamId: params.id as string, status: 'pending' });
  }),

  // Members CRUD
  http.get('/api/v1/teams/:id/members', ({ params }) => {
    return success([{ ...mockTeamMember, teamId: params.id as string }]);
  }),

  http.post('/api/v1/teams/:id/members', ({ params }) => {
    return success({ ...mockTeamMember, teamId: params.id as string });
  }),

  http.patch('/api/v1/teams/:id/members/:userId', ({ params }) => {
    return success({ ...mockTeamMember, teamId: params.id as string, userId: params.userId as string });
  }),

  http.delete('/api/v1/teams/:id/members/:userId', ({ params }) => {
    return success({ teamId: params.id as string, userId: params.userId as string });
  }),

  http.post('/api/v1/teams/:id/leave', ({ params }) => {
    return success({ teamId: params.id as string });
  }),

  http.post('/api/v1/teams/:id/transfer-ownership', ({ params }) => {
    return success({ teamId: params.id as string, message: '소유권이 이전되었습니다' });
  }),

  // Applications (pending join requests)
  http.get('/api/v1/teams/:id/applications', ({ params }) => {
    return success([
      { ...mockTeamApplication1, teamId: params.id as string },
      { ...mockTeamApplication2, teamId: params.id as string },
    ]);
  }),

  http.patch('/api/v1/teams/:id/applications/:applicantUserId/accept', ({ params }) => {
    return success({ teamId: params.id as string, userId: params.applicantUserId as string, status: 'active' });
  }),

  http.patch('/api/v1/teams/:id/applications/:applicantUserId/reject', ({ params }) => {
    return success({ teamId: params.id as string, userId: params.applicantUserId as string, status: 'left' });
  }),

  // Invitations
  http.get('/api/v1/teams/:teamId/invitations', ({ params }) => {
    return success([
      {
        id: 'inv-1',
        teamId: params.teamId as string,
        team: { id: params.teamId as string, name: '서울 FC', logoUrl: null },
        inviter: { id: 'user-1', nickname: '테스트유저' },
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
  }),

  http.post('/api/v1/teams/:teamId/invitations', async ({ params, request }) => {
    const body = await request.json() as { inviteeId: string; role?: string };
    return success({
      id: 'inv-new',
      teamId: params.teamId as string,
      team: { id: params.teamId as string, name: '서울 FC', logoUrl: null },
      inviter: { id: 'user-1', nickname: '테스트유저' },
      role: body.role ?? 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
  }),

  http.patch('/api/v1/teams/:teamId/invitations/:invId/accept', ({ params }) => {
    return success({
      id: params.invId as string,
      teamId: params.teamId as string,
      role: 'member',
      status: 'accepted',
    });
  }),

  http.patch('/api/v1/teams/:teamId/invitations/:invId/decline', ({ params }) => {
    return success({
      id: params.invId as string,
      teamId: params.teamId as string,
      role: 'member',
      status: 'declined',
    });
  }),
];
