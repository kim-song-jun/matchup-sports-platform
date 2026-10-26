import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType, V1TournamentStaffRole, type Prisma } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import { GameBroadcastRegistry } from '../../src/games/game-broadcast.registry';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentStaffService } from '../../src/tournaments/staff/tournament-staff.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const SESSION = randomUUID().slice(0, 8);
const timeoutMs = 5_000;

function eventOnce<T>(socket: Socket, event: string, waitTimeoutMs = timeoutMs): {
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
    timer = setTimeout(() => finish({ timeout: true }), waitTimeoutMs);
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
  let adminId: string;
  let observerId: string;
  let deniedReaderId: string;
  let revocableReaderId: string;
  let expiringReaderId: string;
  let raceReaderId: string;
  let awayTeamOwnerId: string;
  let gameId: string;
  let hostTeamId: string;
  let awayTeamId: string;
  let homeParticipantId: string;
  let homeSideId: string;
  let friendlyGameId: string;
  let tournamentId: string;
  let fixtureId: string;
  let liveSockets: Socket[] = [];
  const socketGameSubscriptions = new Map<Socket, Set<string>>();

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
    deniedReaderId = await makeUser('권한 없는 조회자', 5);
    revocableReaderId = await makeUser('회수 경합 조회자', 6);
    expiringReaderId = await makeUser('만료 경합 조회자', 7);
    raceReaderId = await makeUser('버전 경합 조회자', 8);
    adminId = await makeUser('관리자', 3);
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
    const homeSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME }, select: { id: true } });
    homeSideId = homeSide.id;
    const homeParticipant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { gameId, sideId: homeSideId },
      select: { id: true },
    });
    homeParticipantId = homeParticipant.id;

    const friendlyMatchId = randomUUID();
    await prisma.v1TeamMatch.create({
      data: {
        id: friendlyMatchId,
        hostTeamId,
        createdByUserId: operatorId,
        sportId,
        regionId,
        title: `Unscoped REST lifecycle ${SESSION}`,
        placeName: 'Integration pitch',
        startAt: new Date('2030-01-02T00:00:00.000Z'),
        approvedApplicantTeamId: awayTeamId,
        status: 'matched',
        competitionConfigVersionId: configId,
      },
    });
    const friendlyCreation: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: friendlyMatchId,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: hostTeamId, displayNameSnapshot: '친선 홈' },
        { sideKey: V1GameSideKey.AWAY, teamId: awayTeamId, displayNameSnapshot: '친선 원정' },
      ],
      participants: [
        { sourceParticipantId: `gcr-${SESSION}-friendly-home`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: '친선 홈 선수', jerseyNumber: 1 },
        { sourceParticipantId: `gcr-${SESSION}-friendly-away`, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: '친선 원정 선수', jerseyNumber: 1 },
      ],
    };
    const friendlyContext: GameCommandContext = {
      actor: { actorType: 'USER', actorUserId: adminId, role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: `gcr-friendly-create-${SESSION}`,
      payloadHash: canonicalGameCommandPayloadHash(friendlyCreation),
    };
    friendlyGameId = (await prisma.$transaction((tx: Prisma.TransactionClient) =>
      app.get(GamesService).createFromSourceInTransaction(tx, friendlyCreation, friendlyContext),
    )).gameId;
    await prisma.v1GameLineup.updateMany({ where: { gameId: friendlyGameId, revision: 1 }, data: { state: 'SUBMITTED' } });
  });

  afterAll(async () => {
    await disconnectLiveSockets();
    await cleanup?.();
  });

  afterEach(async () => {
    await disconnectLiveSockets();
  });

  async function disconnectLiveSockets(): Promise<void> {
    const sockets = liveSockets.splice(0);
    await Promise.all(sockets.map(async (socket) => {
      if (!socket.connected) return;
      for (const subscribedGameId of socketGameSubscriptions.get(socket) ?? []) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 1_000);
          socket.emit('game.unsubscribe', { gameId: subscribedGameId }, () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      socket.disconnect();
    }));
    socketGameSubscriptions.clear();
  }

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

  function subscribe(socket: Socket, targetGameId: string = gameId): Promise<{
    status: string;
    snapshot?: { gameId: string; version: number; state: string; lastSequence: number; events: unknown[] };
  }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for game.subscribe acknowledgement')), timeoutMs);
      socket.emit('game.subscribe', { gameId: targetGameId, afterSequence: 0 }, (result: {
        status: string;
        snapshot?: { gameId: string; version: number; state: string; lastSequence: number; events: unknown[] };
      }) => {
        clearTimeout(timer);
        if (result.status === 'subscribed') {
          const games = socketGameSubscriptions.get(socket) ?? new Set<string>();
          games.add(targetGameId);
          socketGameSubscriptions.set(socket, games);
        }
        resolve(result);
      });
    });
  }

  async function grantScopedReader(userId: string, expiresAt?: Date) {
    return app.get(TournamentStaffService, { strict: false }).grantStaff({
      actorUserId: adminId,
      tournamentId,
      targetUserId: userId,
      role: V1TournamentStaffRole.SUPPORT_READONLY,
      fixtureIds: [fixtureId],
      ...(expiresAt === undefined ? {} : { expiresAt }),
      audit: { requestId: randomUUID() },
    });
  }

  function holdActualEventRead(userId: string) {
    const gamesService = app.get(GamesService);
    const original = gamesService.listEvents.bind(gamesService);
    let release!: () => void;
    let markReached!: () => void;
    let armed = true;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reached = new Promise<void>((resolve) => { markReached = resolve; });
    const spy = jest.spyOn(gamesService, 'listEvents').mockImplementation(async (user, targetGameId, afterSequence) => {
      const actual = await original(user, targetGameId, afterSequence);
      if (armed && user.id === userId && targetGameId === gameId && afterSequence === 0) {
        armed = false;
        markReached();
        await gate;
      }
      return actual;
    });
    return { reached, release, restore: () => spy.mockRestore() };
  }

  function holdActualCurrentGameRead(userId: string) {
    const gamesService = app.get(GamesService);
    const originalListEvents = gamesService.listEvents.bind(gamesService);
    const originalFindUnique = prisma.v1Game.findUnique.bind(prisma.v1Game);
    let holdNextGameRead = false;
    let armed = true;
    let release!: () => void;
    let markReached!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reached = new Promise<void>((resolve) => { markReached = resolve; });
    const listSpy = jest.spyOn(gamesService, 'listEvents').mockImplementation(async (user, targetGameId, afterSequence) => {
      const actual = await originalListEvents(user, targetGameId, afterSequence);
      if (armed && user.id === userId && targetGameId === gameId && afterSequence === 0) {
        armed = false;
        holdNextGameRead = true;
      }
      return actual;
    });
    const gameSpy = jest.spyOn(prisma.v1Game, 'findUnique').mockImplementation(async (args) => {
      const actual = await originalFindUnique(args);
      if (holdNextGameRead && args.where.id === gameId) {
        holdNextGameRead = false;
        markReached();
        await gate;
      }
      return actual;
    });
    return { reached, release, restore: () => { listSpy.mockRestore(); gameSpy.mockRestore(); } };
  }

  function trackRefreshPromises() {
    const registry = app.get(GameBroadcastRegistry);
    const original = registry.refreshGameSubscribers.bind(registry);
    const promises: Promise<void>[] = [];
    const spy = jest.spyOn(registry, 'refreshGameSubscribers').mockImplementation((targetGameId) => {
      const promise = original(targetGameId);
      promises.push(promise);
      return promise;
    });
    return { promises, restore: () => spy.mockRestore() };
  }

  async function openOperatorConsole(suffix: string) {
    const assignment = await app.get(TournamentStaffAccessService).assertAccess({
      userId: operatorId,
      action: 'read',
      resource: { tournamentId, fixtureId },
    });
    const socket = connect(operatorId, suffix, assignment.assignmentVersion ?? 0);
    socket.connect();
    await connected(socket);
    await expect(subscribe(socket)).resolves.toMatchObject({ status: 'subscribed' });
    const clientInstanceId = `gcr-${SESSION}-${suffix}`;
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { lastSequence: true } });
    const takeover = await new Promise<{ status: string; takeoverToken?: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for operator takeover')), timeoutMs);
      socket.emit('game.takeover.request', {
        gameId,
        authorizationSubjectVersion: assignment.assignmentVersion ?? 0,
        clientInstanceId,
        lastSequence: game.lastSequence,
      }, (result: { status: string; takeoverToken?: string }) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
    if (takeover.status !== 'granted' || takeover.takeoverToken === undefined) {
      throw new Error('Operator takeover was not granted for the integration command');
    }
    return { socket, takeoverToken: takeover.takeoverToken };
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
    const operatorSecondConsole = connect(operatorId, 'operator-second-console', operatorAssignment.assignmentVersion ?? 0);
    const deniedReader = connect(deniedReaderId, 'denied-reader', 0);
    observer.connect();
    operator.connect();
    operatorSecondConsole.connect();
    deniedReader.connect();
    await Promise.all([connected(observer), connected(operator), connected(operatorSecondConsole), connected(deniedReader)]);

    const [observerSubscribe, operatorSubscribe, secondConsoleSubscribe] = await Promise.all([
      subscribe(observer), subscribe(operator), subscribe(operatorSecondConsole),
    ]);
    expect(observerSubscribe).toMatchObject({
      status: 'subscribed',
      snapshot: { gameId, version: 0, state: 'SCHEDULED', lastSequence: 0, events: [] },
    });
    expect(operatorSubscribe).toMatchObject({
      status: 'subscribed',
      snapshot: { gameId, version: 0, state: 'SCHEDULED', lastSequence: 0, events: [] },
    });
    expect(secondConsoleSubscribe).toMatchObject({ status: 'subscribed', snapshot: { gameId, version: 0 } });
    await expect(subscribe(deniedReader)).resolves.toMatchObject({ status: 'denied' });

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
    const startCommandId = `gcr-start-${SESSION}`;
    const startOccurredAt = new Date().toISOString();
    try {
      const command = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/start`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', startCommandId)
        .send({
          expectedVersion: before.body.data.version,
          clientCommandId: startCommandId,
          takeoverToken: takeover.takeoverToken,
          occurredAt: startOccurredAt,
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

    const goal = await request(app.getHttpServer())
      .post(`/api/v1/games/${gameId}/events`)
      .set('x-v1-user-id', operatorId)
      .set('Idempotency-Key', `gcr-goal-${SESSION}`)
      .send({
        expectedVersion: commandVersion,
        clientEventId: `gcr-goal-${SESSION}`,
        takeoverToken: takeover.takeoverToken,
        type: 'GOAL',
        sideId: homeSideId,
        participantId: homeParticipantId,
        period: 1,
        clockMs: 1_000,
        occurredAt: new Date().toISOString(),
        payload: {},
      })
      .expect(201);
    const pauseVersion = goal.body.data.version as number;
    const observerPauseSnapshot = eventOnce(observer, 'game.snapshot');
    const secondConsolePauseSnapshot = eventOnce(operatorSecondConsole, 'game.snapshot');
    const pause = await request(app.getHttpServer())
      .post(`/api/v1/games/${gameId}/commands/pause`)
      .set('x-v1-user-id', operatorId)
      .set('Idempotency-Key', `gcr-pause-${SESSION}`)
      .send({
        expectedVersion: pauseVersion,
        clientCommandId: `gcr-pause-${SESSION}`,
        takeoverToken: takeover.takeoverToken,
        occurredAt: new Date().toISOString(),
        payload: {},
      })
      .expect(201);
    const [observerPaused, secondConsolePaused] = await Promise.all([
      observerPauseSnapshot.promise,
      secondConsolePauseSnapshot.promise,
    ]);
    expect(observerPaused).toMatchObject({ event: {
      gameId, version: pause.body.data.version, state: 'PAUSED', lastSequence: 1,
      events: [expect.objectContaining({ type: 'GOAL', sequence: 1, participantId: homeParticipantId })],
    } });
    expect(secondConsolePaused).toMatchObject({ event: {
      gameId, version: pause.body.data.version, state: 'PAUSED', lastSequence: 1,
      events: [expect.objectContaining({ type: 'GOAL', sequence: 1, participantId: homeParticipantId })],
    } });
    const pausedDetail = await request(app.getHttpServer())
      .get(`/api/v1/games/${gameId}`)
      .set('x-v1-user-id', observerId)
      .expect(200);
    expect(pausedDetail.body.data).toMatchObject({ state: 'PAUSED', version: pause.body.data.version });
    expect(pausedDetail.body.data.periods[0].pausedAt).toEqual(expect.any(String));

    const replaySnapshots: unknown[] = [];
    const replaySnapshotListener = (snapshot: unknown) => replaySnapshots.push(snapshot);
    observer.on('game.snapshot', replaySnapshotListener);
    const replayRefreshes = trackRefreshPromises();
    try {
      const replay = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/start`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', startCommandId)
        .send({
          expectedVersion: before.body.data.version,
          clientCommandId: startCommandId,
          takeoverToken: takeover.takeoverToken,
          occurredAt: startOccurredAt,
          payload: {},
        })
        .expect(201);
      expect(replay.body.data.replayed).toBe(true);
      expect(replayRefreshes.promises).toHaveLength(0);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/pause`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-failed-command-${SESSION}`)
        .send({
          expectedVersion: pause.body.data.version - 1,
          clientCommandId: `gcr-failed-command-${SESSION}`,
          takeoverToken: takeover.takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(409);
      expect(replayRefreshes.promises).toHaveLength(0);
      expect(replaySnapshots).toEqual([]);
    } finally {
      replayRefreshes.restore();
      observer.off('game.snapshot', replaySnapshotListener);
    }
  });

  it('refreshes unscoped source owners in their room and excludes an authorized socket from another room', async () => {
    const server = app.getHttpServer();
    if (!server.listening) await app.listen(0, '127.0.0.1');
    const scopedObserverAssignment = await app.get(TournamentStaffAccessService).assertAccess({
      userId: observerId,
      action: 'read',
      resource: { tournamentId, fixtureId },
    });
    const hostOwner = connect(operatorId, 'friendly-host-owner', 0);
    const awayOwner = connect(awayTeamOwnerId, 'friendly-away-owner', 0);
    const scopedObserver = connect(observerId, 'scoped-observer-other-room', scopedObserverAssignment.assignmentVersion ?? 0);
    await Promise.all([hostOwner, awayOwner, scopedObserver].map(async (socket) => {
      socket.connect();
      await connected(socket);
    }));

    await expect(subscribe(hostOwner, friendlyGameId)).resolves.toMatchObject({ status: 'subscribed' });
    await expect(subscribe(awayOwner, friendlyGameId)).resolves.toMatchObject({ status: 'subscribed' });
    await expect(subscribe(scopedObserver, gameId)).resolves.toMatchObject({ status: 'subscribed' });
    await expect(subscribe(scopedObserver, friendlyGameId)).resolves.toMatchObject({ status: 'denied' });

    const hostSnapshot = eventOnce(hostOwner, 'game.snapshot');
    const awaySnapshot = eventOnce(awayOwner, 'game.snapshot');
    const otherRoomSnapshot = eventOnce(scopedObserver, 'game.snapshot');
    const command = await request(app.getHttpServer())
      .post(`/api/v1/games/${friendlyGameId}/commands/start`)
      .set('x-v1-user-id', operatorId)
      .set('Idempotency-Key', `gcr-friendly-start-${SESSION}`)
      .send({
        expectedVersion: 0,
        clientCommandId: `gcr-friendly-start-${SESSION}`,
        takeoverToken: `gcr-friendly-no-takeover-${SESSION}`,
        occurredAt: new Date().toISOString(),
        payload: {},
      })
      .expect(201);
    const [hostResult, awayResult] = await Promise.all([hostSnapshot.promise, awaySnapshot.promise]);
    expect(hostResult).toMatchObject({ event: {
      gameId: friendlyGameId,
      version: command.body.data.version,
      state: 'LIVE',
      lastSequence: 0,
      events: [],
    } });
    expect(awayResult).toMatchObject({ event: {
      gameId: friendlyGameId,
      version: command.body.data.version,
      state: 'LIVE',
      lastSequence: 0,
      events: [],
    } });
    const otherRoomResult = await Promise.race([
      otherRoomSnapshot.promise,
      new Promise<{ timeout: true }>((resolve) => setTimeout(() => resolve({ timeout: true }), 150)),
    ]);
    otherRoomSnapshot.cancel();
    expect(otherRoomResult).toEqual({ timeout: true });
  });

  it('does not refresh or rejoin a scoped reader revoked while the real event read is held', async () => {
    const assignment = await grantScopedReader(revocableReaderId);
    const reader = connect(revocableReaderId, 'revoked-during-refresh', assignment.version);
    reader.connect();
    await connected(reader);
    await expect(subscribe(reader)).resolves.toMatchObject({ status: 'subscribed' });
    const { socket: operator, takeoverToken } = await openOperatorConsole('revoke-race-operator');
    const currentGame = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } });
    const snapshots: unknown[] = [];
    const snapshotListener = (snapshot: unknown) => snapshots.push(snapshot);
    reader.on('game.snapshot', snapshotListener);
    const revokedEvent = eventOnce<{ gameId: string }>(reader, 'game.permission.revoked');
    const readGate = holdActualEventRead(revocableReaderId);
    const refreshes = trackRefreshPromises();
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/resume`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-revoke-race-${SESSION}`)
        .send({
          expectedVersion: currentGame.version,
          clientCommandId: `gcr-revoke-race-${SESSION}`,
          takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      await readGate.reached;
      expect(refreshes.promises).toHaveLength(1);

      await app.get(TournamentStaffService, { strict: false }).revokeStaff({
        actorUserId: adminId,
        tournamentId,
        assignmentId: assignment.id,
        expectedVersion: assignment.version,
        reason: 'integration revoke during snapshot refresh',
        audit: { requestId: randomUUID() },
      });
      await expect(revokedEvent.promise).resolves.toMatchObject({ event: { gameId } });
      readGate.release();
      await refreshes.promises[0];
      expect(snapshots).toEqual([]);
      await expect(subscribe(reader)).resolves.toMatchObject({ status: 'denied' });
      expect(snapshots).toEqual([]);
    } finally {
      readGate.release();
      readGate.restore();
      refreshes.restore();
      revokedEvent.cancel();
      reader.off('game.snapshot', snapshotListener);
      operator.disconnect();
    }
  });

  it('does not refresh or rejoin a scoped reader whose real assignment expires during the held event read', async () => {
    const assignment = await grantScopedReader(expiringReaderId);
    const reader = connect(expiringReaderId, 'expiry-during-refresh', assignment.version);
    reader.connect();
    await connected(reader);
    const { socket: operator, takeoverToken } = await openOperatorConsole('expiry-race-operator');
    const expiresAt = new Date(Date.now() + 6_000);
    await prisma.v1TournamentStaffAssignment.update({ where: { id: assignment.id }, data: { expiresAt } });
    await expect(subscribe(reader)).resolves.toMatchObject({ status: 'subscribed' });
    const currentGame = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } });
    const snapshots: unknown[] = [];
    const snapshotListener = (snapshot: unknown) => snapshots.push(snapshot);
    reader.on('game.snapshot', snapshotListener);
    const revokedEvent = eventOnce<{ gameId: string }>(reader, 'game.permission.revoked', 10_000);
    const readGate = holdActualEventRead(expiringReaderId);
    const refreshes = trackRefreshPromises();
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/pause`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-expiry-race-${SESSION}`)
        .send({
          expectedVersion: currentGame.version,
          clientCommandId: `gcr-expiry-race-${SESSION}`,
          takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      await readGate.reached;
      expect(refreshes.promises).toHaveLength(1);
      expect(Date.now()).toBeLessThan(expiresAt.getTime());
      await expect(revokedEvent.promise).resolves.toMatchObject({ event: { gameId } });
      expect(Date.now()).toBeGreaterThanOrEqual(expiresAt.getTime());
      readGate.release();
      await refreshes.promises[0];
      expect(snapshots).toEqual([]);
      await expect(subscribe(reader)).resolves.toMatchObject({ status: 'denied' });
      expect(snapshots).toEqual([]);
    } finally {
      readGate.release();
      readGate.restore();
      refreshes.restore();
      revokedEvent.cancel();
      reader.off('game.snapshot', snapshotListener);
      operator.disconnect();
    }
  });

  it('drops an older DB-read snapshot and prevents its old generation entering a re-subscribed room', async () => {
    const assignment = await grantScopedReader(raceReaderId);
    const reader = connect(raceReaderId, 'version-race-reader', assignment.version);
    reader.connect();
    await connected(reader);
    await expect(subscribe(reader)).resolves.toMatchObject({ status: 'subscribed' });
    const { socket: operator, takeoverToken } = await openOperatorConsole('version-race-operator');
    const currentGame = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } });
    const snapshots: Array<{ gameId: string; version: number; state: string }> = [];
    const snapshotListener = (snapshot: { gameId: string; version: number; state: string }) => snapshots.push(snapshot);
    reader.on('game.snapshot', snapshotListener);
    const readGate = holdActualCurrentGameRead(raceReaderId);
    let rejoinGate: ReturnType<typeof holdActualCurrentGameRead> | undefined;
    const refreshes = trackRefreshPromises();
    try {
      const firstCommand = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/resume`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-version-race-resume-${SESSION}`)
        .send({
          expectedVersion: currentGame.version,
          clientCommandId: `gcr-version-race-resume-${SESSION}`,
          takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      await readGate.reached;
      expect(refreshes.promises).toHaveLength(1);

      const higherSnapshot = eventOnce<{ gameId: string; version: number; state: string }>(reader, 'game.snapshot');
      const secondCommand = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/pause`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-version-race-pause-${SESSION}`)
        .send({
          expectedVersion: firstCommand.body.data.version,
          clientCommandId: `gcr-version-race-pause-${SESSION}`,
          takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      await expect(higherSnapshot.promise).resolves.toMatchObject({ event: {
        gameId,
        version: secondCommand.body.data.version,
        state: 'PAUSED',
      } });
      expect(secondCommand.body.data.version).toBeGreaterThan(firstCommand.body.data.version);
      expect(refreshes.promises).toHaveLength(2);
      await refreshes.promises[1];

      readGate.release();
      await refreshes.promises[0];
      expect(snapshots).toEqual([expect.objectContaining({
        gameId,
        version: secondCommand.body.data.version,
        state: 'PAUSED',
      })]);
      readGate.restore();

      const snapshotsBeforeThirdCommand = snapshots.length;
      rejoinGate = holdActualCurrentGameRead(raceReaderId);
      const thirdCommand = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/resume`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-version-race-rejoin-${SESSION}`)
        .send({
          expectedVersion: secondCommand.body.data.version,
          clientCommandId: `gcr-version-race-rejoin-${SESSION}`,
          takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      await rejoinGate.reached;
      expect(refreshes.promises).toHaveLength(3);

      const unsubscribe = await new Promise<{ status: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for game.unsubscribe acknowledgement')), timeoutMs);
        reader.emit('game.unsubscribe', { gameId }, (result: { status: string }) => {
          clearTimeout(timer);
          resolve(result);
        });
      });
      expect(unsubscribe).toMatchObject({ status: 'unsubscribed' });
      const resubscribed = await subscribe(reader);
      expect(resubscribed).toMatchObject({ status: 'subscribed', snapshot: {
        version: thirdCommand.body.data.version,
        state: 'LIVE',
      } });
      const snapshotsAfterNewGeneration = snapshots.length;

      rejoinGate.release();
      await refreshes.promises[2];
      expect(snapshots).toHaveLength(snapshotsAfterNewGeneration);
      expect(snapshots.slice(snapshotsBeforeThirdCommand).every(
        (snapshot) => snapshot.version >= thirdCommand.body.data.version,
      )).toBe(true);
    } finally {
      readGate.release();
      readGate.restore();
      rejoinGate?.release();
      rejoinGate?.restore();
      refreshes.restore();
      reader.off('game.snapshot', snapshotListener);
      operator.disconnect();
    }
  });

  it('refreshes resumed and end-period state with persisted period pause details', async () => {
    const assignment = await app.get(TournamentStaffAccessService).assertAccess({
      userId: observerId,
      action: 'read',
      resource: { tournamentId, fixtureId },
    });
    const reader = connect(observerId, 'period-transition-reader', assignment.assignmentVersion ?? 0);
    reader.connect();
    await connected(reader);
    await expect(subscribe(reader)).resolves.toMatchObject({ status: 'subscribed' });
    const { socket: operator, takeoverToken } = await openOperatorConsole('period-transition-operator');
    try {
      const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } });
      const pauseSnapshot = eventOnce<{ gameId: string; version: number; state: string }>(reader, 'game.snapshot');
      const pause = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/pause`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-period-pause-${SESSION}`)
        .send({
          expectedVersion: game.version,
          clientCommandId: `gcr-period-pause-${SESSION}`,
          takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      await expect(pauseSnapshot.promise).resolves.toMatchObject({ event: {
        gameId, version: pause.body.data.version, state: 'PAUSED',
      } });
      const pausedDetail = await request(app.getHttpServer())
        .get(`/api/v1/games/${gameId}`)
        .set('x-v1-user-id', observerId)
        .expect(200);
      expect(pausedDetail.body.data.periods[0]).toMatchObject({ state: 'LIVE', pausedAt: expect.any(String) });

      const resumeSnapshot = eventOnce<{ gameId: string; version: number; state: string }>(reader, 'game.snapshot');
      const resume = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/resume`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-period-resume-${SESSION}`)
        .send({
          expectedVersion: pause.body.data.version,
          clientCommandId: `gcr-period-resume-${SESSION}`,
          takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      await expect(resumeSnapshot.promise).resolves.toMatchObject({ event: {
        gameId, version: resume.body.data.version, state: 'LIVE',
      } });
      const resumedDetail = await request(app.getHttpServer())
        .get(`/api/v1/games/${gameId}`)
        .set('x-v1-user-id', observerId)
        .expect(200);
      expect(resumedDetail.body.data.periods[0]).toMatchObject({
        state: 'LIVE',
        pausedAt: null,
        pausedTotalMs: expect.any(Number),
      });
      expect(resumedDetail.body.data.periods[0].pausedTotalMs).toBeGreaterThanOrEqual(
        pausedDetail.body.data.periods[0].pausedTotalMs,
      );

      const endPeriodSnapshot = eventOnce<{ gameId: string; version: number; state: string }>(reader, 'game.snapshot');
      const endPeriod = await request(app.getHttpServer())
        .post(`/api/v1/games/${gameId}/commands/end-period`)
        .set('x-v1-user-id', operatorId)
        .set('Idempotency-Key', `gcr-period-end-${SESSION}`)
        .send({
          expectedVersion: resume.body.data.version,
          clientCommandId: `gcr-period-end-${SESSION}`,
          takeoverToken,
          occurredAt: new Date().toISOString(),
          payload: {},
        })
        .expect(201);
      await expect(endPeriodSnapshot.promise).resolves.toMatchObject({ event: {
        gameId, version: endPeriod.body.data.version, state: 'LIVE',
      } });
      const halftimeDetail = await request(app.getHttpServer())
        .get(`/api/v1/games/${gameId}`)
        .set('x-v1-user-id', observerId)
        .expect(200);
      expect(halftimeDetail.body.data.periods).toEqual(expect.arrayContaining([
        expect.objectContaining({ number: 1, state: 'ENDED', pausedAt: null, pausedTotalMs: expect.any(Number) }),
        expect.objectContaining({ number: 2, state: 'HALFTIME', startedAt: null }),
      ]));
    } finally {
      operator.disconnect();
    }
  });
});
