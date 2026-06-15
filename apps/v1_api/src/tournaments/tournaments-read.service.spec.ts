/**
 * tournaments-read.service.spec.ts
 *
 * Contract tests for the consumer-facing tournament read service.
 * Verifies: public status filter (draft/cancelled excluded), cursor pagination,
 * 404 on hidden statuses, detail structure (groups/groupTeams/standings/fixtures/
 * result/announcements), and TBD team name fallback for unassigned fixture slots.
 * Asserts observable behaviour only — no mock-for-mock assertions.
 */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsReadService } from './tournaments-read.service';

const authUser = {
  id: 'user-1',
  email: 'user@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

function tournamentCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    sportId: 'sport-1',
    sport: { code: 'futsal', name: '풋살' },
    title: '봄 풋살 대회',
    status: 'open',
    registrationDeadlineAt: null,
    scheduledAt: new Date('2026-07-01T09:00:00.000Z'),
    venue: '서울 풋살장',
    teamCount: 8,
    entryFee: 60000,
    prizePool: null,
    prizeBreakdown: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    deletedAt: null,
    _count: { registrations: 3 },
    ...overrides,
  };
}

function fullTournamentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    sportId: 'sport-1',
    sport: { code: 'futsal', name: '풋살' },
    title: '봄 풋살 대회',
    status: 'open',
    registrationDeadlineAt: null,
    scheduledAt: new Date('2026-07-01T09:00:00.000Z'),
    venue: '서울 풋살장',
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    entryFee: 60000,
    rulesText: null,
    refundPolicyText: null,
    prizePool: null,
    prizeBreakdown: null,
    deletedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    _count: { registrations: 4 },
    groups: [],
    fixtures: [],
    announcements: [],
    ...overrides,
  };
}

describe('TournamentsReadService', () => {
  let service: TournamentsReadService;
  let prisma: {
    v1Tournament: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      v1Tournament: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsReadService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentsReadService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ─────────────────────────────────────────────────────────────────────

  it('list: returns items with confirmedCount and pageInfo', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([tournamentCard()]);

    const result = await service.list({});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'tournament-1',
      sportId: 'sport-1',
      sport: { code: 'futsal', name: '풋살' },
      status: 'open',
      confirmedCount: 3,
      entryFee: 60000,
    });
    expect(result.pageInfo).toMatchObject({ hasNext: false, nextCursor: null });
  });

  it('list: excludes draft/cancelled via where clause passed to Prisma', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({});

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    // status filter must include only public statuses via `in`
    expect(callArgs.where.status).toMatchObject({
      in: expect.arrayContaining(['open', 'closed', 'in_progress', 'completed']),
    });
    expect(callArgs.where.status.in).not.toContain('draft');
    expect(callArgs.where.status.in).not.toContain('cancelled');
  });

  it('list: status filter narrowing is forwarded as exact string', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ status: 'in_progress' });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('in_progress');
  });

  it('list: cursor pagination — hasNext=true when rows exceed limit', async () => {
    const rows = [
      tournamentCard({ id: 't-1' }),
      tournamentCard({ id: 't-2' }),
      tournamentCard({ id: 't-3' }),
    ];
    prisma.v1Tournament.findMany.mockResolvedValue(rows);

    const result = await service.list({ limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.pageInfo).toMatchObject({ hasNext: true, nextCursor: 't-2' });
  });

  it('list: cursor argument is forwarded to Prisma with skip:1', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ cursor: 'cursor-id', limit: 10 });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.cursor).toEqual({ id: 'cursor-id' });
    expect(callArgs.skip).toBe(1);
  });

  it('list: sportId filter is forwarded as sportId UUID condition', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({ sportId: 'sport-uuid-1' });

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.where.sportId).toBe('sport-uuid-1');
  });

  it('list: no sportId → sportId condition absent from where', async () => {
    prisma.v1Tournament.findMany.mockResolvedValue([]);

    await service.list({});

    const callArgs = prisma.v1Tournament.findMany.mock.calls[0][0];
    expect(callArgs.where.sportId).toBeUndefined();
  });

  // ─── get — not found / hidden ────────────────────────────────────────────────

  it('get: tournament not found → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(service.get('ghost')).rejects.toThrow(NotFoundException);
    await expect(service.get('ghost2')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
  });

  it('get: draft/cancelled filtered out at DB level (status in PUBLIC_STATUSES)', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await service.get('t-1').catch(() => {});

    const callArgs = prisma.v1Tournament.findFirst.mock.calls[0][0];
    expect(callArgs.where.status).toMatchObject({
      in: expect.arrayContaining(['open', 'in_progress', 'completed']),
    });
    expect(callArgs.where.status.in).not.toContain('draft');
    expect(callArgs.where.status.in).not.toContain('cancelled');
  });

  // ─── get — detail shape ──────────────────────────────────────────────────────

  it('get: returns full detail with groups, fixtures, announcements', async () => {
    const row = fullTournamentRow({
      groups: [
        {
          id: 'group-1',
          name: 'A조',
          phase: 'group',
          sortOrder: 0,
          groupTeams: [
            {
              id: 'gt-1',
              registrationId: 'reg-1',
              sortOrder: 0,
              registration: {
                team: { id: 'team-1', name: 'FC 서울' },
              },
            },
          ],
          standings: [
            {
              registrationId: 'reg-1',
              position: 1,
              points: 9,
              wins: 3,
              draws: 0,
              losses: 0,
              goalsFor: 10,
              goalsAgainst: 2,
              recalculatedAt: new Date('2026-06-14T00:00:00Z'),
              registration: { team: { id: 'team-1', name: 'FC 서울' } },
            },
          ],
        },
      ],
      fixtures: [
        {
          id: 'fixture-1',
          groupId: 'group-1',
          round: 'group',
          fixtureNumber: 1,
          legNumber: 1,
          scheduledAt: new Date('2026-07-01T10:00:00Z'),
          venue: null,
          status: 'scheduled',
          homeRegistrationId: 'reg-1',
          awayRegistrationId: null,
          homeRegistration: { team: { id: 'team-1', name: 'FC 서울' } },
          awayRegistration: null,
          result: null,
        },
      ],
      announcements: [
        {
          id: 'ann-1',
          title: '경기 일정 공지',
          body: '7월 1일 오전 10시 시작',
          audience: 'all_registered',
          publishedAt: new Date('2026-06-10T00:00:00Z'),
          createdAt: new Date('2026-06-10T00:00:00Z'),
          updatedAt: new Date('2026-06-10T00:00:00Z'),
        },
      ],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result).toMatchObject({
      id: 'tournament-1',
      sportId: 'sport-1',
      sport: { code: 'futsal', name: '풋살' },
      confirmedCount: 4,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].groupTeams[0]).toMatchObject({
      teamName: 'FC 서울',
    });
    expect(result.groups[0].standings[0]).toMatchObject({
      teamName: 'FC 서울',
      position: 1,
      points: 9,
    });
    expect(result.fixtures[0]).toMatchObject({
      homeTeamName: 'FC 서울',
      awayTeamName: 'TBD',
      result: null,
    });
    expect(result.announcements[0]).toMatchObject({
      id: 'ann-1',
      title: '경기 일정 공지',
    });
  });

  it('get: fixture with result is serialized correctly', async () => {
    const row = fullTournamentRow({
      fixtures: [
        {
          id: 'fixture-2',
          groupId: null,
          round: 'final',
          fixtureNumber: 1,
          legNumber: 1,
          scheduledAt: new Date('2026-07-01T16:00:00Z'),
          venue: '결승 구장',
          status: 'completed',
          homeRegistrationId: 'reg-1',
          awayRegistrationId: 'reg-2',
          homeRegistration: { team: { id: 'team-1', name: 'FC 서울' } },
          awayRegistration: { team: { id: 'team-2', name: '부산 아이파크' } },
          result: {
            homeScore: 3,
            awayScore: 2,
            hasPenalty: false,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            note: '명승부',
            recordedAt: new Date('2026-07-01T17:30:00Z'),
          },
        },
      ],
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.fixtures[0]).toMatchObject({
      homeTeamName: 'FC 서울',
      awayTeamName: '부산 아이파크',
      result: {
        homeScore: 3,
        awayScore: 2,
        hasPenalty: false,
        note: '명승부',
      },
    });
  });

  it('get: DateTime fields are serialized as ISO strings', async () => {
    const scheduledDate = new Date('2026-07-01T09:00:00.000Z');
    const row = fullTournamentRow({ scheduledAt: scheduledDate });
    prisma.v1Tournament.findFirst.mockResolvedValue(row);

    const result = await service.get('tournament-1');

    expect(result.scheduledAt).toBe(scheduledDate.toISOString());
    expect(result.createdAt).toBe(new Date('2026-06-01T00:00:00.000Z').toISOString());
  });
});
