import {
  PrismaClient,
  Tournament,
  SportType,
  TournamentStatus,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Build helpers — pure in-memory objects for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildTournament(
  overrides: Partial<{
    id: string;
    organizerId: string;
    teamId: string | null;
    venueId: string | null;
    sportType: SportType;
    title: string;
    description: string | null;
    startDate: Date;
    endDate: Date;
    entryFee: number;
    maxParticipants: number | null;
    currentParticipants: number;
    status: TournamentStatus;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
): Tournament {
  return {
    id: overrides.id ?? 'tournament-test-id',
    organizerId: overrides.organizerId ?? 'user-test-id',
    teamId: overrides.teamId ?? null,
    venueId: overrides.venueId ?? null,
    sportType: overrides.sportType ?? SportType.futsal,
    title: overrides.title ?? '테스트 토너먼트',
    description: overrides.description ?? null,
    startDate: overrides.startDate ?? new Date('2026-05-01'),
    endDate: overrides.endDate ?? new Date('2026-05-02'),
    entryFee: overrides.entryFee ?? 0,
    maxParticipants: overrides.maxParticipants ?? 16,
    currentParticipants: overrides.currentParticipants ?? 0,
    status: overrides.status ?? TournamentStatus.recruiting,
    createdAt: overrides.createdAt ?? new Date('2026-01-01'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01'),
  };
}

// ---------------------------------------------------------------------------
// DB builders
// ---------------------------------------------------------------------------

/**
 * Creates a Tournament in the database.
 */
export async function createTournament(
  prisma: PrismaClient,
  organizerId: string,
  overrides: Partial<{
    sportType: SportType;
    title: string;
    description: string;
    startDate: Date;
    endDate: Date;
    entryFee: number;
    maxParticipants: number;
    status: TournamentStatus;
    venueId: string;
    teamId: string;
  }> = {},
): Promise<Tournament> {
  return prisma.tournament.create({
    data: {
      organizerId,
      sportType: overrides.sportType ?? SportType.futsal,
      title: overrides.title ?? '테스트 토너먼트',
      description: overrides.description ?? null,
      startDate: overrides.startDate ?? new Date('2026-05-01'),
      endDate: overrides.endDate ?? new Date('2026-05-02'),
      entryFee: overrides.entryFee ?? 0,
      maxParticipants: overrides.maxParticipants ?? 16,
      status: overrides.status ?? TournamentStatus.recruiting,
      ...(overrides.venueId ? { venueId: overrides.venueId } : {}),
      ...(overrides.teamId ? { teamId: overrides.teamId } : {}),
    },
  });
}

/**
 * Creates three tournaments covering all active status variants:
 * recruiting, ongoing, and completed.
 */
export async function createTournamentSet(
  prisma: PrismaClient,
  organizerId: string,
  sportType: SportType = SportType.futsal,
): Promise<Tournament[]> {
  return Promise.all([
    createTournament(prisma, organizerId, {
      sportType,
      title: '모집중 토너먼트',
      status: TournamentStatus.recruiting,
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-02'),
    }),
    createTournament(prisma, organizerId, {
      sportType,
      title: '진행중 토너먼트',
      status: TournamentStatus.ongoing,
      startDate: new Date('2026-04-10'),
      endDate: new Date('2026-04-11'),
    }),
    createTournament(prisma, organizerId, {
      sportType,
      title: '완료 토너먼트',
      status: TournamentStatus.completed,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-02'),
    }),
  ]);
}
