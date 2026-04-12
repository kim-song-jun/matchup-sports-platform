import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamMembershipService } from '../teams/team-membership.service';
import { TournamentsService } from './tournaments.service';

describe('TournamentsService', () => {
  let service: TournamentsService;

  const prismaMock = {
    tournament: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    venue: {
      findUnique: jest.fn(),
    },
  };

  const membershipMock = {
    assertRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TeamMembershipService, useValue: membershipMock },
      ],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
    jest.clearAllMocks();
  });

  it('returns paginated list with nextCursor', async () => {
    prismaMock.tournament.findMany.mockResolvedValue([
      { id: 't-1', startDate: new Date('2026-05-01') },
      { id: 't-2', startDate: new Date('2026-05-02') },
    ]);

    const result = await service.findAll({});
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 't-1',
        eventDate: new Date('2026-05-01'),
        venueName: null,
      }),
    );
    expect(result.items[1]).toEqual(
      expect.objectContaining({
        id: 't-2',
        eventDate: new Date('2026-05-02'),
        venueName: null,
      }),
    );
  });

  it('throws NotFoundException when tournament does not exist', async () => {
    prismaMock.tournament.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when both team and venue are set', async () => {
    await expect(
      service.create('user-1', 'user', {
        sportType: 'futsal',
        title: 'test',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        teamId: 'team-1',
        venueId: 'venue-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires venue owner/admin when creating venue-affiliated tournament', async () => {
    prismaMock.venue.findUnique.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });

    await expect(
      service.create('user-2', 'user', {
        sportType: 'futsal',
        title: 'test',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        venueId: 'venue-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
