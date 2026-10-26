import { GamesService } from './games.service';
import { GameTakeoverService } from './game-takeover.service';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { V1AuthUser } from '../auth/v1-auth-user';

const GAME_ID = '77000000-0000-4000-8000-000000000001';
const USER_ID = '77000000-0000-4000-8000-000000000002';
const TOURNAMENT_ID = '77000000-0000-4000-8000-000000000003';
const FIXTURE_ID = '77000000-0000-4000-8000-000000000004';
const FIELD_ID = '77000000-0000-4000-8000-000000000005';

const fixture = {
  id: FIXTURE_ID,
  deletedAt: null,
  hostTeamId: 'host-team',
  approvedApplicantTeamId: 'away-team',
  tournamentId: TOURNAMENT_ID,
  leagueId: null,
  fieldId: FIELD_ID,
  tournament: { kind: 'bracket' },
  league: null,
  tournamentDetails: {
    teamMatchId: FIXTURE_ID,
    tournamentId: TOURNAMENT_ID,
    homeRegistration: { teamId: 'host-team' },
    awayRegistration: { teamId: 'away-team' },
  },
};

const assignment = {
  id: 'staff-assignment-v2',
  tournamentId: TOURNAMENT_ID,
  role: 'FIELD_OPERATOR' as const,
  fieldId: null,
  version: 2,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  expiresAt: null,
  revokedAt: null,
  fixtureScopes: [{ teamMatchId: FIXTURE_ID }],
};

const unscopedFixture = {
  ...fixture,
  tournamentId: null,
  leagueId: null,
  tournament: null,
  league: null,
  tournamentDetails: null,
};

function createGameService(options: {
  readonly gameFixture?: typeof fixture | typeof unscopedFixture;
  readonly admin?: object | null;
  readonly assignments?: readonly typeof assignment[];
  readonly memberships?: readonly { readonly teamId: string; readonly role: 'owner' | 'manager' }[];
} = {}) {
  const gameFixture = options.gameFixture ?? fixture;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    v1Game: {
      findUnique: jest.fn()
        .mockResolvedValueOnce({ sourceType: 'TEAM_MATCH', teamMatch: gameFixture })
        .mockResolvedValueOnce({
          id: GAME_ID,
          sourceType: 'TEAM_MATCH',
          state: 'SCHEDULED',
          version: 0,
          lastSequence: 0,
          competitionConfigVersionId: 'config-version',
          currentOfficialRevisionId: null,
          teamMatchId: FIXTURE_ID,
          teamMatch: gameFixture,
          sides: [],
          periods: [],
          lineups: [],
        }),
    },
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue(options.admin ?? null) },
    v1TournamentStaffAssignment: { findMany: jest.fn().mockResolvedValue(options.assignments ?? [assignment]) },
    v1TeamMembership: { findMany: jest.fn().mockResolvedValue(options.memberships ?? []) },
    v1CompetitionConfigVersion: { findUnique: jest.fn().mockResolvedValue(null) },
    v1TournamentMatchDetails: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    ...tx,
  } as unknown as PrismaService;
  const staffAccess = new TournamentStaffAccessService(prisma);
  return {
    service: new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), staffAccess),
    tx,
  };
}

describe('GET /games/:gameId realtime authorization response', () => {
  it('returns the server-selected staff assignment version for the authorized game', async () => {
    const { service } = createGameService();
    const user = { id: USER_ID } as V1AuthUser;

    const response = await service.getGame(user, GAME_ID);

    expect(response).toEqual(expect.objectContaining({
      id: GAME_ID,
      actorRole: 'field_operator',
      realtimeAuthorization: { kind: 'staff', subjectVersion: 2 },
    }));
    expect(response).not.toHaveProperty('teamMatch');
  });

  it('preserves platform-operations bypass as an explicit response state', async () => {
    const { service } = createGameService({
      admin: {
        adminRole: 'ops',
        status: 'active',
        revokedAt: null,
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
        user: { accountStatus: 'active' },
      },
    });

    const response = await service.getGame({ id: USER_ID } as V1AuthUser, GAME_ID);

    expect(response.actorRole).toBe('platform_ops');
    expect(response.realtimeAuthorization).toEqual({ kind: 'platform_ops', subjectVersion: 0 });
  });

  it('keeps an authorized team owner readable while marking realtime staff scope unavailable', async () => {
    const { service } = createGameService({
      assignments: [],
      memberships: [{ teamId: 'host-team', role: 'owner' }],
    });

    const response = await service.getGame({ id: USER_ID } as V1AuthUser, GAME_ID);

    expect(response.actorRole).toBe('team_owner');
    expect(response.realtimeAuthorization).toEqual({ kind: 'unavailable' });
  });

  it('preserves unscoped team-owner realtime state for a friendly match', async () => {
    const { service } = createGameService({
      gameFixture: unscopedFixture,
      assignments: [],
      memberships: [{ teamId: 'host-team', role: 'owner' }],
    });

    const response = await service.getGame({ id: USER_ID } as V1AuthUser, GAME_ID);

    expect(response.actorRole).toBe('team_owner');
    expect(response.realtimeAuthorization).toEqual({ kind: 'unscoped', subjectVersion: 0 });
  });
});
