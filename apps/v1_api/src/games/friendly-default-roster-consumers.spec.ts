import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, type V1GameLineup, type V1GameParticipant } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameTakeoverService } from './game-takeover.service';
import { gameOperationAuditActor, GamesService } from './games.service';

const ids = { game: randomUUID(), match: randomUUID(), home: randomUUID(), away: randomUUID(), homeTeam: randomUUID(), awayTeam: randomUUID(), reader: randomUUID() };
const reader: V1AuthUser = { id: ids.reader, email: null, accountStatus: 'active', onboardingStatus: 'completed' };
const awayReader: V1AuthUser = { ...reader, id: 'away-player' };
type LineupRow = Pick<V1GameLineup, 'id' | 'gameId' | 'sideId' | 'revision' | 'state' | 'submittedAt' | 'invalidatedAt'>;

async function consumerFixture(options: { readonly scheduled?: boolean; readonly teamActor?: boolean; readonly competition?: boolean; readonly startAt?: Date } = {}) {
  const teamMatch = {
    id: ids.match, deletedAt: null, tournamentId: null, leagueId: options.competition ? ids.match : null, fieldId: null, status: 'matched',
    hostTeamId: ids.homeTeam, approvedApplicantTeamId: ids.awayTeam, startAt: options.startAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000), tournament: null, league: null, tournamentDetails: null,
  };
  const visibilityPolicy: { lineupAt: Date | null } = { lineupAt: new Date(Date.now() + 60 * 60 * 1000) };
  const game = { id: ids.game, sourceType: 'TEAM_MATCH', teamMatchId: ids.match, state: options.scheduled ? 'SCHEDULED' : 'LIVE', version: 0, lastSequence: 0, competitionConfigVersionId: 'futsal-config', visibilityPolicy };
  const sides = [{ id: ids.home, teamId: ids.homeTeam, sideKey: 'HOME' }, { id: ids.away, teamId: ids.awayTeam, sideKey: 'AWAY' }];
  const lineups: LineupRow[] = sides.map((side) => ({ id: randomUUID(), gameId: ids.game, sideId: side.id, revision: 1, state: 'DRAFT', submittedAt: null, invalidatedAt: null }));
  const participants: V1GameParticipant[] = lineups.map((lineup, index) => ({
    id: randomUUID(), gameId: ids.game, lineupId: lineup.id, sideId: lineup.sideId, userId: index === 0 ? ids.reader : 'away-player',
    displayNameSnapshot: index === 0 ? '생성 시점 홈 선수' : '생성 시점 원정 선수', jerseyNumber: null, position: null,
    positionX: null, positionY: null, started: true, arrivedAt: null, createdAt: new Date(), updatedAt: new Date(),
  }));
  const audits: Prisma.V1OperationAuditUncheckedCreateInput[] = [];
  const transactionOptions: unknown[] = [];
  const sideLookups: unknown[] = [];
  const events: Array<{ id: string; gameId: string; sequence: number; participantId?: string | null }> = [];
  const links: Array<{ participantId: string; userId: string; linkId: string }> = [];
  const members = sides.map((side, index) => ({
    id: `member-${index}`, teamId: side.teamId, userId: index === 0 ? ids.reader : 'away-player', role: index === 0 ? 'owner' : 'member', status: 'active', jerseyNumber: null,
    user: { accountStatus: 'active', deletedAt: null, profile: { nickname: index === 0 ? '현재 홈 선수' : '현재 원정 선수', displayName: null, deletedAt: null } },
  }));
  const database = {
    $queryRaw: async () => [],
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>, options?: unknown) => {
      transactionOptions.push(options);
      return callback(database);
    },
    v1Game: {
      findUnique: async () => ({ ...game, teamMatch, sides, lineups, participants, sharedRecord: null, resultRevisions: [] }),
      update: async ({ data }: { data: { version: { increment: number }; lastSequence: number } }) => {
        game.version += data.version.increment; game.lastSequence = data.lastSequence; return { ...game };
      },
    },
    v1TeamMatch: {
      findUnique: async () => teamMatch,
      findFirst: async () => ({
        startAt: teamMatch.startAt,
        game: { id: ids.game },
        tournamentDetails: {
          homeRegistration: { id: 'home-registration', teamId: ids.homeTeam, team: { name: '홈 팀' } },
          awayRegistration: { id: 'away-registration', teamId: ids.awayTeam, team: { name: '원정 팀' } },
        },
      }),
    },
    v1GameSide: {
      findFirst: async ({ where }: { where: { id?: string; teamId?: string } }) => {
        sideLookups.push(where);
        return sides.find((side) => (where.id === undefined || side.id === where.id) && (where.teamId === undefined || side.teamId === where.teamId)) ?? null;
      },
      findMany: async () => sides,
    },
    v1GameLineup: {
      findMany: async ({ where }: { where: { sideId?: string; invalidatedAt?: Date | null } }) => lineups.filter((lineup) =>
        (where.sideId === undefined || lineup.sideId === where.sideId) &&
        (where.invalidatedAt === undefined || (where.invalidatedAt === null
          ? lineup.invalidatedAt === null
          : lineup.invalidatedAt?.getTime() === where.invalidatedAt.getTime()))),
      create: async ({ data }: { data: Prisma.V1GameLineupUncheckedCreateInput }) => {
        const row = { id: data.id ?? randomUUID(), gameId: data.gameId, sideId: data.sideId, revision: data.revision, state: data.state ?? 'DRAFT', submittedAt: null, invalidatedAt: null };
        lineups.unshift(row); return row;
      },
    },
    v1GameParticipant: {
      findMany: async ({ where }: { where: { sideId?: string; lineupId?: string | { in: string[] } } }) => participants.filter((participant) =>
        (where.sideId === undefined || participant.sideId === where.sideId) &&
        (where.lineupId === undefined || (typeof where.lineupId === 'string' ? participant.lineupId === where.lineupId : where.lineupId.in.includes(participant.lineupId)))),
      findFirst: async ({ where }: { where: { id: string } }) => participants.find((participant) => participant.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { arrivedAt: Date | null } }) => {
        const participant = participants.find((row) => row.id === where.id);
        if (participant === undefined) throw new Error('The arrival must target an actual stored participant.');
        participant.arrivedAt = data.arrivedAt;
        return { id: participant.id, sideId: participant.sideId, arrivedAt: participant.arrivedAt };
      },
      updateMany: async ({ where, data }: { where: { id: { in: string[] }; arrivedAt: null }; data: { arrivedAt: Date } }) => {
        const pending = participants.filter((participant) => where.id.in.includes(participant.id) && participant.arrivedAt === where.arrivedAt);
        for (const participant of pending) participant.arrivedAt = data.arrivedAt;
        return { count: pending.length };
      },
      createMany: async ({ data }: { data: Prisma.V1GameParticipantCreateManyInput[] }) => {
        for (const row of data) participants.push({
          id: row.id ?? randomUUID(), gameId: row.gameId, sideId: row.sideId, lineupId: row.lineupId, userId: row.userId ?? null,
          displayNameSnapshot: row.displayNameSnapshot, jerseyNumber: row.jerseyNumber ?? null, position: row.position ?? null,
          positionX: row.positionX ?? null, positionY: row.positionY ?? null, started: row.started ?? true,
          arrivedAt: row.arrivedAt == null ? null : typeof row.arrivedAt === 'string' ? new Date(row.arrivedAt) : row.arrivedAt,
          createdAt: new Date(), updatedAt: new Date(),
        });
        return { count: data.length };
      },
    },
    v1TeamMembership: {
      findMany: async ({ where }: { where: { userId?: string; status?: string; teamId?: string | { in: string[] } } }) => members.filter((member) =>
        (where.userId === undefined || member.userId === where.userId) &&
        (where.status === undefined || member.status === where.status) &&
        (where.teamId === undefined || (typeof where.teamId === 'string' ? member.teamId === where.teamId : where.teamId.in.includes(member.teamId)))),
      findFirst: async () => members[0],
    },
    v1AdminUser: { findUnique: async () => options.teamActor ? null : ({ adminRole: 'owner', status: 'active', revokedAt: null, updatedAt: new Date(), user: { accountStatus: 'active' } }) },
    v1User: { findMany: async () => [] },
    v1GamePeriod: { findFirst: async () => ({ id: 'period-1', gameId: ids.game, number: 1, state: 'LIVE' }) },
    v1GameEvent: {
      findFirst: async () => events[0] ?? null,
      findMany: async () => events,
      create: async ({ data }: { data: Prisma.V1GameEventUncheckedCreateInput }) => {
        const event = { ...data, id: data.id ?? randomUUID(), receivedAt: new Date(), reversesEventId: null, occurredAt: typeof data.occurredAt === 'string' ? new Date(data.occurredAt) : data.occurredAt };
        events.push(event); return event;
      },
    },
    v1OperationAudit: {
      findMany: async () => audits,
      create: async ({ data }: { data: Prisma.V1OperationAuditUncheckedCreateInput }) => { audits.push(data); return { id: data.id ?? randomUUID() }; },
    },
    v1ParticipantIdentityLinkCurrent: {
      findMany: async ({ where }: { where: { participantId: { in: string[] } } }) => links.filter((link) => where.participantId.in.includes(link.participantId)),
      createMany: async ({ data }: { data: typeof links }) => { links.push(...data); return { count: data.length }; },
    },
    v1ParticipantIdentityLinkEvent: { createManyAndReturn: async ({ data }: { data: typeof links }) => data.map((row) => ({ ...row, effectiveAt: new Date() })) },
    v1ParticipantConsentSnapshot: { findMany: async () => [] },
    v1IdempotencyRecord: { findUnique: async () => null, create: async () => ({ id: randomUUID() }) },
    v1OutboxEvent: { create: async () => ({ id: randomUUID() }) },
  };
  const moduleRef = await Test.createTestingModule({ providers: [GamesService, GameTakeoverService,
    { provide: PrismaService, useValue: database }, { provide: OperationAuditWriterService, useValue: new OperationAuditWriterService() },
  ] }).compile();
  return { service: moduleRef.get(GamesService), game, events, audits, lineups, participants, members, transactionOptions, sideLookups, sides, close: () => moduleRef.close() };
}

describe('MD-QA #146: actual generic lineup GET → event consumer', () => {
  it('records the unchanged current player selected from operations-lineup GET', async () => {
    // Given: an authenticated live console reads an untouched automatic friendly roster.
    const fixture = await consumerFixture();
    try {
      const before = fixture.participants.map((participant) => participant.id);
      const rows = await fixture.service.listOperationsLineups(reader, ids.game);
      const selected = rows.flatMap((lineup) => lineup.participants).find((participant) => participant.sideId === ids.home);
      if (selected === undefined) throw new Error('The actual operations GET must expose the home participant.');
      expect(fixture.participants.map((participant) => participant.id)).toEqual(before);
      expect(fixture.audits).toEqual([]);
      const grant = await fixture.service.requestTakeover(reader, ids.game, { clientInstanceId: 'mdqa146-operations-client', lastSequence: 0 });

      // When: the real event command consumes the exact id from that GET response.
      const commandId = randomUUID();
      await fixture.service.appendEvent(reader, ids.game, commandId, {
        clientEventId: commandId, expectedVersion: 0, takeoverToken: grant.takeoverToken,
        type: 'GOAL', sideId: ids.home, participantId: selected.id, period: 1, clockMs: 0,
        occurredAt: new Date().toISOString(), payload: {},
      });

      // Then: a successful real event refers to a durable participant with the same preview identity.
      expect(fixture.events).toEqual([expect.objectContaining({ participantId: selected.id })]);
      expect(fixture.participants.find((participant) => participant.id === selected.id)).toMatchObject({ userId: ids.reader, sideId: ids.home });
    } finally { await fixture.close(); }
  });

  it('lets the live host recorder select a published opponent default UUID accepted by event_append', async () => {
    const fixture = await consumerFixture({ teamActor: true, startAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    try {
      fixture.game.visibilityPolicy.lineupAt = new Date(Date.now() - 60 * 60 * 1000);
      const rows = await fixture.service.listOperationsLineups(reader, ids.game);
      const away = rows.find((lineup) => lineup.sideId === ids.away)?.participants[0];
      if (away === undefined) throw new Error('The published effective opponent roster must be selectable by the host recorder.');

      // Friendly host actors append directly without requesting a takeover lease.
      const commandId = randomUUID();
      await fixture.service.appendEvent(reader, ids.game, commandId, {
        clientEventId: commandId, expectedVersion: 0, takeoverToken: 'friendly-no-lease-required',
        type: 'GOAL', sideId: ids.away, participantId: away.id, period: 1, clockMs: 0,
        occurredAt: new Date().toISOString(), payload: {},
      });

      expect(fixture.events).toEqual([expect.objectContaining({ participantId: away.id, sideId: ids.away })]);
      const frozenAway = fixture.lineups.find((lineup) => lineup.sideId === ids.away && lineup.revision === 2);
      const frozenHome = fixture.lineups.find((lineup) => lineup.sideId === ids.home && lineup.revision === 2);
      if (frozenAway === undefined || frozenHome === undefined) throw new Error('The first event must append one frozen revision for each default side.');
      expect(fixture.participants).toHaveLength(4);
      expect(fixture.participants.find((participant) => participant.id === away.id)).toMatchObject({ lineupId: frozenAway.id, sideId: ids.away });
      expect(fixture.participants.find((participant) => participant.sideId === ids.home && participant.lineupId === frozenHome.id)).toBeDefined();
      const freezeAudits = fixture.audits.filter((audit) => audit.action === 'FRIENDLY_DEFAULT_ROSTER_FROZEN');
      expect(freezeAudits).toHaveLength(2);
      expect(freezeAudits).toEqual(expect.arrayContaining([
        expect.objectContaining({ actorType: 'SYSTEM', systemActor: 'FRIENDLY_DEFAULT_ROSTER_FROZEN', action: 'FRIENDLY_DEFAULT_ROSTER_FROZEN', after: expect.objectContaining({ sideId: ids.away, lineupId: frozenAway.id }) }),
        expect.objectContaining({ actorType: 'SYSTEM', systemActor: 'FRIENDLY_DEFAULT_ROSTER_FROZEN', action: 'FRIENDLY_DEFAULT_ROSTER_FROZEN', after: expect.objectContaining({ sideId: ids.home, lineupId: frozenHome.id }) }),
      ]));
      const appendAudits = fixture.audits.filter((audit) => audit.action === 'EVENT_APPEND');
      expect(appendAudits).toHaveLength(1);
      expect(appendAudits[0]).toMatchObject({
        actorType: 'USER', actorUserId: reader.id, systemActor: null,
        action: 'EVENT_APPEND', resourceType: 'GAME', resourceId: ids.game, requestId: commandId,
        after: expect.objectContaining({
          state: 'LIVE', version: 1, sequence: 1,
          event: expect.objectContaining({ type: 'GOAL', sideId: ids.away, participantId: away.id }),
        }),
      });
      expect(fixture.audits.map((audit) => audit.action).sort()).toEqual([
        'EVENT_APPEND', 'FRIENDLY_DEFAULT_ROSTER_FROZEN', 'FRIENDLY_DEFAULT_ROSTER_FROZEN',
      ]);
    } finally { await fixture.close(); }
  });

  it('keeps a live host recorder from selecting an opponent default before its explicit publication time', async () => {
    const fixture = await consumerFixture({ teamActor: true, startAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    try {
      const rows = await fixture.service.listOperationsLineups(reader, ids.game);

      expect(rows.find((lineup) => lineup.sideId === ids.away)?.participants).toEqual([]);
      expect(rows.find((lineup) => lineup.sideId === ids.home)?.participants).toHaveLength(1);
    } finally { await fixture.close(); }
  });

  it('keeps scheduled team-manager GET limited to the own side and omits operator identity fields', async () => {
    // Given: a team actor opens the scheduled console before either team has submitted.
    const fixture = await consumerFixture({ scheduled: true, teamActor: true });
    try {
      // When: both existing lineup readers are used by that actor.
      const operations = await fixture.service.listOperationsLineups(reader, ids.game);
      const ordinary = await fixture.service.listLineups(reader, ids.game);

      // Then: effective defaults preserve each reader's previous own-side/identity boundary and GET has no writes.
      expect(operations.map((lineup) => lineup.sideId)).toEqual([ids.home]);
      expect(ordinary.map((lineup) => lineup.sideId)).toEqual([ids.home]);
      expect(operations.flatMap((lineup) => lineup.participants).some((participant) => 'identity' in participant)).toBe(false);
      expect(fixture.audits).toEqual([]);
      expect(fixture.lineups).toHaveLength(2);
    } finally { await fixture.close(); }
  });
});

describe('MD-QA #146: actual generic lineup GET → arrival consumer', () => {
  it('orders same-millisecond true → false → true by sequence and keeps repeated true idempotent', async () => {
    const fixture = await consumerFixture();
    jest.useFakeTimers({ now: new Date('2026-10-15T09:00:00.000Z') });
    try {
      const selected = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants).find((participant) => participant.sideId === ids.home);
      if (selected === undefined) throw new Error('The current player must exist.');
      const first = await fixture.service.setParticipantArrival(reader, ids.game, selected.id, true);
      expect(await fixture.service.setParticipantArrival(reader, ids.game, selected.id, true)).toEqual(first);
      expect(fixture.audits.filter((audit) => audit.action === 'FRIENDLY_DEFAULT_ROSTER_ARRIVAL')).toHaveLength(1);
      expect(await fixture.service.setParticipantArrival(reader, ids.game, selected.id, false)).toMatchObject({ arrivedAt: null });
      await fixture.service.setParticipantArrival(reader, ids.game, selected.id, true);
      const changes = fixture.audits.filter((audit) => audit.action === 'FRIENDLY_DEFAULT_ROSTER_ARRIVAL');
      expect(changes.map((audit) => {
        const value = audit.after;
        return value !== null && typeof value === 'object' && !Array.isArray(value) && 'sequence' in value ? value.sequence : null;
      })).toEqual([1, 2, 3]);
      fixture.audits.reverse();
      const after = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants).find((participant) => participant.id === selected.id);
      expect(after?.arrivedAt).toEqual(first.arrivedAt);
      expect(fixture.lineups).toHaveLength(2);
      expect(fixture.game.version).toBe(0);
    } finally { jest.useRealTimers(); await fixture.close(); }
  });

  it.each(['foreign', 'departed', 'stale-basis'] as const)('rejects a %s preview selection without an arrival audit or freeze', async (scenario) => {
    const fixture = await consumerFixture({ teamActor: true });
    try {
      if (scenario === 'foreign') {
        const awayMember = fixture.members.find((member) => member.userId === awayReader.id);
        if (awayMember === undefined) throw new Error('The away owner must exist in the fixture.');
        awayMember.role = 'owner';
      }
      const selectionReader = scenario === 'foreign' ? awayReader : reader;
      const selectionLineups = scenario === 'foreign'
        ? await fixture.service.listLineups(selectionReader, ids.game)
        : await fixture.service.listOperationsLineups(selectionReader, ids.game);
      const rows = selectionLineups.flatMap((lineup) => lineup.participants);
      let selected = rows.find((participant) => participant.sideId === (scenario === 'foreign' ? ids.away : ids.home));
      if (scenario === 'departed') {
        const late = { ...fixture.members[0], id: 'departing-home-member', userId: randomUUID(), role: 'member' };
        fixture.members.push(late);
        selected = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants).find((participant) => participant.userId === late.userId);
        late.status = 'left';
      } else if (scenario === 'stale-basis') {
        const previous = fixture.lineups.find((lineup) => lineup.sideId === ids.home);
        if (previous === undefined) throw new Error('The home basis must exist.');
        fixture.lineups.unshift({ ...previous, id: randomUUID(), revision: 2 });
      }
      if (selected === undefined) throw new Error('The selected current preview must exist before invalidation.');
      if (scenario === 'foreign') expect(selectionLineups.map((lineup) => lineup.sideId)).toEqual([ids.away]);
      await expect(fixture.service.setParticipantArrival(reader, ids.game, selected.id, true)).rejects.toMatchObject({ status: scenario === 'foreign' ? 403 : 404 });
      if (scenario === 'foreign') await expect(fixture.service.confirmSideArrival(reader, ids.game, ids.away)).rejects.toMatchObject({ status: 403 });
      expect(fixture.audits).toEqual([]);
      expect(fixture.events).toEqual([]);
      expect(fixture.participants).toHaveLength(2);
      expect(fixture.lineups.filter((lineup) => lineup.revision >= 2)).toHaveLength(scenario === 'stale-basis' ? 1 : 0);
      expect(fixture.game.version).toBe(0);
    } finally { await fixture.close(); }
  });

  it('carries an actual preview arrival into the same participant when the first goal freezes the default', async () => {
    const fixture = await consumerFixture();
    try {
      const selected = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants).find((participant) => participant.sideId === ids.home);
      if (selected === undefined) throw new Error('The scorer must exist.');
      const arrived = await fixture.service.setParticipantArrival(reader, ids.game, selected.id, true);
      const grant = await fixture.service.requestTakeover(reader, ids.game, { clientInstanceId: 'mdqa146-arrival-freeze-client', lastSequence: 0 });
      const commandId = randomUUID();
      await fixture.service.appendEvent(reader, ids.game, commandId, {
        clientEventId: commandId, expectedVersion: 0, takeoverToken: grant.takeoverToken,
        type: 'GOAL', sideId: ids.home, participantId: selected.id, period: 1, clockMs: 0, occurredAt: new Date().toISOString(), payload: {},
      });
      expect(fixture.participants.find((participant) => participant.id === selected.id)?.arrivedAt).toEqual(arrived.arrivedAt);
      expect(fixture.events).toEqual([expect.objectContaining({ participantId: selected.id })]);
      expect(fixture.audits.filter((audit) => audit.action === 'FRIENDLY_DEFAULT_ROSTER_FROZEN')).toHaveLength(2);
    } finally { await fixture.close(); }
  });

  it('toggles the displayed default arrival without freezing later pre-record membership changes', async () => {
    // Given: an operator selects the current default player from the actual GET response.
    const fixture = await consumerFixture();
    try {
      const rows = await fixture.service.listOperationsLineups(reader, ids.game);
      const selected = rows.flatMap((lineup) => lineup.participants).find((participant) => participant.sideId === ids.home);
      if (selected === undefined) throw new Error('The current home player must be visible.');

      // When: the real arrival endpoint receives precisely that preview id.
      const arrived = await fixture.service.setParticipantArrival(reader, ids.game, selected.id, true);
      expect(arrived).toMatchObject({ id: selected.id, sideId: ids.home, arrivedAt: expect.any(Date) });
      const checked = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants);
      expect(checked.find((participant) => participant.id === selected.id)?.arrivedAt).toEqual(arrived.arrivedAt);
      const late = { ...fixture.members[0], id: 'late-home-member', userId: randomUUID(), role: 'member', user: { ...fixture.members[0].user, profile: { nickname: '늦게 합류한 팀원', displayName: null, deletedAt: null } } };
      fixture.members.push(late);
      const joined = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants);
      expect(joined.filter((participant) => participant.sideId === ids.home)).toHaveLength(2);
      late.status = 'left';

      // Then: arrival is durable but does not snapshot the roster or change the record version.
      const afterLeave = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants);
      expect(afterLeave.filter((participant) => participant.sideId === ids.home)).toHaveLength(1);
      expect(afterLeave.find((participant) => participant.id === selected.id)?.arrivedAt).toEqual(arrived.arrivedAt);
      expect(fixture.lineups).toHaveLength(2);
      expect(fixture.game.version).toBe(0);
      expect(fixture.events).toEqual([]);
      expect(fixture.audits.some((audit) => audit.action === 'FRIENDLY_DEFAULT_ROSTER_FROZEN')).toBe(false);
    } finally { await fixture.close(); }
  });

  it('bulk-confirms the current qualified default rather than the stale creation snapshot', async () => {
    // Given: two qualified players replaced the original home member before the first record.
    const fixture = await consumerFixture();
    try {
      fixture.members[0].status = 'left';
      for (let index = 0; index < 2; index += 1) fixture.members.push({
        ...fixture.members[0], id: `current-home-${index}`, userId: randomUUID(), role: 'member', status: 'active',
        user: { ...fixture.members[0].user, profile: { nickname: `현재 홈 팀원 ${index}`, displayName: null, deletedAt: null } },
      });
      const before = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants).filter((participant) => participant.sideId === ids.home);
      expect(before).toHaveLength(2);

      // When: the real bulk endpoint confirms that displayed side.
      const result = await fixture.service.confirmSideArrival(reader, ids.game, ids.home);

      // Then: both current players are confirmed and no first-record freeze is manufactured.
      expect(result).toEqual({ sideId: ids.home, participantCount: 2, newlyArrivedCount: 2 });
      const after = (await fixture.service.listOperationsLineups(reader, ids.game)).flatMap((lineup) => lineup.participants).filter((participant) => participant.sideId === ids.home);
      expect(after.map((participant) => participant.id).sort()).toEqual(before.map((participant) => participant.id).sort());
      expect(after.every((participant) => participant.arrivedAt instanceof Date)).toBe(true);
      expect(fixture.lineups).toHaveLength(2);
      expect(fixture.game.version).toBe(0);
      expect(fixture.events).toEqual([]);
      expect(fixture.audits.some((audit) => audit.action === 'FRIENDLY_DEFAULT_ROSTER_FROZEN')).toBe(false);
    } finally { await fixture.close(); }
  });
});

describe('friendly default preview access by team-scoped readers', () => {
  it('limits DEFAULT_PREVIEW names to the reader team while preserving both post-kickoff lineup rows', async () => {
    const fixture = await consumerFixture();
    try {
      jest.spyOn(fixture.service as unknown as { resolveActor: (...args: unknown[]) => Promise<unknown> }, 'resolveActor')
        .mockResolvedValue({ actorType: 'USER', actorUserId: ids.reader, role: 'support_readonly', teamId: ids.homeTeam });

      const ordinary = await fixture.service.listLineups(reader, ids.game);
      const operations = await fixture.service.listOperationsLineups(reader, ids.game);

      expect(ordinary.map((lineup) => lineup.sideId)).toEqual([ids.home]);
      expect(ordinary.flatMap((lineup) => lineup.participants).map((participant) => participant.displayNameSnapshot)).toEqual(['현재 홈 선수']);
      expect(operations.map((lineup) => lineup.sideId).sort()).toEqual([ids.away, ids.home].sort());
      expect(operations.find((lineup) => lineup.sideId === ids.home)?.participants.map((participant) => participant.displayNameSnapshot)).toEqual(['현재 홈 선수']);
      expect(operations.find((lineup) => lineup.sideId === ids.away)?.participants).toEqual([]);
      const awayDraft = fixture.lineups.find((lineup) => lineup.sideId === ids.away);
      if (awayDraft === undefined) throw new Error('The away lineup must exist in the fixture.');
      awayDraft.state = 'SUBMITTED';
      const submittedButPrivate = await fixture.service.listOperationsLineups(reader, ids.game);
      expect(submittedButPrivate.find((lineup) => lineup.sideId === ids.away)?.participants).toEqual([]);
      fixture.game.visibilityPolicy.lineupAt = new Date(Date.now() - 60 * 60 * 1000);
      const actuallyPublished = await fixture.service.listOperationsLineups(reader, ids.game);
      expect(actuallyPublished.find((lineup) => lineup.sideId === ids.away)?.participants.map((participant) => participant.displayNameSnapshot)).toEqual(['생성 시점 원정 선수']);
      expect(fixture.transactionOptions).toHaveLength(4);
      expect(fixture.transactionOptions.every((options) => (options as { isolationLevel?: string }).isolationLevel === 'RepeatableRead')).toBe(true);
      expect(fixture.audits).toEqual([]);
      expect(fixture.lineups).toHaveLength(2);
    } finally { await fixture.close(); }
  });

  it('keeps an ordinary team member scoped to their own preview while retaining both post-kickoff rows', async () => {
    const fixture = await consumerFixture();
    try {
      jest.spyOn(fixture.service as unknown as { resolveActor: (...args: unknown[]) => Promise<unknown> }, 'resolveActor')
        .mockResolvedValue({ actorType: 'USER', actorUserId: ids.reader, role: 'team_member', teamId: ids.homeTeam });

      const ordinary = await fixture.service.listLineups(reader, ids.game);
      const operations = await fixture.service.listOperationsLineups(reader, ids.game);

      expect(ordinary.map((lineup) => lineup.sideId)).toEqual([ids.home]);
      expect(ordinary.flatMap((lineup) => lineup.participants).map((participant) => participant.displayNameSnapshot)).toEqual(['현재 홈 선수']);
      expect(operations.map((lineup) => lineup.sideId).sort()).toEqual([ids.away, ids.home].sort());
      expect(operations.find((lineup) => lineup.sideId === ids.home)?.participants.map((participant) => participant.displayNameSnapshot)).toEqual(['현재 홈 선수']);
      expect(operations.find((lineup) => lineup.sideId === ids.away)?.participants).toEqual([]);
    } finally { await fixture.close(); }
  });

  it('preserves all-side preview access for teamless tournament support staff without guessing a team side', async () => {
    const fixture = await consumerFixture();
    try {
      jest.spyOn(fixture.service as unknown as { resolveActor: (...args: unknown[]) => Promise<unknown> }, 'resolveActor')
        .mockResolvedValue({ actorType: 'USER', actorUserId: ids.reader, role: 'support_readonly' });

      const ordinary = await fixture.service.listLineups(reader, ids.game);
      const operations = await fixture.service.listOperationsLineups(reader, ids.game);

      expect(ordinary.map((lineup) => lineup.sideId).sort()).toEqual([ids.away, ids.home].sort());
      expect(operations.map((lineup) => lineup.sideId).sort()).toEqual([ids.away, ids.home].sort());
      expect(ordinary.flatMap((lineup) => lineup.participants)).toHaveLength(2);
      expect(operations.flatMap((lineup) => lineup.participants)).toHaveLength(2);
      expect(fixture.sideLookups).toEqual([]);
    } finally { await fixture.close(); }
  });

  it('keeps a submitted competition opponent visible to a team reader after its explicit publication time', async () => {
    const fixture = await consumerFixture({ competition: true });
    try {
      jest.spyOn(fixture.service as unknown as { resolveActor: (...args: unknown[]) => Promise<unknown> }, 'resolveActor')
        .mockResolvedValue({ actorType: 'USER', actorUserId: ids.reader, role: 'team_member', teamId: ids.homeTeam });
      const away = fixture.lineups.find((lineup) => lineup.sideId === ids.away);
      if (away === undefined) throw new Error('The away competition lineup must exist in the fixture.');
      away.revision = 2;
      away.state = 'SUBMITTED';
      fixture.lineups.push(
        { ...away, id: randomUUID(), revision: 3, state: 'DRAFT', submittedAt: null },
        { ...away, id: randomUUID(), revision: 4, state: 'SUBMITTED', submittedAt: new Date(), invalidatedAt: new Date() },
      );

      const beforePublication = await fixture.service.listOperationsLineups(reader, ids.game);
      expect(beforePublication.filter((lineup) => lineup.sideId === ids.away).flatMap((lineup) => lineup.participants)).toEqual([]);
      expect(beforePublication.some((lineup) => lineup.revision === 4)).toBe(false);

      fixture.game.visibilityPolicy.lineupAt = new Date(Date.now() - 60 * 60 * 1000);
      const afterPublication = await fixture.service.listOperationsLineups(reader, ids.game);
      const publishedAwayRows = afterPublication.filter((lineup) => lineup.sideId === ids.away);
      expect(afterPublication.filter((lineup) => lineup.sideId === ids.home)).toHaveLength(1);
      expect(publishedAwayRows.map((lineup) => lineup.revision).sort((a, b) => a - b)).toEqual([2, 3]);
      expect(publishedAwayRows.find((lineup) => lineup.revision === 2)?.participants.map((participant) => participant.displayNameSnapshot)).toEqual(['생성 시점 원정 선수']);
      expect(publishedAwayRows.find((lineup) => lineup.revision === 3)?.participants).toEqual([]);
      expect(afterPublication.some((lineup) => lineup.revision === 4)).toBe(false);
    } finally { await fixture.close(); }
  });

  it('derives the competition publication time from scheduled kickoff when policy lineupAt is null', async () => {
    const fixture = await consumerFixture({ competition: true, startAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    try {
      jest.spyOn(fixture.service as unknown as { resolveActor: (...args: unknown[]) => Promise<unknown> }, 'resolveActor')
        .mockResolvedValue({ actorType: 'USER', actorUserId: ids.reader, role: 'team_member', teamId: ids.homeTeam });
      const away = fixture.lineups.find((lineup) => lineup.sideId === ids.away);
      if (away === undefined) throw new Error('The away competition lineup must exist in the fixture.');
      away.state = 'SUBMITTED';
      fixture.game.visibilityPolicy.lineupAt = null;

      const rows = await fixture.service.listOperationsLineups(reader, ids.game);

      expect(rows.find((lineup) => lineup.sideId === ids.away)?.participants.map((participant) => participant.displayNameSnapshot))
        .toEqual(['생성 시점 원정 선수']);
    } finally { await fixture.close(); }
  });

  it('fails closed when a team-scoped reader has no matching game side', async () => {
    const fixture = await consumerFixture();
    try {
      fixture.sides.splice(0, 1);
      jest.spyOn(fixture.service as unknown as { resolveActor: (...args: unknown[]) => Promise<unknown> }, 'resolveActor')
        .mockResolvedValue({ actorType: 'USER', actorUserId: ids.reader, role: 'team_member', teamId: ids.homeTeam });

      await expect(fixture.service.listLineups(reader, ids.game)).rejects.toMatchObject({ status: 404 });
      await expect(fixture.service.listOperationsLineups(reader, ids.game)).rejects.toMatchObject({ status: 404 });
    } finally { await fixture.close(); }
  });

  it('keeps teamless support staff in the staff fixture-access and audit lanes', async () => {
    const fixture = await consumerFixture({ competition: true });
    try {
      jest.spyOn(fixture.service as unknown as { resolveActor: (...args: unknown[]) => Promise<unknown> }, 'resolveActor')
        .mockImplementation(async (_tx, _gameId, _userId, action) => {
          if (action === 'read') return { actorType: 'USER', actorUserId: ids.reader, role: 'support_readonly' };
          throw new ForbiddenException();
        });

      const access = await fixture.service.resolveFixtureLineupAccess(reader, ids.match, 'fixture-id');

      expect(access).toMatchObject({ mySideId: null, isStaff: true, canMutateLineup: false });
      expect(gameOperationAuditActor({ actorType: 'USER', actorUserId: ids.reader, role: 'support_readonly' } as Parameters<typeof gameOperationAuditActor>[0]))
        .toEqual({ type: 'TOURNAMENT_STAFF', id: ids.reader });
    } finally { await fixture.close(); }
  });
});
