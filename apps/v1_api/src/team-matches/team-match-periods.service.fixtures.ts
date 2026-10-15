import { Test } from '@nestjs/testing';
import { Prisma, V1CompetitionConfigStatus, V1GameState, V1GameLineupState } from '@prisma/client';
import type { V1Game } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { persistCanonicalGameAggregate } from '../games/game-source-aggregate';
import { GamesService } from '../games/games.service';
import type { GameSourceCreationInput } from '../games/games.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { FUTSAL_V1_CONFIG, competitionConfigContentHash } from '../tournaments/competition-config/competition-config';
import { TeamMatchesService } from './team-matches.service';

export const periodsActor: V1AuthUser = {
  id: 'owner-user', email: 'periods-owner@example.test', accountStatus: 'active', onboardingStatus: 'completed',
};
export const periodsCreateInput = {
  hostTeamId: 'host-team', sportId: 'sport-futsal', regionId: 'region-district', title: '기간 설정 팀매치',
  startsAt: '2099-01-01T10:00:00.000Z', manualPlaceName: '테스트 경기장',
};
const version = new Date('2026-10-13T00:00:00.000Z');

type ConfigRow = typeof FUTSAL_V1_CONFIG & {
  id: string; name: string; sportCode: string; version: number; status: V1CompetitionConfigStatus; contentHash: string;
};
type LineupRow = { id: string; gameId: string; sideId: string; revision: number; state: V1GameLineupState; version: number; submittedAt: Date | null; supersedesId: string | null; invalidatedAt: Date | null };
type PeriodRow = { id: string; gameId: string; number: number; state: 'SCHEDULED'; startedAt: Date | null; endedAt: Date | null; pausedAt: Date | null; pausedTotalMs: number };

/** In-memory persistence seam; source-created DRAFT rosters come from the production aggregate writer. */
export async function teamMatchPeriodsFixture() {
  const baseConfig: ConfigRow = {
    ...structuredClone(FUTSAL_V1_CONFIG), id: 'default-futsal', name: 'futsal-v1', sportCode: 'futsal', version: 1,
    status: 'ACTIVE', contentHash: competitionConfigContentHash(FUTSAL_V1_CONFIG),
  };
  const configs = new Map<string, ConfigRow>([[baseConfig.id, baseConfig]]);
  const lineups: LineupRow[] = [];
  const periods: PeriodRow[] = [];
  let periodIdentitySequence = 0;
  const participants: Array<{ id: string; gameId: string; sideId: string; lineupId: string; displayNameSnapshot: string; userId?: string }> = [];
  const sides: Array<{ id: string; gameId: string; sideKey: 'HOME' | 'AWAY'; teamId: string | null; displayNameSnapshot: string }> = [];
  const events: Array<{ id: string }> = [];
  const results: Array<{ id: string }> = [];
  const hostTeam = { id: periodsCreateInput.hostTeamId, sportId: periodsCreateInput.sportId, name: '테스트 호스트', memberships: [{ id: 'owner-member', userId: periodsActor.id, role: 'owner', user: { profile: { nickname: '호스트', displayName: '테스트 호스트' } } }] };
  const match = {
    id: 'match-periods', ...periodsCreateInput, createdByUserId: periodsActor.id, platformManaged: false,
    startAt: new Date(periodsCreateInput.startsAt), endAt: null, deadlineAt: null, placeName: periodsCreateInput.manualPlaceName,
    placeAddress: null, placeProviderId: null, placeProvider: null, placeLatitude: null, placeLongitude: null,
    description: null, imageUrl: null, listImageUrl: null, formatNote: null, matchFormat: null, matchStyle: [], uniformColor: null,
    minSportLevelId: null, maxSportLevelId: null, minSportLevel: null, maxSportLevel: null, genderRule: null, costNote: null,
    status: 'recruiting', approvedApplicantTeamId: null, leagueId: null, tournamentId: null, deletedAt: null,
    createdAt: version, updatedAt: version, competitionConfigVersionId: baseConfig.id, hostTeam,
  };
  const game: Pick<V1Game, 'id' | 'teamMatchId' | 'sourceType' | 'state' | 'version' | 'lastSequence' | 'currentOfficialRevisionId' | 'competitionConfigVersionId'> = {
    id: 'game-periods', teamMatchId: match.id, sourceType: 'TEAM_MATCH', state: V1GameState.SCHEDULED,
    version: 0, lastSequence: 0, currentOfficialRevisionId: null, competitionConfigVersionId: baseConfig.id,
  };
  let tx: PrismaService;
  const configByWhere = (where: { id?: string; contentHash?: string }) =>
    [...configs.values()].find(row => (where.id === undefined || row.id === where.id) && (where.contentHash === undefined || row.contentHash === where.contentHash)) ?? null;
  const prisma = {
    v1User: { findUnique: jest.fn().mockResolvedValue({ phone: '01000000000', profile: { realName: '테스트 사용자', gender: 'male' } }) },
    v1TeamMembership: { findFirst: jest.fn().mockResolvedValue({ id: 'owner-member', role: 'owner', team: hostTeam }) },
    v1Team: { findFirst: jest.fn().mockResolvedValue(hostTeam) },
    v1Sport: { findFirst: jest.fn().mockResolvedValue({ id: periodsCreateInput.sportId, code: 'futsal' }) },
    v1Region: { findFirst: jest.fn().mockResolvedValue({ id: periodsCreateInput.regionId }) },
    v1IdempotencyRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    v1TeamMatch: {
      create: jest.fn(({ data }: { data: { competitionConfigVersionId: string } }) => {
        match.competitionConfigVersionId = data.competitionConfigVersionId; return Promise.resolve(match);
      }),
      findFirst: jest.fn(() => Promise.resolve({ ...match, competitionConfig: configs.get(match.competitionConfigVersionId) })),
      update: jest.fn(({ data }: { data: { competitionConfigVersionId?: string } }) => {
        if (data.competitionConfigVersionId !== undefined) match.competitionConfigVersionId = data.competitionConfigVersionId;
        return Promise.resolve(match);
      }),
    },
    v1CompetitionConfigVersion: {
      findFirst: jest.fn(({ where }: { where: { name?: string; sportCode?: string; status?: V1CompetitionConfigStatus } }) => Promise.resolve(
        [...configs.values()].filter(row => (where.name === undefined || row.name === where.name) && (where.sportCode === undefined || row.sportCode === where.sportCode) && (where.status === undefined || row.status === where.status)).sort((a, b) => b.version - a.version)[0] ?? null,
      )),
      findUnique: jest.fn(({ where }: { where: { id?: string; contentHash?: string } }) => Promise.resolve(configByWhere(where))),
      create: jest.fn(({ data }: { data: Omit<ConfigRow, 'id'> }) => {
        const row = { ...data, id: `custom-${configs.size}` }; configs.set(row.id, row); return Promise.resolve(row);
      }),
      createMany: jest.fn(({ data }: { data: ConfigRow[] }) => {
        let count = 0;
        data.forEach(row => {
          if ([...configs.values()].some(existing => existing.contentHash === row.contentHash || (existing.sportCode === row.sportCode && existing.name === row.name && existing.version === row.version))) return;
          configs.set(row.id, row); count += 1;
        });
        return Promise.resolve({ count });
      }),
    },
    v1Game: {
      create: jest.fn(({ data }: { data: { competitionConfigVersionId: string } }) => {
        game.competitionConfigVersionId = data.competitionConfigVersionId; return Promise.resolve(game);
      }),
      findUnique: jest.fn(() => Promise.resolve({ ...game, lineups, periods, events, resultRevisions: results, sharedRecord: null })),
      findFirst: jest.fn(() => Promise.resolve({ ...game, lineups, periods, events, resultRevisions: results, sharedRecord: null })),
      update: jest.fn(({ data }: { data: { competitionConfigVersionId?: string; version?: { increment: number } } }) => {
        if (data.competitionConfigVersionId !== undefined) game.competitionConfigVersionId = data.competitionConfigVersionId;
        game.version += data.version?.increment ?? 0; return Promise.resolve(game);
      }),
    },
    v1GameSide: { create: jest.fn(({ data }: { data: Omit<(typeof sides)[number], 'id'> }) => {
      const row = { ...data, id: `side-${sides.length}` }; sides.push(row); return Promise.resolve(row);
    }) },
    v1GameLineup: {
      create: jest.fn(({ data }: { data: { gameId: string; sideId: string; revision: number } }) => {
        const row: LineupRow = { ...data, id: `lineup-${lineups.length}`, state: 'DRAFT', version: 0, submittedAt: null, supersedesId: null, invalidatedAt: null };
        lineups.push(row); return Promise.resolve(row);
      }),
      findMany: jest.fn(() => Promise.resolve(lineups)),
    },
    v1GameParticipant: { create: jest.fn(({ data }: { data: Omit<(typeof participants)[number], 'id'> }) => {
      const row = { ...data, id: `participant-${participants.length}` }; participants.push(row); return Promise.resolve(row);
    }) },
    v1GamePeriod: {
      createMany: jest.fn(({ data }: { data: Array<{ gameId: string; number: number }> }) => {
        data.forEach(period => periods.push({ ...period, id: `period-${periodIdentitySequence++}`, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedAt: null, pausedTotalMs: 0 }));
        return Promise.resolve({ count: data.length });
      }),
      deleteMany: jest.fn(() => { const count = periods.length; periods.splice(0); return Promise.resolve({ count }); }),
      findMany: jest.fn(() => Promise.resolve(periods)),
    },
    v1GameEvent: { count: jest.fn(() => Promise.resolve(events.length)) },
    v1GameResultRevision: { count: jest.fn(() => Promise.resolve(results.length)) },
    v1GameVisibilityPolicy: { create: jest.fn().mockResolvedValue({}) },
    v1TeamSchedule: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1TeamMatchApplication: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]), $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn((work: (client: Prisma.TransactionClient) => Promise<unknown>) => work(tx)),
  };
  const games = {
    createFromSourceInTransaction: jest.fn(async (client: Prisma.TransactionClient, input: GameSourceCreationInput) => {
      const config = configs.get(input.competitionConfigVersionId);
      if (!config) throw new Error('Fixture config is missing');
      await persistCanonicalGameAggregate(client, {
        sourceType: 'TEAM_MATCH', sourceId: input.sourceId, competitionConfigVersionId: input.competitionConfigVersionId,
        sides: input.sides, participants: input.participants, periodCount: config.periods.length, visibilityMode: 'LIVE',
      });
      return { gameId: game.id, state: game.state, competitionConfigVersionId: game.competitionConfigVersionId, version: game.version };
    }),
  };
  const module = await Test.createTestingModule({ providers: [
    TeamMatchesService, { provide: PrismaService, useValue: prisma }, { provide: GamesService, useValue: games },
    { provide: NotificationsService, useValue: { emitToManyDeferred: jest.fn() } },
  ] }).compile();
  tx = module.get<PrismaService>(PrismaService);
  return { service: module.get(TeamMatchesService), module, prisma, match, game, configs, baseConfig, lineups, periods, participants, events, results };
}
