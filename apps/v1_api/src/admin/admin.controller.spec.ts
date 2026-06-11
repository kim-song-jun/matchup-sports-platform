import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

const user = {
  id: 'admin-user-1',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('AdminController', () => {
  const adminService = {
    me: jest.fn(),
    overview: jest.fn(),
    changeUserStatus: jest.fn(),
    changeMatchStatus: jest.fn(),
    changeTeamStatus: jest.fn(),
    changeTeamMatchStatus: jest.fn(),
    actionLogs: jest.fn(),
    statusChangeLogs: jest.fn(),
    listUsers: jest.fn(),
    getUser: jest.fn(),
    listMatches: jest.fn(),
    getMatch: jest.fn(),
    listTeams: jest.fn(),
    getTeam: jest.fn(),
    listTeamMatches: jest.fn(),
  };

  let controller: AdminController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: PrismaService, useValue: {} },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = moduleRef.get(AdminController);
  });

  it('returns admin me', async () => {
    adminService.me.mockResolvedValue({ userId: 'admin-user-1', adminRole: 'owner' });
    await expect(controller.me(user)).resolves.toEqual({ userId: 'admin-user-1', adminRole: 'owner' });
  });

  it('returns admin overview', async () => {
    const query = { from: '2026-05-01', to: '2026-05-18' };
    adminService.overview.mockResolvedValue({ users: { active: 10 } });
    await expect(controller.overview(user, query)).resolves.toEqual({ users: { active: 10 } });
    expect(adminService.overview).toHaveBeenCalledWith(user, query);
  });

  it('changes user status', async () => {
    const dto = { status: 'suspended' as const, reason: '운영 정책 위반' };
    adminService.changeUserStatus.mockResolvedValue({ userId: 'user-1', status: 'suspended' });
    await expect(controller.changeUserStatus(user, 'user-1', dto)).resolves.toEqual({
      userId: 'user-1',
      status: 'suspended',
    });
  });

  it('changes match status', async () => {
    const dto = { status: 'closed' as const, reason: '모집 마감' };
    adminService.changeMatchStatus.mockResolvedValue({ matchId: 'match-1', status: 'closed' });
    await expect(controller.changeMatchStatus(user, 'match-1', dto)).resolves.toEqual({
      matchId: 'match-1',
      status: 'closed',
    });
  });

  it('changes team status', async () => {
    const dto = { status: 'archived' as const, reason: '비활성 팀 정리' };
    adminService.changeTeamStatus.mockResolvedValue({ teamId: 'team-1', status: 'archived' });
    await expect(controller.changeTeamStatus(user, 'team-1', dto)).resolves.toEqual({
      teamId: 'team-1',
      status: 'archived',
    });
  });

  it('changes team match status', async () => {
    const dto = { status: 'cancelled' as const, reason: '운영 취소' };
    adminService.changeTeamMatchStatus.mockResolvedValue({
      teamMatchId: 'team-match-1',
      status: 'cancelled',
    });
    await expect(controller.changeTeamMatchStatus(user, 'team-match-1', dto)).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'cancelled',
    });
  });

  it('returns admin action logs', async () => {
    const query = { targetType: 'match', limit: 10 };
    adminService.actionLogs.mockResolvedValue({ items: [], nextCursor: null });
    await expect(controller.actionLogs(user, query)).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('returns status change logs', async () => {
    const query = { targetType: 'user', targetId: 'user-1' };
    adminService.statusChangeLogs.mockResolvedValue({ items: [], nextCursor: null });
    await expect(controller.statusChangeLogs(user, query)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  // ─── User list / detail ────────────────────────────────────────────────────

  it('lists users and returns items + pageInfo', async () => {
    const query = { limit: 20 };
    const payload = {
      items: [
        {
          userId: 'u-1',
          nickname: '호스트민',
          displayName: '호스트민',
          email: 'host@teameet.v1',
          accountStatus: 'active',
          onboardingStatus: 'completed',
          lastLoginAt: null,
          createdAt: new Date('2026-05-18T00:00:00.000Z'),
          hostedMatchCount: 3,
          ownedTeamCount: 1,
          membershipCount: 2,
          adminRole: null,
        },
      ],
      pageInfo: { nextCursor: null, hasNext: false },
    };
    adminService.listUsers.mockResolvedValue(payload);
    await expect(controller.listUsers(user, query)).resolves.toEqual(payload);
    expect(adminService.listUsers).toHaveBeenCalledWith(user, query);
  });

  it('gets a single user detail', async () => {
    const payload = {
      userId: 'u-1',
      nickname: '호스트민',
      displayName: '호스트민',
      email: 'host@teameet.v1',
      accountStatus: 'active',
      onboardingStatus: 'completed',
      lastLoginAt: null,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      hostedMatchCount: 3,
      ownedTeamCount: 1,
      membershipCount: 2,
      adminRole: null,
      reputationSummary: null,
      hostedMatches: [],
      ownedTeams: [],
    };
    adminService.getUser.mockResolvedValue(payload);
    await expect(controller.getUser(user, 'u-1')).resolves.toEqual(payload);
    expect(adminService.getUser).toHaveBeenCalledWith(user, 'u-1');
  });

  // ─── Match list / detail ────────────────────────────────────────────────────

  it('lists matches and returns items + pageInfo', async () => {
    const query = { status: 'recruiting' as const, limit: 10 };
    const payload = {
      items: [
        {
          matchId: 'm-1',
          title: '강남 저녁 러닝',
          sportName: '러닝',
          sportCode: 'running',
          hostUserId: 'u-1',
          hostName: '호스트민',
          placeName: '강남역',
          startAt: new Date('2026-06-20T10:00:00.000Z'),
          status: 'recruiting',
          participantCount: 1,
          maxParticipants: 6,
          createdAt: new Date('2026-05-18T00:00:00.000Z'),
        },
      ],
      pageInfo: { nextCursor: null, hasNext: false },
    };
    adminService.listMatches.mockResolvedValue(payload);
    await expect(controller.listMatches(user, query)).resolves.toEqual(payload);
    expect(adminService.listMatches).toHaveBeenCalledWith(user, query);
  });

  it('gets a single match detail', async () => {
    const payload = {
      matchId: 'm-1',
      title: '강남 저녁 러닝',
      description: '가볍게 5km',
      sportName: '러닝',
      sportCode: 'running',
      hostUserId: 'u-1',
      hostName: '호스트민',
      regionName: '강남구',
      placeName: '강남역',
      startAt: new Date('2026-06-20T10:00:00.000Z'),
      deadlineAt: null,
      status: 'recruiting',
      participantCount: 1,
      applicationCount: 0,
      maxParticipants: 6,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
    };
    adminService.getMatch.mockResolvedValue(payload);
    await expect(controller.getMatch(user, 'm-1')).resolves.toEqual(payload);
    expect(adminService.getMatch).toHaveBeenCalledWith(user, 'm-1');
  });

  // ─── Team list / detail ────────────────────────────────────────────────────

  it('lists teams and returns items + pageInfo', async () => {
    const query = { status: 'active' as const };
    const payload = {
      items: [
        {
          teamId: 't-1',
          name: '강남 러닝 크루',
          sportName: '러닝',
          ownerUserId: 'u-1',
          ownerName: '팀장원',
          memberCount: 3,
          managerCount: 1,
          status: 'active',
          createdAt: new Date('2026-05-18T00:00:00.000Z'),
        },
      ],
      pageInfo: { nextCursor: null, hasNext: false },
    };
    adminService.listTeams.mockResolvedValue(payload);
    await expect(controller.listTeams(user, query)).resolves.toEqual(payload);
    expect(adminService.listTeams).toHaveBeenCalledWith(user, query);
  });

  it('gets a single team detail', async () => {
    const payload = {
      teamId: 't-1',
      name: '강남 러닝 크루',
      sportName: '러닝',
      regionName: '강남구',
      ownerUserId: 'u-1',
      ownerName: '팀장원',
      memberCount: 3,
      managerCount: 1,
      status: 'active',
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      trustScore: null,
      recentHostedTeamMatches: [],
    };
    adminService.getTeam.mockResolvedValue(payload);
    await expect(controller.getTeam(user, 't-1')).resolves.toEqual(payload);
    expect(adminService.getTeam).toHaveBeenCalledWith(user, 't-1');
  });

  // ─── Team-match list ───────────────────────────────────────────────────────

  it('lists team-matches and returns items + pageInfo', async () => {
    const query = { status: 'recruiting' as const };
    const payload = {
      items: [
        {
          teamMatchId: 'tm-1',
          title: '토요일 풋살 상대팀 모집',
          hostTeamId: 't-1',
          hostTeamName: '강남 러닝 크루',
          sportName: '풋살',
          startAt: new Date('2026-05-23T05:00:00.000Z'),
          status: 'recruiting',
          createdAt: new Date('2026-05-18T00:00:00.000Z'),
        },
      ],
      pageInfo: { nextCursor: null, hasNext: false },
    };
    adminService.listTeamMatches.mockResolvedValue(payload);
    await expect(controller.listTeamMatches(user, query)).resolves.toEqual(payload);
    expect(adminService.listTeamMatches).toHaveBeenCalledWith(user, query);
  });
});
