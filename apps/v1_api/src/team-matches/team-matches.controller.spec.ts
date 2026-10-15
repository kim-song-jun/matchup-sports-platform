import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { createGlobalValidationPipe } from '../common/global-validation-pipe';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { CreatorProfileGuard } from '../profile/creator-profile.guard';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { FUTSAL_V1_CONFIG } from '../tournaments/competition-config/competition-config.presets';
import { TeamMatchesController } from './team-matches.controller';
import { TeamMatchLineupService } from './team-match-lineup.service';
import { TeamMatchesService } from './team-matches.service';

const user = {
  id: 'user-1',
  email: 'owner@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('TeamMatchesController', () => {
  // Only the four methods team-matches.controller.ts actually delegates to
  // (getLineup / saveLineup / submitLineup / requestChange).
  const teamMatchLineupService = {
    getLineup: jest.fn(),
    saveLineup: jest.fn(),
    submitLineup: jest.fn(),
    requestChange: jest.fn(),
  };

  const teamMatchesService = {
    list: jest.fn(),
    detail: jest.fn(),
    recentVenues: jest.fn(),
    applicationEligibility: jest.fn(),
    myTeamMatches: jest.fn(),
    create: jest.fn(),
    edit: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    close: jest.fn(),
    reopen: jest.fn(),
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
        // Task 14 added TeamMatchLineupService as the controller's second
        // constructor argument; without it Nest cannot instantiate the
        // controller and every test in this file fails at compile(). This
        // drift went undetected because the "V1 API unit tests" job was
        // skipped on every branch until Task 10 landed.
        { provide: TeamMatchLineupService, useValue: teamMatchLineupService },
        { provide: PrismaService, useValue: {} },
        { provide: OptionalV1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: CreatorProfileGuard, useValue: { canActivate: jest.fn(() => true) } },
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

  it('returns recent venues for a host team', async () => {
    teamMatchesService.recentVenues.mockResolvedValue({
      items: [{ placeName: '풋살파크 강서', addressText: '서울 강서구' }],
    });

    await expect(controller.recentVenues(user, 'team-1')).resolves.toEqual({
      items: [{ placeName: '풋살파크 강서', addressText: '서울 강서구' }],
    });
    expect(teamMatchesService.recentVenues).toHaveBeenCalledWith(user, 'team-1');
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

describe('TeamMatchesController rule-options HTTP boundary', () => {
  const hostTeamId = '11111111-1111-4111-8111-111111111111';
  const otherTeamId = '22222222-2222-4222-8222-222222222222';
  const owner: V1AuthUser = {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'rule-owner@teameet.v1',
    accountStatus: 'active',
    onboardingStatus: 'completed',
  };
  const outsider: V1AuthUser = {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'rule-outsider@teameet.v1',
    accountStatus: 'active',
    onboardingStatus: 'completed',
  };
  const ruleOptions = {
    hostTeamId,
    sportId: '55555555-5555-4555-8555-555555555555',
    competitionConfigVersionId: '66666666-6666-4666-8666-666666666666',
    periods: FUTSAL_V1_CONFIG.periods.map((period) => ({ ...period })),
  };
  const teamMatchesService = {
    ruleOptions: jest.fn(async (actor: V1AuthUser, teamId: string) => {
      if (actor.id !== owner.id || teamId !== hostTeamId) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: '팀 관리 권한이 필요해요.',
        });
      }
      return ruleOptions;
    }),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TeamMatchesController],
      providers: [
        { provide: TeamMatchesService, useValue: teamMatchesService },
        { provide: TeamMatchLineupService, useValue: {} },
        {
          provide: PrismaService,
          useValue: {
            v1User: {
              findFirst: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
                const actor = [owner, outsider].find(
                  (candidate) => candidate.id === where.id || candidate.email === where.email,
                );
                return actor
                  ? { ...actor, phoneVerifiedAt: new Date('2026-10-13T00:00:00.000Z'), adminUser: null }
                  : null;
              }),
            },
          },
        },
        {
          provide: ManagedTermsRuntimeService,
          useValue: {
            signupCompliance: jest.fn(async () => ({
              compliant: true,
              pendingRequiredDocumentIds: [],
              nextRoute: null,
            })),
          },
        },
        V1AuthGuard,
      ],
    })
      .overrideGuard(OptionalV1AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreatorProfileGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  beforeEach(() => {
    teamMatchesService.ruleOptions.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the authenticated host owner authoritative sport rules in the success envelope', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/teams/${hostTeamId}/team-match-rule-options`)
      .set('x-v1-user-id', owner.id)
      .expect(200);

    expect(response.body).toEqual({ status: 'success', data: ruleOptions, timestamp: expect.any(String) });
    expect(teamMatchesService.ruleOptions).toHaveBeenCalledWith(expect.objectContaining(owner), hostTeamId);
  });

  it('rejects a rule-options request without an authenticated identity', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/teams/${hostTeamId}/team-match-rule-options`)
      .expect(401);

    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(teamMatchesService.ruleOptions).not.toHaveBeenCalled();
  });

  it('passes the authenticated outsider identity to the host permission boundary', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/teams/${hostTeamId}/team-match-rule-options`)
      .set('x-v1-user-id', outsider.id)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(teamMatchesService.ruleOptions).toHaveBeenCalledWith(expect.objectContaining(outsider), hostTeamId);
  });

  it('passes the requested host team to the permission boundary instead of another team', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/teams/${otherTeamId}/team-match-rule-options`)
      .set('x-v1-user-id', owner.id)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(teamMatchesService.ruleOptions).toHaveBeenCalledWith(expect.objectContaining(owner), otherTeamId);
  });
});
