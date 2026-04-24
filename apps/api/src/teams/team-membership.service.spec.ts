import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { TeamMembershipService } from './team-membership.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamRole } from '@prisma/client';

describe('TeamMembershipService', () => {
  let service: TeamMembershipService;
  let prisma: PrismaService;

  const mockPrismaService = {
    teamMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    sportTeam: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamMembershipService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TeamMembershipService>(TeamMembershipService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
    mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', deletedAt: null });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Role hierarchy ─────────────────────────────────────────────────

  describe('role hierarchy: owner > manager > member', () => {
    const teamId = 'team-1';

    it('owner passes assertRole for owner', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm1', teamId, userId: 'u1', role: TeamRole.owner, status: 'active',
      });
      await expect(service.assertRole(teamId, 'u1', TeamRole.owner)).resolves.toBeDefined();
    });

    it('owner passes assertRole for manager', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm1', teamId, userId: 'u1', role: TeamRole.owner, status: 'active',
      });
      await expect(service.assertRole(teamId, 'u1', TeamRole.manager)).resolves.toBeDefined();
    });

    it('owner passes assertRole for member', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm1', teamId, userId: 'u1', role: TeamRole.owner, status: 'active',
      });
      await expect(service.assertRole(teamId, 'u1', TeamRole.member)).resolves.toBeDefined();
    });

    it('manager passes assertRole for manager', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm2', teamId, userId: 'u2', role: TeamRole.manager, status: 'active',
      });
      await expect(service.assertRole(teamId, 'u2', TeamRole.manager)).resolves.toBeDefined();
    });

    it('manager passes assertRole for member', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm2', teamId, userId: 'u2', role: TeamRole.manager, status: 'active',
      });
      await expect(service.assertRole(teamId, 'u2', TeamRole.member)).resolves.toBeDefined();
    });

    it('manager fails assertRole for owner', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm2', teamId, userId: 'u2', role: TeamRole.manager, status: 'active',
      });
      await expect(service.assertRole(teamId, 'u2', TeamRole.owner)).rejects.toThrow(ForbiddenException);
    });

    it('member fails assertRole for manager', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm3', teamId, userId: 'u3', role: TeamRole.member, status: 'active',
      });
      await expect(service.assertRole(teamId, 'u3', TeamRole.manager)).rejects.toThrow(ForbiddenException);
    });

    it('member fails assertRole for owner', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm3', teamId, userId: 'u3', role: TeamRole.member, status: 'active',
      });
      await expect(service.assertRole(teamId, 'u3', TeamRole.owner)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── assertRole: membership does not exist ───────────────────────────

  describe('assertRole when membership does not exist', () => {
    it('throws ForbiddenException when user has no membership', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue(null);

      await expect(service.assertRole('team-1', 'non-member', TeamRole.member)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.assertRole('team-1', 'non-member', TeamRole.member)).rejects.toThrow(
        '팀 권한이 부족합니다',
      );
    });
  });

  // ─── listUserTeams: only active memberships ──────────────────────────

  describe('listUserTeams', () => {
    it('queries only active memberships', async () => {
      mockPrismaService.teamMembership.findMany.mockResolvedValue([]);

      await service.listUserTeams('u1');

      expect(prisma.teamMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            status: 'active',
            team: { deletedAt: null },
          }),
        }),
      );
    });

    it('returns memberships with team data', async () => {
      const mockData = [
        {
          id: 'm1',
          userId: 'u1',
          teamId: 'team-1',
          role: TeamRole.owner,
          status: 'active',
          team: { id: 'team-1', name: 'FC 서울' },
        },
      ];
      mockPrismaService.teamMembership.findMany.mockResolvedValue(mockData);

      const result = await service.listUserTeams('u1');

      expect(result).toEqual(mockData);
    });
  });

  // ─── owner self-leave blocked ─────────────────────────────────────────

  describe('leaveTeam', () => {
    it('blocks owner from self-leaving', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm1',
        teamId: 'team-1',
        userId: 'u1',
        role: TeamRole.owner,
        status: 'active',
      });

      await expect(service.leaveTeam('team-1', 'u1')).rejects.toThrow(ForbiddenException);
      await expect(service.leaveTeam('team-1', 'u1')).rejects.toThrow(
        '팀 소유자는 팀을 탈퇴할 수 없습니다',
      );
    });

    it('allows non-owner to self-leave', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm2',
        teamId: 'team-1',
        userId: 'u2',
        role: TeamRole.member,
        status: 'active',
      });
      mockPrismaService.teamMembership.update.mockResolvedValue({});

      await expect(service.leaveTeam('team-1', 'u2')).resolves.toBeUndefined();
      expect(prisma.teamMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'left' }),
        }),
      );
    });

    it('throws NotFoundException when user is not a member', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue(null);

      await expect(service.leaveTeam('team-1', 'non-member')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── transferOwnership ───────────────────────────────────────────────

  describe('transferOwnership', () => {
    const teamId = 'team-1';
    const fromUserId = 'owner-1';
    const toUserId = 'member-1';

    it('happy path: owner transfers to active member (demoteTo manager)', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm2', teamId, userId: toUserId, role: TeamRole.member, status: 'active',
      });
      mockPrismaService.$transaction.mockImplementation(async (fn: (tx: typeof mockPrismaService) => Promise<unknown>) => {
        return fn({
          ...mockPrismaService,
          teamMembership: {
            ...mockPrismaService.teamMembership,
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue({}),
          },
          sportTeam: {
            findUnique: jest.fn().mockResolvedValue({ id: teamId, deletedAt: null }),
            update: jest.fn().mockResolvedValue({}),
          },
        });
      });

      await expect(service.transferOwnership(teamId, fromUserId, toUserId, 'manager')).resolves.toBeUndefined();
    });

    it('throws BadRequestException when target is not an active member', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.transferOwnership(teamId, fromUserId, 'non-member', 'member'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when optimistic lock misses (0 rows affected)', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm2', teamId, userId: toUserId, role: TeamRole.member, status: 'active',
      });
      mockPrismaService.$transaction.mockImplementation(async (fn: (tx: typeof mockPrismaService) => Promise<unknown>) => {
        return fn({
          ...mockPrismaService,
          teamMembership: {
            ...mockPrismaService.teamMembership,
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            update: jest.fn(),
          },
          sportTeam: {
            findUnique: jest.fn().mockResolvedValue({ id: teamId, deletedAt: null }),
            update: jest.fn(),
          },
        });
      });

      await expect(
        service.transferOwnership(teamId, fromUserId, toUserId, 'member'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── addMember: conflict check ────────────────────────────────────────

  describe('addMember', () => {
    it('throws ConflictException if user is already an active member', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({
        id: 'm1', teamId: 'team-1', userId: 'u1', role: TeamRole.member, status: 'active',
      });

      await expect(
        service.addMember('team-1', 'u1', TeamRole.member, 'inviter-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates membership when user is not a member', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue(null);
      mockPrismaService.teamMembership.create.mockResolvedValue({
        id: 'm-new', teamId: 'team-1', userId: 'u2', role: TeamRole.member, status: 'active',
      });

      const result = await service.addMember('team-1', 'u2', TeamRole.member, 'inviter-1');

      expect(result).toBeDefined();
      expect(prisma.teamMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            teamId: 'team-1',
            userId: 'u2',
            role: TeamRole.member,
            status: 'active',
            invitedBy: 'inviter-1',
          }),
        }),
      );
    });
  });
});
