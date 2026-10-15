import { Test } from '@nestjs/testing';
import { V1GameState } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { loadGameRoster } from '../games/roster/game-roster-loader';
import { handleCompetitionRosterResync } from '../games/roster/game-roster-sync';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentPlayersService } from './tournament-players.service';

const NOW = new Date('2026-10-16T04:00:00.000Z');
const BEFORE = new Date('2026-10-15T04:00:00.000Z');
const KICKOFF = new Date('2026-10-17T04:00:00.000Z');
const MANAGER = { id: 'manager', email: 'manager@example.test', accountStatus: 'active', onboardingStatus: 'completed' } as const;

interface LineupRow {
  readonly id: string;
  readonly gameId: string;
  readonly sideId: string;
  readonly revision: number;
  readonly state: string;
  readonly formation: null;
  readonly supersedesId: string | null;
  readonly invalidatedAt: null;
}

function emptyDate(): Date | null { return null; }
function emptyRole(): string | null { return null; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/** Evaluate Prisma predicates against persisted fixture rows, including relation/state guards. */
function matches(value: unknown, where: unknown): boolean {
  if (where === undefined) return true;
  if (!isRecord(where)) return value instanceof Date && where instanceof Date ? value.getTime() === where.getTime() : value === where;
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (key === 'AND') return (Array.isArray(expected) ? expected : [expected]).every((part) => matches(value, part));
    if (key === 'OR') return Array.isArray(expected) && expected.some((part) => matches(value, part));
    if (key === 'NOT') return !matches(value, expected);
    if (key === 'in') return Array.isArray(expected) && expected.includes(value);
    if (key === 'notIn') return Array.isArray(expected) && !expected.includes(value);
    if (key === 'not') return !matches(value, expected);
    if (key === 'equals') return matches(value, expected);
    if (key === 'some') return Array.isArray(value) && value.some((part) => matches(part, expected));
    if (key === 'none') return Array.isArray(value) && !value.some((part) => matches(part, expected));
    if (['gt', 'gte', 'lt', 'lte'].includes(key)) {
      const left = value instanceof Date ? value.getTime() : value;
      const right = expected instanceof Date ? expected.getTime() : expected;
      if (typeof left !== 'number' || typeof right !== 'number') return false;
      if (key === 'gt') return left > right;
      if (key === 'gte') return left >= right;
      if (key === 'lt') return left < right;
      return left <= right;
    }
    return isRecord(value) && matches(value[key], expected);
  });
}

function player(userId: string) {
  return {
    id: `player-${userId}`, registrationId: 'registration', userId, realName: userId,
    birthDateSnapshot: '1995-01-01', genderSnapshot: 'male', jerseyNumber: null, goalkeeper: null,
    eligibilityStatus: 'needs_review', eligibilityNote: null, addedAt: BEFORE, removedAt: emptyDate(),
    createdAt: BEFORE, updatedAt: BEFORE,
    user: { profile: { nickname: userId, displayName: userId } },
  };
}

function game(id: string, state: V1GameState = V1GameState.SCHEDULED, competitionId = 'league', teamId = 'team') {
  return {
    id, state, currentOfficialRevisionId: state === V1GameState.ENDED ? 'official-revision' : null,
    teamMatch: {
      id: `match-${id}`, leagueId: competitionId, tournamentId: competitionId,
      startAt: KICKOFF, status: 'matched', deletedAt: null,
    },
    sides: [{ id: `side-${id}`, teamId }],
  };
}

function exclusion(id: string, target: ReturnType<typeof game>, userId = 'returning') {
  return {
    id, gameId: target.id, sideId: `side-${target.id}`, teamId: target.sides[0]?.teamId,
    userId, action: 'EXCLUDE', reason: 'OTHER', actorUserId: 'manager', actorRole: 'TEAM_MANAGER',
    createdAt: BEFORE, revokedAt: emptyDate(), revokedByUserId: null, revokedByRole: emptyRole(),
    game: target, side: target.sides[0],
  };
}

async function setup(options: { readonly managerRole?: string; readonly registrationStatus?: string } = {}) {
  const players = [player('returning'), player('other')];
  const games = [game('scheduled'), game('another'), game('live', V1GameState.LIVE), game('ended', V1GameState.ENDED),
    game('cancelled', V1GameState.CANCELLED), game('other-competition', V1GameState.SCHEDULED, 'another-league'),
    game('other-team', V1GameState.SCHEDULED, 'league', 'another-team'),
    { ...game('scheduled-official'), currentOfficialRevisionId: 'historical-official' }];
  const adjustments = games.map((target) => exclusion(`excluded-${target.id}`, target));
  const scheduled = games.find((row) => row.id === 'scheduled');
  if (scheduled === undefined) throw new TypeError('Missing scheduled fixture');
  adjustments.push(exclusion('other-player', scheduled, 'other'));
  const events: Array<{ id: string; payload: unknown }> = [];
  const locks: string[] = [];
  const writes: string[] = [];
  const stateOnNextLock = new Map<string, V1GameState>();
  const registration = {
    id: 'registration', tournamentId: 'league', teamId: 'team', appliedByUserId: 'manager',
    status: options.registrationStatus ?? 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null,
  };
  const tournament = { id: 'league', kind: 'regular_league', status: 'open', deletedAt: null,
    maxPlayers: 20, minPlayers: 1, rosterDeadlineAt: null, genderCategory: null,
    yellowAccumulationLimit: null, redCardSuspensionMatches: null };
  const activePlayers = () => players.filter((row) => row.removedAt === null);
  const currentRegistration = () => ({ ...registration, players: activePlayers() });
  const latestLineups = new Map<string, LineupRow>(games.map((target) => [target.id, {
    id: `lineup-${target.id}`, gameId: target.id, sideId: `side-${target.id}`, revision: 1,
    state: 'SUBMITTED', formation: null, supersedesId: null, invalidatedAt: null,
  }]));
  const participants: Array<{ id: string; gameId: string; sideId: string; lineupId: string; userId: string | null;
    displayNameSnapshot: string; jerseyNumber: number | null; position: string | null; arrivedAt: Date | null }> = [];
  const db = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join('?').includes('v1_games')) {
        const gameId = String(values[0]);
        locks.push(gameId);
        const state = stateOnNextLock.get(gameId);
        const target = games.find((row) => row.id === gameId);
        if (state !== undefined && target !== undefined) {
          target.state = state;
          stateOnNextLock.delete(gameId);
        }
      }
      return [];
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join('?').includes('INSERT INTO v1_outbox_events')) {
        events.push({ id: String(values[0]), payload: JSON.parse(String(values[5])) });
      }
      return 1;
    },
    v1TeamMembership: { findFirst: async ({ where }: { where: { userId: string } }) => {
      const membership = { id: 'membership', userId: where.userId, teamId: 'team', status: 'active',
        role: where.userId === 'manager' ? options.managerRole ?? 'owner' : 'member',
        team: { status: 'active', deletedAt: null },
        user: { phone: '01012345678', phoneVerifiedAt: BEFORE,
          profile: { realName: '선수', birthDate: '1995-01-01', gender: 'male' } } };
      return matches(membership, where) ? membership : null;
    } },
    v1Tournament: { findFirst: async () => tournament },
    v1TournamentRegistration: {
      findFirst: async ({ where }: { where: unknown }) => matches(currentRegistration(), where) ? currentRegistration() : null,
      findMany: async ({ where }: { where: unknown }) => matches(currentRegistration(), where) ? [currentRegistration()] : [],
    },
    v1TournamentPlayer: {
      count: async () => activePlayers().length,
      findFirst: async ({ where }: { where: unknown }) => players.find((row) => matches({ ...row, registration }, where)) ?? null,
      findUnique: async ({ where }: { where: { registrationId_userId: { userId: string } } }) =>
        players.find((row) => row.userId === where.registrationId_userId.userId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<ReturnType<typeof player>> }) => {
        const row = players.find((entry) => entry.id === where.id);
        if (row === undefined) throw new TypeError('Missing player fixture');
        Object.assign(row, data);
        return row;
      },
      upsert: async ({ where, update }: { where: { registrationId_userId: { userId: string } }; update: Partial<ReturnType<typeof player>> }) => {
        const row = players.find((entry) => entry.userId === where.registrationId_userId.userId);
        if (row === undefined) throw new TypeError('Missing re-added player fixture');
        Object.assign(row, update);
        return row;
      },
    },
    v1AdminActionLog: { findFirst: async () => null },
    v1Game: {
      findMany: async ({ where }: { where: unknown }) => games.filter((row) => matches(row, where)),
      findUnique: async ({ where }: { where: { id: string } }) => games.find((row) => row.id === where.id) ?? null,
    },
    v1GameRosterAdjustment: {
      findMany: async ({ where }: { where: unknown }) => adjustments.filter((row) => matches(row, where)),
      updateMany: async ({ where, data }: { where: unknown; data: Partial<ReturnType<typeof exclusion>> }) => {
        const found = adjustments.filter((row) => matches(row, where));
        for (const row of found) {
          if (!locks.includes(row.gameId)) throw new TypeError(`Adjustment mutation without game lock: ${row.gameId}`);
          Object.assign(row, data);
          writes.push(row.id);
        }
        return { count: found.length };
      },
    },
    v1GameRosterRole: { findMany: async () => [] },
    v1TeamMemberUnavailability: { findMany: async () => [] },
    v1TeamMatch: { findMany: async () => games.map((row) => ({ id: row.teamMatch.id, hostTeamId: 'team',
      approvedApplicantTeamId: null, game: { id: row.id }, tournamentDetails: null })) },
    v1Team: { findMany: async () => [{ id: 'team', name: 'Team', memberships: [] }] },
    v1GameLineup: {
      findFirst: async ({ where }: { where: { gameId: string } }) => latestLineups.get(where.gameId) ?? null,
      findMany: async ({ where }: { where: unknown }) => [...latestLineups.values()].filter((row) => matches(row, where)),
      create: async ({ data }: { data: { gameId: string; sideId: string; revision: number; state: string;
        supersedesId: string; formation: null } }) => {
        const saved = { ...data, id: `lineup-${data.gameId}-${data.revision}`, invalidatedAt: null };
        latestLineups.set(data.gameId, saved);
        return saved;
      },
    },
    v1GameParticipant: {
      findMany: async ({ where }: { where: unknown }) => participants.filter((row) => matches(row, where)),
      createManyAndReturn: async ({ data }: { data: Array<Omit<(typeof participants)[number], 'id'>> }) => {
        const saved = data.map((row, index) => ({ ...row, id: `${row.lineupId}-${index}` }));
        participants.push(...saved);
        return saved;
      },
    },
    v1ParticipantIdentityLinkCurrent: { findMany: async () => [], createMany: async () => ({ count: 0 }) },
    v1ParticipantIdentityLinkEvent: { createManyAndReturn: async () => [] },
    v1OperationAudit: { findFirst: async () => ({ id: 'system-generated-lineup' }), create: async () => ({ id: 'audit' }) },
  };
  const module = await Test.createTestingModule({ providers: [TournamentPlayersService, AdminContextService,
    { provide: PrismaService, useValue: { ...db, $transaction: async (callback: (tx: typeof db) => Promise<unknown>) => callback(db) } }],
  }).compile();
  const prisma = module.get(PrismaService);
  const service = module.get(TournamentPlayersService);
  const drain = async () => {
    for (const event of events.splice(0)) await handleCompetitionRosterResync(prisma, event);
  };
  const roster = (gameId = 'scheduled') => loadGameRoster(prisma, { gameId, sideId: `side-${gameId}` });
  const removeAndReadd = async () => {
    await service.removePlayer(MANAGER, 'league', 'registration', 'player-returning');
    await drain();
    await service.addPlayer(MANAGER, 'league', 'registration', { userId: 'returning', realName: '선수' });
  };
  return { module, prisma, service, players, games, adjustments, events, writes, participants, latestLineups, stateOnNextLock,
    drain, roster, removeAndReadd, scheduled };
}

describe('MD-QA156 참가 명단 제외 후 재추가 — 서비스, outbox worker, 경기 명단 소비', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(NOW); });
  afterEach(() => jest.useRealTimers());

  it('재추가하면 시작 전 경기의 예전 빠짐을 되돌리고 제출 명단에 다시 포함한다', async () => {
    const fixture = await setup();
    try {
      expect((await fixture.roster())?.computation.excluded.map((row) => row.entry.userId)).toContain('returning');
      await fixture.removeAndReadd();
      await fixture.drain();
      expect((await fixture.roster())?.computation.participants.map((row) => row.userId)).toContain('returning');
      const latest = fixture.latestLineups.get('scheduled');
      expect(fixture.participants.filter((row) => row.lineupId === latest?.id).map((row) => row.userId)).toContain('returning');
      expect(fixture.adjustments.find((row) => row.id === 'excluded-scheduled')).toMatchObject({ revokedByRole: 'SYSTEM' });
    } finally { await fixture.module.close(); }
  });

  it('진행·종료·취소 경기, 다른 선수·팀·리그의 빠짐과 공식 결과는 보존한다', async () => {
    const fixture = await setup();
    try {
      await fixture.removeAndReadd();
      await fixture.drain();
      expect(fixture.adjustments.filter((row) => row.revokedAt !== null).map((row) => row.id)).toEqual(['excluded-scheduled', 'excluded-another']);
      expect(fixture.games.find((row) => row.id === 'ended')?.currentOfficialRevisionId).toBe('official-revision');
      expect(fixture.games.find((row) => row.id === 'scheduled-official')?.currentOfficialRevisionId).toBe('historical-official');
      expect((await fixture.roster())?.computation.excluded.map((row) => row.entry.userId)).toEqual(['other']);
    } finally { await fixture.module.close(); }
  });

  it('처리가 늦어져도 재추가 뒤 새로 저장한 빠짐은 취소하지 않고 재시도는 멱등이다', async () => {
    const fixture = await setup();
    try {
      await fixture.removeAndReadd();
      const old = fixture.adjustments.find((row) => row.id === 'excluded-scheduled');
      if (old === undefined) throw new TypeError('Missing exclusion fixture');
      old.revokedAt = NOW;
      fixture.adjustments.push(exclusion('fresh-after-readd', fixture.scheduled));
      const pending = [...fixture.events];
      await fixture.drain();
      const writes = [...fixture.writes];
      for (const event of pending) await handleCompetitionRosterResync(fixture.prisma, event);
      expect(fixture.adjustments.find((row) => row.id === 'fresh-after-readd')?.revokedAt).toBeNull();
      expect((await fixture.roster())?.computation.excluded.map((row) => row.entry.userId)).toContain('returning');
      expect(fixture.writes).toEqual(writes);
    } finally { await fixture.module.close(); }
  });

  it('워커가 계획을 읽은 뒤 시작된 경기에는 제외 취소나 새 명단을 쓰지 않는다', async () => {
    const fixture = await setup();
    try {
      await fixture.removeAndReadd();
      fixture.stateOnNextLock.set('scheduled', V1GameState.LIVE);
      const originalLineup = fixture.latestLineups.get('scheduled');
      await fixture.drain();
      expect(fixture.adjustments.find((row) => row.id === 'excluded-scheduled')?.revokedAt).toBeNull();
      expect(fixture.latestLineups.get('scheduled')).toBe(originalLineup);
    } finally { await fixture.module.close(); }
  });

  it.each([
    { options: { managerRole: 'member' }, code: 'PERMISSION_DENIED' },
    { options: { registrationStatus: 'cancel_requested' }, code: 'REGISTRATION_ROSTER_NOT_MUTABLE' },
    { options: { registrationStatus: 'cancelled' }, code: 'REGISTRATION_ROSTER_NOT_MUTABLE' },
  ])('거부된 요청은 참가 명단이나 경기별 빠짐을 바꾸지 않는다: $code', async ({ options, code }) => {
    const fixture = await setup(options);
    try {
      await expect(fixture.service.addPlayer(MANAGER, 'league', 'registration', { userId: 'returning', realName: '선수' }))
        .rejects.toMatchObject({ response: { code } });
      expect(fixture.events).toEqual([]);
      expect(fixture.writes).toEqual([]);
      expect(fixture.players.find((row) => row.userId === 'returning')?.removedAt).toBeNull();
    } finally { await fixture.module.close(); }
  });
});
