import { http } from 'msw';
import { success } from './_utils';
import { mockUser, mockUserB } from '../../fixtures/users';

export const usersHandlers = [
  http.get('/api/v1/users/me', () => {
    return success(mockUser);
  }),

  http.patch('/api/v1/users/me', async ({ request }) => {
    const body = await request.json() as Partial<typeof mockUser>;
    return success({ ...mockUser, ...body });
  }),

  http.get('/api/v1/users/me/matches', () => {
    return success([]);
  }),

  http.get('/api/v1/users/me/invitations', () => {
    return success([
      {
        id: 'inv-1',
        teamId: 'team-1',
        team: { id: 'team-1', name: '서울 FC', logoUrl: null },
        inviter: { id: 'user-2', nickname: '초대자' },
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
  }),

  http.get('/api/v1/users/search', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    return success(
      q.length >= 2
        ? [{ id: mockUserB.id, nickname: `${q}유저`, email: null, profileImageUrl: null, mannerScore: 4.0, totalMatches: 5 }]
        : [],
    );
  }),

  http.get('/api/v1/users/:id', ({ params }) => {
    // Return PII-stripped public profile (no email/phone per §9.1)
    return success({
      id: params.id as string,
      nickname: mockUser.nickname,
      profileImageUrl: mockUser.profileImageUrl,
      sportProfiles: [],
      mannerScore: mockUser.mannerScore,
      recentMatchCount: mockUser.totalMatches,
    });
  }),
];
