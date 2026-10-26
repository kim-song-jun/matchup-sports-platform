import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType, type Prisma } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const SESSION = randomUUID().slice(0, 8);
const timeoutMs = 5_000;

function eventOnce<T>(socket: Socket, event: string): {
  promise: Promise<{ event: T } | { timeout: true } | { cancelled: true }>;
  cancel: () => void;
} {
  let finish!: (result: { event: T } | { timeout: true } | { cancelled: true }) => void;
    let timer: NodeJS.Timeout | undefined;
  const listener = (value: T) => finish({ event: value });
  const promise = new Promise<{ event: T } | { timeout: true } | { cancelled: true }>((resolve) => {
    finish = (result) => {
      if (timer !== undefined) clearTimeout(timer);
      socket.off(event, listener);
      resolve(result);
    };
    timer = setTimeout(() => finish({ timeout: true }), timeoutMs);
    socket.on(event, listener);
  });
  return { promise, cancel: () => finish({ cancelled: true }) };
}

function connected(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO connection timed out')), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe('REST lifecycle commands refresh authorized game subscribers', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let configId: string;
  let sportId: string;
  let regionId: string;
  let requiredTermIds: string[];
  let operatorId: string;
  let observerId: string;
  let awayTeamOwnerId: string;
  let gameId: string;
  let hostTeamId: string;
  let awayTeamId: string;
  let tournamentId: string;
  let fixtureId: string;
  let liveSockets: Socket[] = [];

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const sport = await prisma.v1Sport.upsert({ where: { code: 'football' }, update: {}, create: { code: 'football', name: '축구' } });
    sportId = sport.id;
    regionId = (await prisma.v1Region.create({ data: { code: `gcr-${SESSION}`, name: 'REST 명령 실시간 지역', level: 2 } })).id;
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('football-v1 preset is required');
    configId = config.id;

    const terms = await app.get(ManagedTermsRuntimeService).currentSignupTerms();
    requiredTermIds = terms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    operatorId = await makeUser('운영자', 1);
    observerId = await makeUser('조회자', 2);
    const adminId = await makeUser('관리자', 3);
    awayTeamOwnerId = await makeUser('원정팀장', 4);
    await prisma.v1AdminUser.create({ data: { userId: adminId, adminRole: 'ops', status: 'active' } });
    tournamentId = (await prisma.v1Tournament.create({
      data: { sportId, regionId, title: `REST lifecycle realtime ${SESSION}`, competitionConfigVersionId: configId, status: 'in_progress' },
    })).id;
    await prisma.v1TournamentStaffAssignment.createMany({
      data: [
        { tournamentId, userId: operatorId, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: adminId },
        { tournamentId, userId: observerId, role: 'SUPPORT_READONLY', grantedByUserId: adminId },
      ],
    });
    hostTeamId = await makeTeam('home', operatorId);
    awayTeamId = await makeTeam('away', awayTeamOwnerId);
    const registrations = await Promise.all([hostTeamId, awayTeamId].map((teamId, index) =>
      prisma.v1TournamentRegistration.create({ data: { tournamentId, teamId, appliedByUserId: index === 0 ? operatorId : awayTeamOwnerId, status: 'confirmed' } }),
    ));
    fixtureId = randomUUID();
    await prisma.v1TeamMatch.create({
      data: {
        id: fixtureId,
        tournamentId,
        sportId,
        regionId,
        title: `REST lifecycle ${SESSION}`,
        hostTeamId,
        approvedApplicantTeamId: awayTeamId,
        createdByUserId: adminId,
        startAt: new Date('2030-01-01T00:00:00.000Z'),
        status: 'matched',
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentMatchDetails.create({
      data: { teamMatchId: fixtureId, tournamentId, round: 'group', fixtureNumber: 1, homeRegistrationId: registrations[0].id, awayRegistrationId: registrations[1].id },
    });
    const creation: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: fixtureId,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: hostTeamId, displayNameSnapshot: '홈' },
        { sideKey: V1GameSideKey.AWAY, teamId: awayTeamId, displayNameSnapshot: '원정' },
      ],
      participants: [
        { sourceParticipantId: `gcr-${SESSION}-home-player`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: '홈 선수', jerseyNumber: 1 },
        { sourceParticipantId: `gcr-${SESSION}-away-player`, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: '원정 선수', jerseyNumber: 1 },
      ],
    };
    const context: GameCommandContext = {
      actor: { actorType: 'USER', actorUserId: adminId, role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: `gcr-create-${SESSION}`,
      payloadHash: canonicalGameCommandPayloadHash(creation),
    };
    const created = await prisma.$transaction((tx: Prisma.TransactionClient) => app.get(GamesService).createFromSourceInTransaction(tx, creation, context));
    gameId = created.gameId;
    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });
  });

  afterAll(async () => {
    for (const socket of liveSockets) socket.disconnect();
    liveSockets = [];
    await cleanup?.();
  });

  async function makeUser(label: string, index: number): Promise<string> {
    const id = `gcr-${SESSION}-${index}`;
    await prisma.v1User.create({
      data: {
        id,
        email: `${id}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: `0103188${String(index).padStart(4, '0')}`,
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        profile: { create: { nickname: `${label}-${SESSION}`, realName: `${label}${SESSION}`, birthDate: '1995-01-01', gender: 'male' } },
      },
    });
    await app.get(ManagedTermsRuntimeService).acceptSignupTerms(id, requiredTermIds);
    return id;
  }

  async function makeTeam(label: string, ownerUserId: string): Promise<string> {
    const team = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `gcr-${label}-${SESSION}` } });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerUserId, role: 'owner', status: 'active' } });
    return team.id;
  }

  function connect(userId: string, suffix: string, assignmentVersion: number): Socket {
    const address = app.getHttpServer().address();
    if (address === null || typeof address === 'string') throw new Error('Integration HTTP server is not listening');
    const socket = io(`http://127.0.0.1:${address.port}/game-operations`, {
      autoConnect: false,
      transports: ['websocket'],
      auth: { clientInstanceId: `gcr-${SESSION}-${suffix}`, authorizationSubjectVersion: assignmentVersion },
      extraHeaders: { 'x-v1-user-id': userId },
    });
    liveSockets.push(socket);
    return socket;
  }

  it('keeps a read-only observer current after a real REST start command', async () => {
    const server = app.getHttpServer();
    if (!server.listening) await app.listen(0, '127.0.0.1');
    const observerAssignment = await app.get(TournamentStaffAccessService).assertAccess({
      userId: observerId,
      action: 'read',
      resource: { tournamentId, fixtureId },
    });
    const operatorAssignment = await app.get(TournamentStaffAccessService).assertAccess({
      userId: operatorId,
      action: 'read',
      resource: { tournamentId, fixtureId },
    });
    const observer = connect(observerId, 'observer', observerAssignment.assignmentVersion ?? 0);
    const operator = connect(operatorId, 'operator', operatorAssignment.assignmentVersion ?? 0);
    observer.connect();
    operator.connect();
    await Promise.all([connected(observer), connected(operator)]);

    const subscribe = (socket: Socket) => new Promise<{
      status: string;
      snapshot?: { gameId: string; version: number; state: string; lastSequence: number; events: unknown[] };
    }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for game.subscribe acknowledgement')), timeoutMs);
      socket.emit('game.subscribe', { gameId, afterSequence: 0 }, (result: {
        status: string;
        snapshot?: { gameId: string; version: number; state: string; lastSequence: number; events: unknown[] };
      }) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
    const [observerSubscribe, operatorSubscribe] = await Promise.all([subscribe(observer), subscribe(operator)]);
    expect(observerSubscribe).toMatchObject({
      status: 'subscribed',
      snapshot: { gameId, version: 0, state: 'SCHEDULED', lastSequence: 0, events: [] },
    });
    expect(operatorSubscribe).toMatchObject({
      status: 'subscribed',
      snapshot: { gameId, version: 0, state: 'SCHEDULED', lastSequence: 0, events: [] },
    });

    const requestTakeover = (
      socket: Socket,
      assignmentVersion: number,
      clientInstanceId: string,
    ) => new Promise<{
      status: string;
      code?: string;
      gameId?: string;
      version?: number;
      lastSequence?: number;
      takeoverToken?: string;
    }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for takeover result')), timeoutMs);
      socket.emit(
        'game.takeover.request',
        { gameId, authorizationSubjectVersion: assignmentVersion, clientInstanceId, lastSequence: 0 },
        (result: {
          status: string;
          code?: string;
          gameId?: string;
          version?: number;
          lastSequence?: number;
          takeoverToken?: string;
        }) => {
          clearTimeout(timer);
          resolve(result);
        },
      );
    });
    await expect(
      requestTakeover(
        observer,
        observerAssignment.assignmentVersion ?? 0,
        `gcr-${SESSION}-observer`,
      ),
    ).resolves.toMatchObject({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
    const takeover = await requestTakeover(
      operator,
      operatorAssignment.assignmentVersion ?? 0,
      `gcr-${SESSION}-operator`,
    );
    expect(takeover).toMatchObject({ status: 'granted', gameId, version: 0, lastSequence: 0 });

    const before = await request(app.getHttpServer())
      .get(`/api/v1/games/${gameId}`)
      .set('x-v1-user-id', observerId)
      .expect(200);
    const snapshotWait = eventOnce<{
      gameId: string;
      version: number;
      state: string;
      lastSequence: number;
      events: unknown[];
    }>(observer, 'game.snapshot');
    let commandVersion: number;
    try {
      const command = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/start`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-start-${SESSION}`)
        .send({
          expectedVersion: before.body.data.version,
          clientCommandId: `gcr-start-${SESSION}`,
          takeoverToken: takeover.takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      commandVersion = command.body.data.version;
      const received = await snapshotWait.promise;
      expect(received).toHaveProperty('event');
      if (!('event' in received)) throw new Error('Observer did not receive a game.snapshot');
      expect(received.event).toMatchObject({
        gameId,
        version: commandVersion,
        state: 'LIVE',
        lastSequence: 0,
        events: [],
      });
    } finally {
      snapshotWait.cancel();
    }
    const refreshedDetail = await request(app.getHttpServer())
      .get(`/api/v1/games/${gameId}`)
      .set('x-v1-user-id', observerId)
      .expect(200);
    expect(refreshedDetail.body.data).toMatchObject({ state: 'LIVE', version: commandVersion! });
    expect(refreshedDetail.body.data.periods[0].startedAt).toEqual(expect.any(String));
  });
});
