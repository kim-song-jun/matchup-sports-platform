import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamMembershipService } from './team-membership.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TeamRole, InvitationStatus } from '@prisma/client';

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: PrismaService;
  let membershipService: TeamMembershipService;
  let notificationsService: NotificationsService;

  // $transaction mock: executes the callback with the same mock object
  const mockTx = {
    sportTeam: { create: jest.fn(), update: jest.fn() },
    teamMembership: { create: jest.fn() },
    teamInvitation: { update: jest.fn() },
  };

  const mockPrismaService = {
    sportTeam: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    teamMembership: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    teamInvitation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  };

  const mockMembershipService = {
    assertRole: jest.fn(),
    getMembership: jest.fn(),
  };

  const mockNotificationsService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TeamMembershipService, useValue: mockMembershipService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    prisma = module.get<PrismaService>(PrismaService);
    membershipService = module.get<TeamMembershipService>(TeamMembershipService);
    notificationsService = module.get<NotificationsService>(NotificationsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const mockTeams = [
      {
        id: 'team-1',
        name: 'FC 서울',
        sportType: 'FUTSAL',
        city: '서울',
        isRecruiting: true,
        createdAt: new Date('2026-03-01'),
        owner: { id: 'u1', nickname: '팀장1', profileImageUrl: null },
      },
      {
        id: 'team-2',
        name: '판교 농구단',
        sportType: 'BASKETBALL',
        city: '성남',
        isRecruiting: false,
        createdAt: new Date('2026-03-02'),
        owner: { id: 'u2', nickname: '팀장2', profileImageUrl: null },
      },
    ];

    it('should return paginated teams', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue(mockTeams);

      const result = await service.findAll({});

      expect(result).toEqual({
        items: mockTeams,
        nextCursor: null,
      });
      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 21,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should return nextCursor when there are more results', async () => {
      const manyTeams = Array.from({ length: 21 }, (_, i) => ({
        id: `team-${i}`,
        name: `팀 ${i}`,
        sportType: 'FUTSAL',
        createdAt: new Date(),
        owner: { id: `u${i}`, nickname: `유저${i}`, profileImageUrl: null },
      }));
      mockPrismaService.sportTeam.findMany.mockResolvedValue(manyTeams);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('team-19');
    });

    it('should filter by sportType', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue([mockTeams[0]]);

      await service.findAll({ sportType: 'FUTSAL' });

      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sportType: 'FUTSAL' }),
        }),
      );
    });

    it('should filter by city', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue([mockTeams[0]]);

      await service.findAll({ city: '서울' });

      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ city: '서울' }),
        }),
      );
    });

    it('should filter by recruiting status', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue([mockTeams[0]]);

      await service.findAll({ recruiting: 'true' });

      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isRecruiting: true }),
        }),
      );
    });

    it('should use cursor-based pagination when cursor provided', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue([mockTeams[1]]);

      await service.findAll({ cursor: 'team-1' });

      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'team-1' },
          skip: 1,
          take: 21,
        }),
      );
    });
  });

  describe('findById', () => {
    const mockTeamDetail = {
      id: 'team-1',
      name: 'FC 서울',
      sportType: 'FUTSAL',
      city: '서울',
      district: '강남구',
      owner: {
        id: 'u1',
        nickname: '팀장',
        profileImageUrl: null,
        mannerScore: 4.5,
      },
    };

    it('should return team with owner details', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue(mockTeamDetail);

      const result = await service.findById('team-1');

      expect(result).toEqual(mockTeamDetail);
      expect(prisma.sportTeam.findUnique).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        include: {
          owner: {
            select: {
              id: true,
              nickname: true,
              profileImageUrl: true,
              mannerScore: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundException when team does not exist', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('non-existent')).rejects.toThrow(
        '팀을 찾을 수 없습니다.',
      );
    });
  });

  describe('create', () => {
    const createData = {
      name: 'FC 새팀',
      sportType: 'FUTSAL',
      description: '즐겁게 운동해요',
      city: '서울',
      district: '강남구',
      memberCount: 5,
      level: 3,
      isRecruiting: true,
      contactInfo: '010-1234-5678',
    };

    const createdTeam = {
      id: 'team-new',
      ownerId: 'user-1',
      ...createData,
      logoUrl: undefined,
      coverImageUrl: undefined,
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockTx.sportTeam.create.mockResolvedValue(createdTeam);
      mockTx.teamMembership.create.mockResolvedValue({});
    });

    it('should create a team and auto-create owner membership inside a transaction', async () => {
      const result = await service.create('user-1', createData);

      expect(result).toEqual(createdTeam);
      expect(mockTx.sportTeam.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: 'user-1',
          name: 'FC 새팀',
          sportType: 'FUTSAL',
          description: '즐겁게 운동해요',
          city: '서울',
          district: '강남구',
          memberCount: 5,
          level: 3,
          isRecruiting: true,
          contactInfo: '010-1234-5678',
        }),
      });
    });

    it('should auto-create owner membership with role=owner and status=active', async () => {
      await service.create('user-1', createData);

      expect(mockTx.teamMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          teamId: 'team-new',
          userId: 'user-1',
          role: 'owner',
          status: 'active',
        }),
      });
    });

    it('should use default values for optional fields', async () => {
      const minimalData = {
        name: '최소 팀',
        sportType: 'BASKETBALL',
      };

      mockTx.sportTeam.create.mockResolvedValue({
        id: 'team-min',
        ownerId: 'user-1',
        ...minimalData,
      });

      await service.create('user-1', minimalData);

      expect(mockTx.sportTeam.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: 'user-1',
          name: '최소 팀',
          memberCount: 1,
          level: 3,
          isRecruiting: true,
        }),
      });
    });
  });

  // ─── Invitation Tests ──────────────────────────────────────────────────────

  describe('inviteMember', () => {
    const mockTeam = {
      id: 'team-1',
      name: 'FC 서울',
      sportType: 'FUTSAL',
      owner: { id: 'owner-1', nickname: '팀장', profileImageUrl: null, mannerScore: 4.5 },
    };
    const mockInvitee = { id: 'invitee-1', nickname: '초대받은유저' };
    const mockInvitation = {
      id: 'inv-1',
      teamId: 'team-1',
      inviterId: 'manager-1',
      inviteeId: 'invitee-1',
      role: TeamRole.member,
      status: InvitationStatus.pending,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      inviter: { id: 'manager-1', nickname: '매니저' },
      invitee: { id: 'invitee-1', nickname: '초대받은유저' },
      team: { id: 'team-1', name: 'FC 서울' },
    };

    beforeEach(() => {
      mockMembershipService.assertRole.mockResolvedValue({});
      mockMembershipService.getMembership.mockResolvedValue(null);
      mockPrismaService.sportTeam.findUnique.mockResolvedValue(mockTeam);
      mockPrismaService.user.findFirst.mockResolvedValue(mockInvitee);
      mockPrismaService.teamInvitation.findUnique.mockResolvedValue(null);
      mockPrismaService.teamInvitation.upsert.mockResolvedValue(mockInvitation);
      mockNotificationsService.create.mockResolvedValue({});
    });

    it('should create an invitation and send notification', async () => {
      const result = await service.inviteMember('team-1', 'manager-1', 'invitee-1');

      expect(result).toEqual(mockInvitation);
      expect(mockMembershipService.assertRole).toHaveBeenCalledWith('team-1', 'manager-1', TeamRole.manager);
      expect(mockPrismaService.teamInvitation.upsert).toHaveBeenCalled();
    });

    it('should throw BadRequestException when inviting self', async () => {
      await expect(
        service.inviteMember('team-1', 'manager-1', 'manager-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when invitee does not exist', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.inviteMember('team-1', 'manager-1', 'ghost-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when invitee is already a member', async () => {
      mockMembershipService.getMembership.mockResolvedValue({
        id: 'm-1',
        teamId: 'team-1',
        userId: 'invitee-1',
        role: TeamRole.member,
        status: 'active',
      });

      await expect(
        service.inviteMember('team-1', 'manager-1', 'invitee-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when pending invitation already exists', async () => {
      mockPrismaService.teamInvitation.findUnique.mockResolvedValue({
        id: 'inv-existing',
        status: InvitationStatus.pending,
      });

      await expect(
        service.inviteMember('team-1', 'manager-1', 'invitee-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException when caller lacks manager role', async () => {
      mockMembershipService.assertRole.mockRejectedValue(
        new ForbiddenException('팀 권한이 부족합니다'),
      );

      await expect(
        service.inviteMember('team-1', 'regular-member', 'invitee-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow re-invitation when previous invitation is declined', async () => {
      mockPrismaService.teamInvitation.findUnique.mockResolvedValue({
        id: 'inv-old',
        status: InvitationStatus.declined,
      });

      const result = await service.inviteMember('team-1', 'manager-1', 'invitee-1');

      expect(result).toEqual(mockInvitation);
      expect(mockPrismaService.teamInvitation.upsert).toHaveBeenCalled();
    });
  });

  describe('acceptInvitation', () => {
    const pendingInvitation = {
      id: 'inv-1',
      teamId: 'team-1',
      inviterId: 'manager-1',
      inviteeId: 'invitee-1',
      role: TeamRole.member,
      status: InvitationStatus.pending,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    beforeEach(() => {
      mockPrismaService.teamInvitation.findFirst.mockResolvedValue(pendingInvitation);
      mockTx.teamInvitation.update.mockResolvedValue({});
      mockTx.teamMembership.create.mockResolvedValue({});
      mockTx.sportTeam.update.mockResolvedValue({});
    });

    it('should accept invitation and create membership', async () => {
      const result = await service.acceptInvitation('team-1', 'inv-1', 'invitee-1');

      expect(result).toEqual({ accepted: true });
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when invitation does not exist', async () => {
      mockPrismaService.teamInvitation.findFirst.mockResolvedValue(null);

      await expect(
        service.acceptInvitation('team-1', 'inv-missing', 'invitee-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-invitee tries to accept', async () => {
      await expect(
        service.acceptInvitation('team-1', 'inv-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when invitation is not pending', async () => {
      mockPrismaService.teamInvitation.findFirst.mockResolvedValue({
        ...pendingInvitation,
        status: InvitationStatus.declined,
      });

      await expect(
        service.acceptInvitation('team-1', 'inv-1', 'invitee-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException and mark expired when invitation has expired', async () => {
      mockPrismaService.teamInvitation.findFirst.mockResolvedValue({
        ...pendingInvitation,
        expiresAt: new Date(Date.now() - 1000),
      });
      mockPrismaService.teamInvitation.update.mockResolvedValue({});

      await expect(
        service.acceptInvitation('team-1', 'inv-1', 'invitee-1'),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.teamInvitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvitationStatus.expired },
      });
    });
  });

  describe('declineInvitation', () => {
    const pendingInvitation = {
      id: 'inv-1',
      teamId: 'team-1',
      inviterId: 'manager-1',
      inviteeId: 'invitee-1',
      role: TeamRole.member,
      status: InvitationStatus.pending,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    beforeEach(() => {
      mockPrismaService.teamInvitation.findFirst.mockResolvedValue(pendingInvitation);
      mockPrismaService.teamInvitation.update.mockResolvedValue({
        ...pendingInvitation,
        status: InvitationStatus.declined,
      });
    });

    it('should decline invitation successfully', async () => {
      const result = await service.declineInvitation('team-1', 'inv-1', 'invitee-1');

      expect(result).toEqual({ declined: true });
      expect(mockPrismaService.teamInvitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvitationStatus.declined },
      });
    });

    it('should throw NotFoundException when invitation does not exist', async () => {
      mockPrismaService.teamInvitation.findFirst.mockResolvedValue(null);

      await expect(
        service.declineInvitation('team-1', 'inv-missing', 'invitee-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-invitee tries to decline', async () => {
      await expect(
        service.declineInvitation('team-1', 'inv-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when invitation is already declined', async () => {
      mockPrismaService.teamInvitation.findFirst.mockResolvedValue({
        ...pendingInvitation,
        status: InvitationStatus.declined,
      });

      await expect(
        service.declineInvitation('team-1', 'inv-1', 'invitee-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('applyToTeam', () => {
    const mockTeamRecruiting = {
      id: 'team-1',
      name: 'FC 서울',
      isRecruiting: true,
    };

    const mockPendingMembership = {
      id: 'mem-1',
      teamId: 'team-1',
      userId: 'user-1',
      role: 'member',
      status: 'pending',
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue(mockTeamRecruiting);
      mockPrismaService.teamMembership.findFirst.mockResolvedValue(null);
      mockPrismaService.teamMembership.create.mockResolvedValue(mockPendingMembership);
    });

    it('should create and return a pending membership on success', async () => {
      const result = await service.applyToTeam('team-1', 'user-1');

      expect(result).toEqual(mockPendingMembership);
      expect(mockPrismaService.teamMembership.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', userId: 'user-1', role: 'member', status: 'pending' },
      });
    });

    it('should allow re-application after left/removed status via update', async () => {
      const existingLeft = { ...mockPendingMembership, id: 'mem-2', status: 'left' };
      const reapplyMembership = { ...mockPendingMembership, id: 'mem-2' };
      mockPrismaService.teamMembership.findFirst.mockResolvedValue(existingLeft);
      mockPrismaService.teamMembership.update.mockResolvedValue(reapplyMembership);

      const result = await service.applyToTeam('team-1', 'user-1');

      expect(result).toEqual(reapplyMembership);
      expect(mockPrismaService.teamMembership.update).toHaveBeenCalledWith({
        where: { id: 'mem-2' },
        data: { role: 'member', status: 'pending' },
      });
    });

    it('should throw ConflictException (TEAM_APPLY_DUPLICATE) on P2002 race condition', async () => {
      const p2002 = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
        clientVersion: '6.0.0',
      });
      Object.setPrototypeOf(p2002, (await import('@prisma/client')).Prisma.PrismaClientKnownRequestError.prototype);
      mockPrismaService.teamMembership.create.mockRejectedValue(p2002);

      await expect(service.applyToTeam('team-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when team does not exist', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue(null);

      await expect(service.applyToTeam('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when team is not recruiting', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({
        ...mockTeamRecruiting,
        isRecruiting: false,
      });

      await expect(service.applyToTeam('team-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException (TEAM_ALREADY_MEMBER) when user is already an active member', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({ id: 'mem-active', status: 'active' });

      await expect(service.applyToTeam('team-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException (TEAM_APPLY_PENDING_EXISTS) when a pending application already exists', async () => {
      mockPrismaService.teamMembership.findFirst.mockResolvedValue({ id: 'mem-pending', status: 'pending' });

      await expect(service.applyToTeam('team-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getMyInvitations', () => {
    it('should return pending non-expired invitations for the user', async () => {
      const mockInvitations = [
        {
          id: 'inv-1',
          teamId: 'team-1',
          inviteeId: 'user-1',
          status: InvitationStatus.pending,
          team: { id: 'team-1', name: 'FC 서울', logoUrl: null, sportType: 'FUTSAL' },
          inviter: { id: 'manager-1', nickname: '매니저', profileImageUrl: null },
        },
      ];
      mockPrismaService.teamInvitation.findMany.mockResolvedValue(mockInvitations);

      const result = await service.getMyInvitations('user-1');

      expect(result).toEqual(mockInvitations);
      expect(mockPrismaService.teamInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            inviteeId: 'user-1',
            status: InvitationStatus.pending,
          }),
        }),
      );
    });
  });
});
