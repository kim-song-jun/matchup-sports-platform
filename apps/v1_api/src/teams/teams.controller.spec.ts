import { Test } from '@nestjs/testing';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreatorProfileGuard } from '../profile/creator-profile.guard';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

const user = {
  id: 'user-1',
  email: 'member@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('TeamsController', () => {
  const teamsService = {
    list: jest.fn(),
    detail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    joinEligibility: jest.fn(),
    members: jest.fn(),
    myTeams: jest.fn(),
    changeMembershipRole: jest.fn(),
    removeMembership: jest.fn(),
    createJoinApplication: jest.fn(),
    joinApplications: jest.fn(),
    withdrawJoinApplication: jest.fn(),
    approveJoinApplication: jest.fn(),
    rejectJoinApplication: jest.fn(),
  };

  let controller: TeamsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [
        { provide: TeamsService, useValue: teamsService },
        { provide: PrismaService, useValue: {} },
        { provide: OptionalV1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: CreatorProfileGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = moduleRef.get(TeamsController);
  });

  it('returns a team list', async () => {
    teamsService.list.mockResolvedValue({
      items: [{ teamId: 'team-1', name: '강남 러닝 크루' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.list(undefined, { limit: 20 })).resolves.toEqual({
      items: [{ teamId: 'team-1', name: '강남 러닝 크루' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
    expect(teamsService.list).toHaveBeenCalledWith(null, { limit: 20 });
  });

  it('returns team detail', async () => {
    teamsService.detail.mockResolvedValue({
      teamId: 'team-1',
      name: '강남 러닝 크루',
      viewer: { role: 'none', joinState: 'none' },
    });

    await expect(controller.detail(undefined, 'team-1')).resolves.toEqual({
      teamId: 'team-1',
      name: '강남 러닝 크루',
      viewer: { role: 'none', joinState: 'none' },
    });
    expect(teamsService.detail).toHaveBeenCalledWith(null, 'team-1');
  });

  it('creates a team', async () => {
    const dto = {
      sportId: '00000000-0000-4000-8000-000000000001',
      regionId: '00000000-0000-4000-8000-000000000002',
      name: '강남 러닝 크루',
      joinPolicy: 'approval_required' as const,
    };
    teamsService.create.mockResolvedValue({
      teamId: 'team-1',
      membershipId: 'membership-1',
      role: 'owner',
      status: 'active',
    });

    await expect(controller.create(user, dto)).resolves.toEqual({
      teamId: 'team-1',
      membershipId: 'membership-1',
      role: 'owner',
      status: 'active',
    });
  });

  it('updates a team', async () => {
    const dto = {
      sportId: '00000000-0000-4000-8000-000000000001',
      regionId: '00000000-0000-4000-8000-000000000002',
      name: '수정된 팀',
      joinPolicy: 'closed' as const,
      version: '2026-05-18T00:00:00.000Z',
    };
    teamsService.update.mockResolvedValue({
      teamId: 'team-1',
      version: '2026-05-18T00:01:00.000Z',
    });

    await expect(controller.update(user, 'team-1', dto)).resolves.toEqual({
      teamId: 'team-1',
      version: '2026-05-18T00:01:00.000Z',
    });
  });

  it('returns join eligibility', async () => {
    teamsService.joinEligibility.mockResolvedValue({
      teamId: 'team-1',
      eligible: true,
      reasonCode: 'OK',
    });

    await expect(controller.joinEligibility(user, 'team-1')).resolves.toEqual({
      teamId: 'team-1',
      eligible: true,
      reasonCode: 'OK',
    });
  });

  it('returns team members', async () => {
    teamsService.members.mockResolvedValue({
      items: [{ membershipId: 'membership-1', role: 'owner' }],
      summary: { ownerCount: 1, managerCount: 0, memberCount: 1 },
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.members(user, 'team-1', { status: 'active' })).resolves.toEqual({
      items: [{ membershipId: 'membership-1', role: 'owner' }],
      summary: { ownerCount: 1, managerCount: 0, memberCount: 1 },
      pageInfo: { nextCursor: null, hasNext: false },
    });
  });

  it('creates a team join application', async () => {
    teamsService.createJoinApplication.mockResolvedValue({
      applicationId: 'application-1',
      teamId: 'team-1',
      status: 'requested',
      joinState: 'requested',
    });

    await expect(
      controller.createJoinApplication(user, 'team-1', { message: '함께하고 싶습니다.' }),
    ).resolves.toEqual({
      applicationId: 'application-1',
      teamId: 'team-1',
      status: 'requested',
      joinState: 'requested',
    });
  });

  it('returns team join applications', async () => {
    teamsService.joinApplications.mockResolvedValue({
      teamId: 'team-1',
      items: [{ applicationId: 'application-1', status: 'requested' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.joinApplications(user, 'team-1', { status: 'requested' })).resolves.toEqual({
      teamId: 'team-1',
      items: [{ applicationId: 'application-1', status: 'requested' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
  });

  it('returns my teams', async () => {
    teamsService.myTeams.mockResolvedValue({
      items: [{ teamId: 'team-1', role: 'member' }],
    });

    await expect(controller.myTeams(user, { permission: 'apply_team_match' })).resolves.toEqual({
      items: [{ teamId: 'team-1', role: 'member' }],
    });
    expect(teamsService.myTeams).toHaveBeenCalledWith(user, { permission: 'apply_team_match' });
  });

  it('changes membership role', async () => {
    teamsService.changeMembershipRole.mockResolvedValue({
      membershipId: 'membership-2',
      teamId: 'team-1',
      role: 'manager',
      managerCount: 1,
    });

    await expect(
      controller.changeMembershipRole(user, 'membership-2', { role: 'manager' }),
    ).resolves.toEqual({
      membershipId: 'membership-2',
      teamId: 'team-1',
      role: 'manager',
      managerCount: 1,
    });
  });

  it('removes membership', async () => {
    teamsService.removeMembership.mockResolvedValue({
      membershipId: 'membership-2',
      teamId: 'team-1',
      status: 'removed',
    });

    await expect(
      controller.removeMembership(user, 'membership-2', { reason: '운영 정책' }),
    ).resolves.toEqual({
      membershipId: 'membership-2',
      teamId: 'team-1',
      status: 'removed',
    });
  });

  it('withdraws a team join application', async () => {
    teamsService.withdrawJoinApplication.mockResolvedValue({
      applicationId: 'application-1',
      teamId: 'team-1',
      status: 'withdrawn',
    });

    await expect(
      controller.withdrawJoinApplication(user, 'application-1', { reason: '나중에 신청' }),
    ).resolves.toEqual({
      applicationId: 'application-1',
      teamId: 'team-1',
      status: 'withdrawn',
    });
  });

  it('approves a team join application', async () => {
    teamsService.approveJoinApplication.mockResolvedValue({
      applicationId: 'application-1',
      teamId: 'team-1',
      status: 'approved',
      membershipId: 'membership-2',
    });

    await expect(
      controller.approveJoinApplication(user, 'application-1', { note: '환영합니다.' }),
    ).resolves.toEqual({
      applicationId: 'application-1',
      teamId: 'team-1',
      status: 'approved',
      membershipId: 'membership-2',
    });
  });

  it('rejects a team join application', async () => {
    teamsService.rejectJoinApplication.mockResolvedValue({
      applicationId: 'application-1',
      teamId: 'team-1',
      status: 'rejected',
    });

    await expect(
      controller.rejectJoinApplication(user, 'application-1', { reason: '정원 초과' }),
    ).resolves.toEqual({
      applicationId: 'application-1',
      teamId: 'team-1',
      status: 'rejected',
    });
  });
});
