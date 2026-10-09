import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

const user = {
  id: 'admin-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('AdminService.getTeamMatchPendingApplicationCount', () => {
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1TeamMatchApplication: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1TeamMatchApplication: { count: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AdminService);
  });

  it('rejects non-admins before touching the database', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.getTeamMatchPendingApplicationCount(user)).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TeamMatchApplication.count).not.toHaveBeenCalled();
  });

  it('counts only requested applications on platform-managed, recruiting matches with no league/tournament owner', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue({
      id: 'a',
      userId: user.id,
      adminRole: 'support',
      status: 'active',
      user: { accountStatus: 'active' },
    });
    prisma.v1TeamMatchApplication.count.mockResolvedValue(4);

    await expect(service.getTeamMatchPendingApplicationCount(user)).resolves.toEqual({ count: 4 });
    expect(prisma.v1TeamMatchApplication.count).toHaveBeenCalledWith({
      where: {
        status: 'requested',
        teamMatch: { platformManaged: true, leagueId: null, tournamentId: null, status: 'recruiting' },
      },
    });
  });
});
