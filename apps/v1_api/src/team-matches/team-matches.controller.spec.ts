import { Test } from '@nestjs/testing';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TeamMatchesController } from './team-matches.controller';
import { TeamMatchesService } from './team-matches.service';

const user = {
  id: 'user-1',
  email: 'owner@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('TeamMatchesController', () => {
  const teamMatchesService = {
    list: jest.fn(),
    detail: jest.fn(),
    applicationEligibility: jest.fn(),
    myTeamMatches: jest.fn(),
    create: jest.fn(),
    edit: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    close: jest.fn(),
    reopen: jest.fn(),
    complete: jest.fn(),
    createApplication: jest.fn(),
    applications: jest.fn(),
    withdrawApplication: jest.fn(),
    approveApplication: jest.fn(),
    rejectApplication: jest.fn(),
  };

  let controller: TeamMatchesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [TeamMatchesController],
      providers: [
        { provide: TeamMatchesService, useValue: teamMatchesService },
        { provide: PrismaService, useValue: {} },
        { provide: OptionalV1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = moduleRef.get(TeamMatchesController);
  });

  it('returns team match list', async () => {
    teamMatchesService.list.mockResolvedValue({
      items: [{ teamMatchId: 'team-match-1', title: '풋살 상대팀 모집' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.list(undefined, { limit: 20 })).resolves.toEqual({
      items: [{ teamMatchId: 'team-match-1', title: '풋살 상대팀 모집' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
  });

  it('returns team match detail', async () => {
    teamMatchesService.detail.mockResolvedValue({
      teamMatchId: 'team-match-1',
      viewer: { state: 'guest' },
    });

    await expect(controller.detail(undefined, 'team-match-1')).resolves.toEqual({
      teamMatchId: 'team-match-1',
      viewer: { state: 'guest' },
    });
  });

  it('returns application eligibility', async () => {
    teamMatchesService.applicationEligibility.mockResolvedValue({
      teamMatchId: 'team-match-1',
      teams: [{ teamId: 'team-1', eligible: true }],
    });

    await expect(
      controller.applicationEligibility(user, 'team-match-1', { teamId: 'team-1' }),
    ).resolves.toEqual({
      teamMatchId: 'team-match-1',
      teams: [{ teamId: 'team-1', eligible: true }],
    });
  });

  it('creates a team match', async () => {
    const dto = {
      hostTeamId: '00000000-0000-4000-8000-000000000101',
      sportId: '00000000-0000-4000-8000-000000000001',
      regionId: '00000000-0000-4000-8000-000000000002',
      title: '풋살 상대팀 모집',
      startsAt: '2026-06-01T10:00:00.000Z',
      manualPlaceName: '잠실 풋살장',
    };
    teamMatchesService.create.mockResolvedValue({
      teamMatchId: 'team-match-1',
      status: 'recruiting',
      hostTeamId: dto.hostTeamId,
    });

    await expect(controller.create(user, dto)).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'recruiting',
      hostTeamId: dto.hostTeamId,
    });
  });

  it('returns edit prefill', async () => {
    teamMatchesService.edit.mockResolvedValue({
      teamMatchId: 'team-match-1',
      editable: true,
      form: { title: '풋살 상대팀 모집' },
    });

    await expect(controller.edit(user, 'team-match-1')).resolves.toEqual({
      teamMatchId: 'team-match-1',
      editable: true,
      form: { title: '풋살 상대팀 모집' },
    });
  });

  it('updates a team match', async () => {
    const dto = {
      hostTeamId: '00000000-0000-4000-8000-000000000101',
      sportId: '00000000-0000-4000-8000-000000000001',
      regionId: '00000000-0000-4000-8000-000000000002',
      title: '수정된 팀매치',
      startsAt: '2026-06-01T10:00:00.000Z',
      manualPlaceName: '잠실 풋살장',
      version: '2026-05-18T00:00:00.000Z',
    };
    teamMatchesService.update.mockResolvedValue({
      teamMatchId: 'team-match-1',
      version: '2026-05-18T00:01:00.000Z',
    });

    await expect(controller.update(user, 'team-match-1', dto)).resolves.toEqual({
      teamMatchId: 'team-match-1',
      version: '2026-05-18T00:01:00.000Z',
    });
  });

  it('cancels a team match', async () => {
    teamMatchesService.cancel.mockResolvedValue({
      teamMatchId: 'team-match-1',
      status: 'cancelled',
      cancelledApplications: 1,
    });

    await expect(controller.cancel(user, 'team-match-1', { reason: '일정 변경' })).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'cancelled',
      cancelledApplications: 1,
    });
  });

  it('closes a team match', async () => {
    teamMatchesService.close.mockResolvedValue({
      teamMatchId: 'team-match-1',
      status: 'closed',
      expiredApplications: 2,
    });

    await expect(controller.close(user, 'team-match-1', { reason: '모집 완료' })).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'closed',
      expiredApplications: 2,
    });
  });

  it('reopens a team match', async () => {
    teamMatchesService.reopen.mockResolvedValue({
      teamMatchId: 'team-match-1',
      status: 'recruiting',
    });

    await expect(controller.reopen(user, 'team-match-1', { reason: '추가 모집' })).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'recruiting',
    });
  });

  it('completes a team match', async () => {
    teamMatchesService.complete.mockResolvedValue({
      teamMatchId: 'team-match-1',
      status: 'completed',
      completedAt: '2026-05-18T12:00:00.000Z',
    });

    await expect(controller.complete(user, 'team-match-1', { note: '경기 완료' })).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'completed',
      completedAt: '2026-05-18T12:00:00.000Z',
    });
  });

  it('creates a team match application', async () => {
    teamMatchesService.createApplication.mockResolvedValue({
      applicationId: 'application-1',
      teamMatchId: 'team-match-1',
      applicantTeamId: 'team-2',
      status: 'requested',
    });

    await expect(
      controller.createApplication(user, 'team-match-1', {
        applicantTeamId: 'team-2',
        message: '상대팀으로 신청합니다.',
      }),
    ).resolves.toEqual({
      applicationId: 'application-1',
      teamMatchId: 'team-match-1',
      applicantTeamId: 'team-2',
      status: 'requested',
    });
  });

  it('returns team match applications', async () => {
    teamMatchesService.applications.mockResolvedValue({
      teamMatchId: 'team-match-1',
      items: [{ applicationId: 'application-1', status: 'requested' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(
      controller.applications(user, 'team-match-1', { status: 'requested' }),
    ).resolves.toEqual({
      teamMatchId: 'team-match-1',
      items: [{ applicationId: 'application-1', status: 'requested' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
  });

  it('withdraws a team match application', async () => {
    teamMatchesService.withdrawApplication.mockResolvedValue({
      applicationId: 'application-1',
      status: 'withdrawn',
    });

    await expect(
      controller.withdrawApplication(user, 'application-1', { reason: '일정 변경' }),
    ).resolves.toEqual({
      applicationId: 'application-1',
      status: 'withdrawn',
    });
  });

  it('approves a team match application', async () => {
    teamMatchesService.approveApplication.mockResolvedValue({
      applicationId: 'application-1',
      status: 'approved',
      teamMatchStatus: 'matched',
    });

    await expect(
      controller.approveApplication(user, 'application-1', { note: '승인합니다.' }),
    ).resolves.toEqual({
      applicationId: 'application-1',
      status: 'approved',
      teamMatchStatus: 'matched',
    });
  });

  it('rejects a team match application', async () => {
    teamMatchesService.rejectApplication.mockResolvedValue({
      applicationId: 'application-1',
      status: 'rejected',
    });

    await expect(
      controller.rejectApplication(user, 'application-1', { reason: '조건 불일치' }),
    ).resolves.toEqual({
      applicationId: 'application-1',
      status: 'rejected',
    });
  });

  it('returns my team matches', async () => {
    teamMatchesService.myTeamMatches.mockResolvedValue({
      items: [{ teamMatchId: 'team-match-1', relation: 'host_team' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.myTeamMatches(user, { scope: 'hosted' })).resolves.toEqual({
      items: [{ teamMatchId: 'team-match-1', relation: 'host_team' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
  });
});
