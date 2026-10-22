import { Test } from '@nestjs/testing';
import {
  V1AccountStatus, V1GameEventType, V1GamePeriodState, V1GameSourceType,
  V1GameState, V1OnboardingStatus, V1TournamentStaffRole,
} from '@prisma/client';
import type { V1GameEvent } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AppendGameEventDto } from './dto/game-event.dto';
import { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

export const ORDERING_GAME_ID = 'mdqa139-ordering-game';
const ORDERING_TOURNAMENT_ID = '13900000-0000-4000-8000-000000000001';
const ORDERING_TEAM_MATCH_ID = '13900000-0000-4000-8000-000000000002';
const ORDERING_FIELD_ID = '13900000-0000-4000-8000-000000000003';
export const ORDERING_ADMIN_UPDATED_AT = new Date('2026-10-01T00:00:00.000Z');
export const ORDERING_USER: V1AuthUser = {
  id: 'mdqa139-operator', email: null, accountStatus: V1AccountStatus.active,
  onboardingStatus: V1OnboardingStatus.completed,
};

function deferred<T>() {
  const resolver: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => { resolver.resolve = resolve; });
  return {
    promise,
    resolve(value: T) {
      if (resolver.resolve === undefined) throw new TypeError('Deferred resolver is unavailable');
      resolver.resolve(value);
    },
  };
}

type ActorGate = {
  readonly entered: ReturnType<typeof deferred<void>>;
  readonly released: ReturnType<typeof deferred<void>>;
};

export function orderingEvent(token: string, clientEventId: string): AppendGameEventDto {
  return {
    expectedVersion: 3, clientEventId, takeoverToken: token,
    type: V1GameEventType.PERIOD_START, period: 1, clockMs: 0,
    occurredAt: new Date().toISOString(), payload: {},
  };
}

export async function createOrderingService() {
  // Only the database boundary is synthetic. Authorization, grant/renew,
  // command validation, event serialization and audit use production services.
  let nextActorGate: ActorGate | null = null;
  let nextMetadataGate: ActorGate | null = null;
  let nextMetadataFailure: Error | null = null;
  const deniedUsers = new Set<string>();
  const staffRoles = new Map<string, V1TournamentStaffRole>();
  const events: V1GameEvent[] = [];
  const game = {
    id: ORDERING_GAME_ID, sourceType: V1GameSourceType.TEAM_MATCH,
    teamMatchId: ORDERING_TEAM_MATCH_ID, state: V1GameState.LIVE,
    version: 3, lastSequence: 7, sharedRecord: null,
    competitionConfigVersionId: 'mdqa139-config',
  };
  const teamMatch = {
    id: game.teamMatchId, deletedAt: null, status: 'matched',
    hostTeamId: 'mdqa139-home', approvedApplicantTeamId: 'mdqa139-away',
    tournamentId: ORDERING_TOURNAMENT_ID, leagueId: null, fieldId: ORDERING_FIELD_ID,
    tournament: { kind: 'regular_tournament' }, league: null,
    tournamentDetails: {
      teamMatchId: game.teamMatchId, tournamentId: ORDERING_TOURNAMENT_ID,
      homeRegistration: { id: 'mdqa139-home-registration', teamId: 'mdqa139-home' },
      awayRegistration: { id: 'mdqa139-away-registration', teamId: 'mdqa139-away' },
    },
  };
  const database = {
    async $transaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
      return callback(database);
    },
    async $queryRaw(_query: TemplateStringsArray, ..._values: unknown[]) { return []; },
    v1Game: {
      async findUnique({ where, select }: { where: { id: string }; select?: { version?: boolean; lastSequence?: boolean } }) {
        if (select?.version === true && select.lastSequence === true) {
          const gate = nextMetadataGate;
          nextMetadataGate = null;
          if (gate !== null) { gate.entered.resolve(); await gate.released.promise; }
          const failure = nextMetadataFailure;
          nextMetadataFailure = null;
          if (failure !== null) throw failure;
        }
        return { ...game, id: where.id, teamMatch };
      },
      async update({ data }: { data: { lastSequence: number; version: { increment: number } } }) {
        game.lastSequence = data.lastSequence;
        game.version += data.version.increment;
        return { ...game };
      },
    },
    v1TeamMatch: { async findUnique() { return teamMatch; } },
    v1UserProfile: {
      async findMany({ where }: { where: { userId: { in: string[] } } }) {
        return where.userId.in.map((userId) => ({
          userId, realName: null, displayName: null, nickname: `${userId}-닉네임`, tournamentRealNameVisible: false, deletedAt: null,
        }));
      },
    },
    v1AdminUser: {
      async findUnique({ where }: { where: { userId: string } }) {
        const gate = nextActorGate;
        nextActorGate = null;
        if (gate !== null) {
          gate.entered.resolve();
          await gate.released.promise;
        }
        if (deniedUsers.has(where.userId) || staffRoles.has(where.userId)) return null;
        return {
          adminRole: 'ops', status: 'active', revokedAt: null,
          updatedAt: ORDERING_ADMIN_UPDATED_AT, user: { accountStatus: 'active' },
        };
      },
    },
    v1TournamentStaffAssignment: {
      async findMany({ where }: { where: { userId: string } }) {
        const role = staffRoles.get(where.userId);
        return role === undefined ? [] : [{
          id: `assignment-${where.userId}`, tournamentId: teamMatch.tournamentId,
          role, fieldId: role === V1TournamentStaffRole.FIELD_OPERATOR ? teamMatch.fieldId : null, version: 4,
          createdAt: new Date('2026-01-01T00:00:00.000Z'), expiresAt: null,
          revokedAt: null,
          fixtureScopes: role === V1TournamentStaffRole.FIELD_OPERATOR ? [{ teamMatchId: teamMatch.id }] : [],
        }];
      },
    },
    v1GamePeriod: { async findFirst() { return { id: 'mdqa139-period', state: V1GamePeriodState.LIVE }; } },
    v1GameEvent: {
      async findMany() { return events; },
      async create({ data }: { data: Omit<V1GameEvent, 'id' | 'receivedAt' | 'reversesEventId'> }) {
        const event: V1GameEvent = {
          ...data, id: `event-${data.sequence}`, receivedAt: new Date(), reversesEventId: null,
        };
        events.push(event);
        return event;
      },
    },
    v1IdempotencyRecord: {
      async findUnique() { return null; },
      async create() { return { id: 'mdqa139-command-receipt' }; },
    },
    v1OperationAudit: { async create() { return { id: 'mdqa139-audit' }; } },
    v1TeamMembership: { async findMany() { return []; } },
  };
  const moduleRef = await Test.createTestingModule({ providers: [
    GamesService, GameTakeoverService, OperationAuditWriterService,
    { provide: PrismaService, useValue: database },
  ] }).compile();
  return {
    service: moduleRef.get(GamesService), takeover: moduleRef.get(GameTakeoverService),
    game, events, deniedUsers, staffRoles,
    holdNextActor() {
      const gate = { entered: deferred<void>(), released: deferred<void>() };
      nextActorGate = gate;
      return { entered: gate.entered.promise, release: () => gate.released.resolve() };
    },
    holdNextMetadata() {
      const gate = { entered: deferred<void>(), released: deferred<void>() };
      nextMetadataGate = gate;
      return { entered: gate.entered.promise, release: () => gate.released.resolve() };
    },
    failNextMetadata(error: Error) { nextMetadataFailure = error; },
    close: () => moduleRef.close(),
  };
}
