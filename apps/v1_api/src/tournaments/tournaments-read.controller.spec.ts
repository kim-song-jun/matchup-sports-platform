import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsReadController } from './tournaments-read.controller';
import { TournamentsReadService } from './tournaments-read.service';

describe('TournamentsReadController', () => {
  const tournamentsReadService = {
    list: jest.fn(),
    get: jest.fn(),
  };

  let controller: TournamentsReadController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [TournamentsReadController],
      providers: [
        { provide: TournamentsReadService, useValue: tournamentsReadService },
        { provide: PrismaService, useValue: {} },
        { provide: OptionalV1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = moduleRef.get(TournamentsReadController);
  });

  it('uses optional auth for public list/detail reads', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, TournamentsReadController) ?? [];

    expect(guards).toContain(OptionalV1AuthGuard);
  });

  it('returns a tournament list without requiring a user argument', async () => {
    tournamentsReadService.list.mockResolvedValue({
      items: [{ id: 'tournament-1', title: 'Public tournament' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.list({ limit: 20 })).resolves.toEqual({
      items: [{ id: 'tournament-1', title: 'Public tournament' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
    expect(tournamentsReadService.list).toHaveBeenCalledWith({ limit: 20 });
  });

  it('returns tournament detail for an anonymous caller (no user)', async () => {
    tournamentsReadService.get.mockResolvedValue({
      id: 'tournament-1',
      title: 'Public tournament',
    });

    await expect(controller.get('tournament-1', undefined)).resolves.toEqual({
      id: 'tournament-1',
      title: 'Public tournament',
    });
    expect(tournamentsReadService.get).toHaveBeenCalledWith('tournament-1', undefined);
  });

  // 참가팀 공개 정책 통일(fix/v1-publish) — 운영자·스태프 우회는 서비스 계층
  // (tournaments-read.service.spec.ts)에서 실제 정책을 검증한다. 이 컨트롤러
  // 스펙의 관심사는 @CurrentUser()가 뽑아낸 값이 그대로 service.get()에
  // 전달되는지(배선)뿐이다.
  it('forwards the resolved @CurrentUser() to service.get() for the staff-bypass check', async () => {
    const staffUser = {
      id: 'staff-1',
      email: 'staff@teameet.v1',
      accountStatus: 'active' as const,
      onboardingStatus: 'completed' as const,
    };
    tournamentsReadService.get.mockResolvedValue({ id: 'tournament-1', title: 'Public tournament' });

    await controller.get('tournament-1', staffUser);

    expect(tournamentsReadService.get).toHaveBeenCalledWith('tournament-1', staffUser);
  });
});
