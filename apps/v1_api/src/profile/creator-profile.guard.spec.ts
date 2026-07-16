import { UnprocessableEntityException } from '@nestjs/common';
import { CreatorProfileGuard } from './creator-profile.guard';

function contextFor(userId?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ v1User: userId ? { id: userId } : undefined }),
    }),
  } as never;
}

describe('CreatorProfileGuard', () => {
  it('allows creation when real name, phone, and gender exist', async () => {
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({
          phone: '01012345678',
          profile: { realName: '김민수', gender: 'male' },
        }),
      },
    };
    const guard = new CreatorProfileGuard(prisma as never);

    await expect(guard.canActivate(contextFor('user-1'))).resolves.toBe(true);
  });

  it('reports every missing creator profile field', async () => {
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({
          phone: null,
          profile: { realName: '  ', gender: null },
        }),
      },
    };
    const guard = new CreatorProfileGuard(prisma as never);

    await expect(guard.canActivate(contextFor('user-1'))).rejects.toMatchObject({
      response: {
        code: 'PROFILE_COMPLETION_REQUIRED',
        details: {
          missingFields: ['realName', 'phone', 'gender'],
          next: { route: '/my/profile/edit' },
        },
      },
    });
  });

  it('does not treat a missing authenticated user as complete', async () => {
    const guard = new CreatorProfileGuard({ v1User: { findUnique: jest.fn() } } as never);

    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});