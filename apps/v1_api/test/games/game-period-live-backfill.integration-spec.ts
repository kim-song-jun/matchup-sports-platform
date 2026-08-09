import { V1GameEventType, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { runGamePeriodLiveBackfill } from '../../src/games/migration/game-period-live-backfill';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * D-21 / Task 1의 blocker B7 — Task 1이 심는 PERIOD_NOT_STARTED 가드가 배포되는
 * 순간, 그 이전까지 V1Game.state='LIVE'였던 경기는 period가 전부 SCHEDULED로
 * 남아있어 이벤트를 영원히 못 받는다. 이 스위트는 production 백필 로직
 * (`runGamePeriodLiveBackfill`)을 실제로 호출해, 그게 이 상태를 고치는지와
 * idempotent한지를 증명한다.
 *
 * Fix round 1: 코디네이터 리뷰에서 발견 — 구코드에서는 `start`와 `pause` 둘 다
 * `V1GamePeriod`를 건드리지 않았다(`games.service.ts`의 `v1GamePeriod.update*` 호출
 * 지점 5곳 전수 확인: 629·636·693·697·1519 — `resume`은 그중 어디에도 없다). 그래서
 * "구코드에서 start → pause 한 경기"(`V1Game.state='PAUSED'`, period 전부 SCHEDULED)도
 * `state='LIVE'` 게임과 완전히 같은 문제를 가지는데, 백필의 첫 버전은 `state='LIVE'`만
 * 매칭해 이 케이스를 놓쳤다. 그 경기는 배포 후 `resume`을 눌러도(=`resume`도 T1-0
 * 이후 코드에서 period를 건드리지 않으므로) period가 계속 SCHEDULED로 남아 이벤트를
 * 영원히 못 받는다 — 아래 "PAUSED 경기" 테스트가 이 시나리오를 재현·검증한다.
 *
 * Fix round 2: 태스크 리뷰에서 발견 — 구코드의 콘솔은 LIVE 피리어드가 하나도 없으면
 * "번호가 가장 큰 피리어드"로 대체했다(T1-0 이전 `operate-console.tsx`). 즉 2피리어드
 * 종목에서는 배포 전 캡처된 이벤트가 전부 period=2로 남아있다. 백필의 첫 버전은
 * 무조건 period 1을 여는데, `assertEventReferences`의 **기존(T1-0이 건드리지 않은)**
 * `EVENT_LATE` 체크(`dto.period < maxRecordedPeriod`)가 이미 period=2로 기록된 게임에
 * period=1로 열린 채로 다음 이벤트를 보내면 그대로 걸린다 — 백필이 구제하려던 경기가
 * 여전히 기록 불가로 남는다. 백필이 이제 `MAX(그 게임의 v1_game_events.period)`
 * (이벤트가 없으면 1)를 열도록 고쳐 이 연속성을 지킨다 — 아래 "사전 이벤트가 있는 경기"
 * 테스트가 이 상호작용을 재현·검증한다(이전까지는 어떤 테스트도 백필 실행 전에 이벤트를
 * 하나도 만들지 않아 이 상호작용 자체가 검증되지 않았다).
 *
 * Fix round 4: 이 백필은 원래 `prisma/migrations/20260807000000_v1_period_live_backfill`의
 * `migration.sql` UPDATE 문이었다 — 이 스위트도 그 파일을 직접 읽어
 * `$executeRawUnsafe`로 돌렸다. `deploy-alpha.yml`의 expand-contract 게이트
 * (`scripts/qa/check-expand-contract-migrations.mjs`)가 새로 추가되는 마이그레이션의
 * 모든 SQL 문이 additive여야 한다고 강제하는데 UPDATE는 그 조건을 절대 만족할 수
 * 없어, 이 마이그레이션이 dev에 올라가는 순간 매 alpha 배포가 영구히 막힌다. Task
 * 10의 game-result-backfill.ts/.cli.ts가 이미 세운 것과 같은 분리를 따라 SQL 로직을
 * `game-period-live-backfill.ts`의 `runGamePeriodLiveBackfill()`로 옮겼다(스키마
 * 마이그레이션은 additive-only로 유지, 1회성 데이터 복구는 배포 후 CLI로 분리). 이
 * 스위트도 같은 이유로 마이그레이션 파일을 읽지 않고 그 함수를 직접 호출하도록
 * 다시 썼다 — 검증하는 SQL 술어 자체는 그대로다.
 */

const ids = {
  director: '67000000-0000-4000-8000-000000000001',
  sport: '67000000-0000-4000-8000-000000000010',
  region: '67000000-0000-4000-8000-000000000011',
  hostTeam: '67000000-0000-4000-8000-000000000020',
  opponentTeam: '67000000-0000-4000-8000-000000000021',
  tournament: '67000000-0000-4000-8000-000000000030',
  fixtureLiveEligible: '67000000-0000-4000-8000-000000000040',
  fixtureScheduled: '67000000-0000-4000-8000-000000000041',
  fixtureAlreadyLive: '67000000-0000-4000-8000-000000000042',
  fixturePausedEligible: '67000000-0000-4000-8000-000000000043',
  fixtureLiveWithPriorEvents: '67000000-0000-4000-8000-000000000044',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-t1-0-backfill.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function sourceContext(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return {
    actor,
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

describe('D-21 period-live backfill migration — one-time repair for games left mid-flight by the PERIOD_NOT_STARTED gate', () => {
  let configId: string;

  async function createGame(fixtureId: string): Promise<string> {
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: fixtureId,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'T1-0 Backfill Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'T1-0 Backfill Opponent' },
      ],
      participants: [],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.director,
      role: 'tournament_director',
      tournamentId: ids.tournament,
      fixtureId,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, sourceContext(actor, `t1-0-backfill-create-${fixtureId}`, input)),
    );
    return created.gameId;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the D-21 period-live-backfill integration suite');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    configId = config.id;

    await prisma.v1User.create({
      data: {
        id: ids.director,
        email: 't1-0-backfill-director@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football', name: 'T1-0 Backfill Football' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'T1_0_BACKFILL_REGION', name: 'T1-0 Backfill Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.director,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'T1-0 Backfill Host',
        },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.director,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'T1-0 Backfill Opponent',
        },
      ],
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'T1-0 backfill tournament',
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        { id: ids.fixtureLiveEligible, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: configId },
        { id: ids.fixtureScheduled, tournamentId: ids.tournament, round: 'group', fixtureNumber: 2, competitionConfigVersionId: configId },
        { id: ids.fixtureAlreadyLive, tournamentId: ids.tournament, round: 'group', fixtureNumber: 3, competitionConfigVersionId: configId },
        { id: ids.fixturePausedEligible, tournamentId: ids.tournament, round: 'group', fixtureNumber: 4, competitionConfigVersionId: configId },
        { id: ids.fixtureLiveWithPriorEvents, tournamentId: ids.tournament, round: 'group', fixtureNumber: 5, competitionConfigVersionId: configId },
      ],
    });
    await prisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: ids.tournament,
        userId: ids.director,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: ids.director,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 백필 테스트 1이 만든 게임을 테스트 2(idempotent)가 그대로 재사용한다. V1Game은
  // tournamentFixtureId가 unique라 같은 fixture로 createGame을 두 번 부르면 제약 위반이고,
  // 다른 게임을 새로 만들면 "이미 백필된 행을 덮어쓰지 않는가"라는 질문 자체를 검증하지
  // 못한다 — 반드시 같은 행이어야 한다.
  let backfilledGameId: string;

  it('배포 순간 LIVE였지만 period가 전부 SCHEDULED인 경기의 period 1을 LIVE로 백필한다', async () => {
    // 구코드가 `start`에서 V1GamePeriod를 건드리지 않던 시절의 상태를 그대로
    // 재현: V1Game.state만 LIVE로 raw 업데이트하고 period는 손대지 않는다.
    const gameId = await createGame(ids.fixtureLiveEligible);
    backfilledGameId = gameId;
    await prisma.v1Game.update({ where: { id: gameId }, data: { state: 'LIVE' } });

    const before = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(before.every((period) => period.state === 'SCHEDULED' && period.startedAt === null)).toBe(true);

    await runGamePeriodLiveBackfill(prisma, { dryRun: false });

    const after = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(after[0]).toEqual(expect.objectContaining({ number: 1, state: 'LIVE' }));
    expect(after[0].startedAt).not.toBeNull();
    expect(after[1]).toEqual(expect.objectContaining({ number: 2, state: 'SCHEDULED', startedAt: null }));
  });

  it('같은 SQL을 다시 실행해도 이미 백필된 period의 startedAt을 덮어쓰지 않는다 (idempotent)', async () => {
    // 위 테스트가 백필한 바로 그 게임을 재사용한다 — 새로 만들지 않는다.
    const gameId = backfilledGameId;
    // 이미 백필된 상태이므로 period 1의 startedAt을 먼저 고정해 둔다.
    const period1Before = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    expect(period1Before.state).toBe('LIVE');
    const startedAtBefore = period1Before.startedAt!.getTime();

    await runGamePeriodLiveBackfill(prisma, { dryRun: false });

    const period1After = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    expect(period1After.startedAt!.getTime()).toBe(startedAtBefore);
  });

  it('아직 시작 안 한 SCHEDULED 경기는 건드리지 않는다', async () => {
    const gameId = await createGame(ids.fixtureScheduled);

    await runGamePeriodLiveBackfill(prisma, { dryRun: false });

    const periods = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periods.every((period) => period.state === 'SCHEDULED' && period.startedAt === null)).toBe(true);
  });

  it('이미 정상적으로 시작된 LIVE 경기(period 1이 실제로 LIVE)는 startedAt을 리셋하지 않는다', async () => {
    const gameId = await createGame(ids.fixtureAlreadyLive);
    const realStartedAt = new Date('2026-08-01T09:00:00.000Z');
    await prisma.v1Game.update({ where: { id: gameId }, data: { state: 'LIVE' } });
    await prisma.v1GamePeriod.updateMany({
      where: { gameId, number: 1 },
      data: { state: 'LIVE', startedAt: realStartedAt },
    });

    await runGamePeriodLiveBackfill(prisma, { dryRun: false });

    const period1 = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    expect(period1.startedAt!.getTime()).toBe(realStartedAt.getTime());
  });

  it('배포 순간 PAUSED였지만 period가 전부 SCHEDULED인 경기(구코드의 start→pause)도 백필하고, resume 후 실제로 이벤트를 받을 수 있다', async () => {
    // 구코드 재현: start도 pause도 V1GamePeriod를 건드리지 않던 시절 — 게임을
    // PAUSED로 raw 업데이트하고 period는 손대지 않는다 (LIVE 케이스와 동일한
    // "period 전부 SCHEDULED" 상태이지만 V1Game.state가 다르다는 게 이 케이스의 핵심).
    const gameId = await createGame(ids.fixturePausedEligible);
    await prisma.v1Game.update({ where: { id: gameId }, data: { state: 'PAUSED' } });

    const before = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(before.every((period) => period.state === 'SCHEDULED' && period.startedAt === null)).toBe(true);

    await runGamePeriodLiveBackfill(prisma, { dryRun: false });

    const after = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(after[0]).toEqual(expect.objectContaining({ number: 1, state: 'LIVE' }));
    expect(after[0].startedAt).not.toBeNull();
    expect(after[1]).toEqual(expect.objectContaining({ number: 2, state: 'SCHEDULED', startedAt: null }));

    // 백필만으로 끝이 아니라, 실제 운영 흐름(resume → 이벤트 기록)이 다시 살아나는지까지
    // 증명한다 — resume 자체는(T1-0 이후에도) V1GamePeriod를 건드리지 않으므로, 이
    // 검증이 통과하는 건 순전히 백필이 미리 period 1을 LIVE로 되돌려 놨기 때문이다.
    const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
    const takeoverToken = (
      await service.requestTakeover(authUser(ids.director), gameId, {
        clientInstanceId: 't1-0-backfill-paused-client',
        lastSequence: 0,
      })
    ).takeoverToken;
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });

    await service.executeCommand(authUser(ids.director), gameId, 'resume', 't1-0-backfill-resume', {
      expectedVersion: game.version,
      clientCommandId: 't1-0-backfill-resume',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const resumed = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(resumed.state).toBe('LIVE');

    const appended = await service.appendEvent(authUser(ids.director), gameId, 't1-0-backfill-paused-event', {
      expectedVersion: resumed.version,
      clientEventId: 't1-0-backfill-paused-event',
      takeoverToken,
      type: V1GameEventType.CORRECTION,
      sideId: home.id,
      period: 1,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: { kind: 'NOTE', note: 't1-0 backfill regression check' },
    });
    expect(appended.sequence).toBe(1);
  });

  it('사전에 period=2로 기록된 이벤트가 있는 경기는 period 1이 아니라 period 2를 백필하고, 그 경기가 실제로 다음 이벤트를 받을 수 있다 (fix round 2 exit proof)', async () => {
    const gameId = await createGame(ids.fixtureLiveWithPriorEvents);
    await prisma.v1Game.update({ where: { id: gameId }, data: { state: 'LIVE' } });
    const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });

    // 구코드 재현: 배포 전 캡처된 이벤트는 (LIVE 피리어드가 하나도 없어 콘솔이
    // "번호가 가장 큰 피리어드"로 대체했으므로) 전부 period=2로 기록됐다. 이 행은
    // GamesService.appendEvent()가 아니라 raw insert로 만든다 — 지금 서비스는
    // (period 1이 아직 SCHEDULED이므로) 이 요청 자체를 PERIOD_NOT_STARTED로
    // 거부하기 때문에, "배포 전에 이미 DB에 존재하던 레거시 행"을 정확히 재현하려면
    // 서비스를 우회해야 한다.
    await prisma.v1GameEvent.create({
      data: {
        gameId,
        sequence: 1,
        clientEventId: 't1-0-backfill-historical-event',
        payloadHash: 'legacy-pre-deploy-event-hash',
        type: V1GameEventType.CORRECTION,
        sideId: home.id,
        period: 2,
        clockMs: 0, // 이 clockMs=0 자체가 T1-0이 고치는 그 버그다.
        occurredAt: new Date(),
        actorUserId: ids.director,
        payload: { kind: 'NOTE', note: 'legacy pre-deploy event, always recorded at the last period' },
      },
    });
    await prisma.v1Game.update({
      where: { id: gameId },
      data: { lastSequence: 1, version: { increment: 1 } },
    });

    const before = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(before.every((period) => period.state === 'SCHEDULED' && period.startedAt === null)).toBe(true);

    await runGamePeriodLiveBackfill(prisma, { dryRun: false });

    // Exit proof 1/2: period 1이 아니라 이미 기록된 period 2가 LIVE로 열려야 한다.
    // period 1을 열었다면 PERIOD_NOT_STARTED는 통과하겠지만, 그 아래 살아있는(T1-0이
    // 건드리지 않은) EVENT_LATE 체크가 "period 1 < 이미 기록된 maxRecordedPeriod 2"로
    // 다음 이벤트를 다시 막아 백필이 구제하려던 경기가 여전히 기록 불가로 남는다.
    const after = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(after[0]).toEqual(expect.objectContaining({ number: 1, state: 'SCHEDULED', startedAt: null }));
    expect(after[1]).toEqual(expect.objectContaining({ number: 2, state: 'LIVE' }));
    expect(after[1].startedAt).not.toBeNull();

    // Exit proof 2/2: period 상태만 확인하고 끝내지 않는다 — 실제 서비스 경로로 다음
    // 이벤트를 진짜로 기록할 수 있어야 한다(이게 "구제"의 실질적 의미다).
    const takeoverToken = (
      await service.requestTakeover(authUser(ids.director), gameId, {
        clientInstanceId: 't1-0-backfill-continuity-client',
        lastSequence: 1,
      })
    ).takeoverToken;
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });

    const appended = await service.appendEvent(authUser(ids.director), gameId, 't1-0-backfill-continuity-event', {
      expectedVersion: game.version,
      clientEventId: 't1-0-backfill-continuity-event',
      takeoverToken,
      type: V1GameEventType.CORRECTION,
      sideId: home.id,
      period: 2,
      clockMs: 5000,
      occurredAt: new Date().toISOString(),
      payload: { kind: 'NOTE', note: 't1-0 fix round 2 continuity check' },
    });
    expect(appended.sequence).toBe(2);
  });
});
