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

  it('allows admin to create venue-affiliated tournament regardless of ownership', async () => {
    prismaMock.venue.findUnique.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    prismaMock.tournament.create.mockResolvedValue({
      id: 't-new',
      sportType: 'futsal',
      title: 'admin test',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-02'),
      status: 'recruiting',
      teamId: null,
      venueId: 'venue-1',
      venue: { id: 'venue-1', name: '테스트 체육관', city: '서울', district: '마포구', address: '서울 마포구 1번지' },
      organizer: { id: 'admin-1', nickname: 'admin', profileImageUrl: null },
      team: null,
    });

    const result = await service.create('admin-1', 'admin', {
      sportType: 'futsal',
      title: 'admin test',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      venueId: 'venue-1',
    });

    expect(prismaMock.tournament.create).toHaveBeenCalled();
    expect(result.id).toBe('t-new');
  });

  it('throws BadRequestException when end date is before start date', async () => {
    await expect(
      service.create('user-1', 'user', {
        sportType: 'futsal',
        title: 'test',
        startDate: '2026-05-10',
        endDate: '2026-05-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows team manager to create team-affiliated tournament', async () => {
    membershipMock.assertRole.mockResolvedValue(undefined);
    prismaMock.tournament.create.mockResolvedValue({
      id: 't-team',
      sportType: 'futsal',
      title: 'team tournament',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-02'),
      status: 'recruiting',
      teamId: 'team-1',
      venueId: null,
      venue: null,
      organizer: { id: 'manager-1', nickname: 'manager', profileImageUrl: null },
      team: { id: 'team-1', name: '드림팀', sportTypes: ['futsal'], logoUrl: null },
    });

    const result = await service.create('manager-1', 'user', {
      sportType: 'futsal',
      title: 'team tournament',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      teamId: 'team-1',
    });

    expect(membershipMock.assertRole).toHaveBeenCalledWith('team-1', 'manager-1', expect.any(String));
    expect(result.id).toBe('t-team');
  });

  it('returns nextCursor when more items exist than limit', async () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      id: `t-${i}`,
      startDate: new Date(`2026-05-${String(i + 1).padStart(2, '0')}`),
      venue: null,
      team: null,
      organizer: { id: 'user-1', nickname: 'user', profileImageUrl: null },
    }));
    prismaMock.tournament.findMany.mockResolvedValue(items);

    const result = await service.findAll({ limit: 20 });

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe('t-19');
  });

  it('returns tournament detail when found', async () => {
    prismaMock.tournament.findUnique.mockResolvedValue({
      id: 't-found',
      startDate: new Date('2026-05-01'),
      venue: { id: 'v-1', name: '테스트 체육관' },
      team: null,
      organizer: { id: 'user-1', nickname: 'user', profileImageUrl: null },
    });

    const result = await service.findById('t-found');

    expect(result.id).toBe('t-found');
    expect(result.venueName).toBe('테스트 체육관');
    expect(result.eventDate).toEqual(new Date('2026-05-01'));
  });

  it('throws NotFoundException when venue does not exist for venue-affiliated tournament', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(null);

    await expect(
      service.create('user-1', 'user', {
        sportType: 'futsal',
        title: 'test',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        venueId: 'nonexistent-venue',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
