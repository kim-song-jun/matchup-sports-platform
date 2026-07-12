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

  it('returns tournament detail without requiring a user argument', async () => {
    tournamentsReadService.get.mockResolvedValue({
      id: 'tournament-1',
      title: 'Public tournament',
    });

    await expect(controller.get('tournament-1')).resolves.toEqual({
      id: 'tournament-1',
      title: 'Public tournament',
    });
    expect(tournamentsReadService.get).toHaveBeenCalledWith('tournament-1');
  });
});
