import { Test } from '@nestjs/testing';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreatorProfileGuard } from '../profile/creator-profile.guard';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

const user = {
  id: 'user-1',
  email: 'host@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('MatchesController', () => {
  const matchesService = {
    list: jest.fn(),
    create: jest.fn(),
    edit: jest.fn(),
    detail: jest.fn(),
    applicationEligibility: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
  };

  let controller: MatchesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [
        { provide: MatchesService, useValue: matchesService },
        { provide: PrismaService, useValue: {} },
        { provide: OptionalV1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: CreatorProfileGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = moduleRef.get(MatchesController);
  });

  it('returns a match list', async () => {
    matchesService.list.mockResolvedValue({
      items: [{ matchId: 'match-1', title: '러닝 매치' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.list(undefined, { limit: 20 })).resolves.toEqual({
      items: [{ matchId: 'match-1', title: '러닝 매치' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
  });

  it('creates a match', async () => {
    const dto = {
      sportId: '00000000-0000-4000-8000-000000000001',
      regionId: '00000000-0000-4000-8000-000000000002',
      title: '러닝 매치',
      startsAt: '2026-06-01T10:00:00.000Z',
      capacity: 6,
      manualPlaceName: '강남역',
    };
    matchesService.create.mockResolvedValue({
      matchId: 'match-1',
      status: 'recruiting',
      hostParticipantId: 'participant-1',
    });

    await expect(controller.create(user, dto)).resolves.toEqual({
      matchId: 'match-1',
      status: 'recruiting',
      hostParticipantId: 'participant-1',
    });
  });

  it('returns edit prefill', async () => {
    matchesService.edit.mockResolvedValue({
      matchId: 'match-1',
      editable: true,
      form: { title: '러닝 매치' },
    });

    await expect(controller.edit(user, 'match-1')).resolves.toEqual({
      matchId: 'match-1',
      editable: true,
      form: { title: '러닝 매치' },
    });
  });

  it('returns a match detail', async () => {
    matchesService.detail.mockResolvedValue({
      matchId: 'match-1',
      title: '러닝 매치',
      viewer: { state: 'guest' },
    });

    await expect(controller.detail(undefined, 'match-1')).resolves.toEqual({
      matchId: 'match-1',
      title: '러닝 매치',
      viewer: { state: 'guest' },
    });
  });

  it('returns application eligibility', async () => {
    matchesService.applicationEligibility.mockResolvedValue({
      matchId: 'match-1',
      eligible: true,
      reasonCode: 'OK',
    });

    await expect(controller.applicationEligibility(user, 'match-1')).resolves.toEqual({
      matchId: 'match-1',
      eligible: true,
      reasonCode: 'OK',
    });
  });

  it('updates a match', async () => {
    const dto = {
      sportId: '00000000-0000-4000-8000-000000000001',
      regionId: '00000000-0000-4000-8000-000000000002',
      title: '수정된 매치',
      startsAt: '2026-06-01T10:00:00.000Z',
      capacity: 6,
      manualPlaceName: '강남역',
      version: '2026-05-18T00:00:00.000Z',
    };
    matchesService.update.mockResolvedValue({
      matchId: 'match-1',
      status: 'recruiting',
    });

    await expect(controller.update(user, 'match-1', dto)).resolves.toEqual({
      matchId: 'match-1',
      status: 'recruiting',
    });
  });

  it('cancels a match', async () => {
    matchesService.cancel.mockResolvedValue({
      matchId: 'match-1',
      status: 'cancelled',
      cancelledApplications: 1,
      cancelledParticipants: 0,
    });

    await expect(controller.cancel(user, 'match-1', { reason: '일정 변경' })).resolves.toEqual({
      matchId: 'match-1',
      status: 'cancelled',
      cancelledApplications: 1,
      cancelledParticipants: 0,
    });
  });
});
