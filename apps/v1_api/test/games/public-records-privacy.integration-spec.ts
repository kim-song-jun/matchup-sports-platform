import { HttpException } from '@nestjs/common';
import { V1GameEventType, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { PublicTeamRecordsService } from '../../src/games/public-records/public-team-records.service';
import { PublicTournamentRecordsService } from '../../src/games/public-records/public-tournament-records.service';
import { PublicUserRecordsService } from '../../src/games/public-records/public-user-records.service';
import { isLineupPublished } from '../../src/games/public-records/public-visibility';

// Task 24 -- public-records privacy snapshot. Seeding mirrors Task 22's own
// suite (same shared V1Sport `football` code, same `football-v1` ACTIVE
// competition config), because this lane replays the exact same
// Game/Revision facts Task 22's commands and Task 9's async projection
// produce -- it never invents its own game lifecycle machinery.
const ids = {
  platformOps: '24000000-0000-4000-8000-000000000001',
  userConsented: '24000000-0000-4000-8000-000000000002',
  userRevoked: '24000000-0000-4000-8000-000000000003',
  sport: '24000000-0000-4000-8000-000000000010',
  region: '24000000-0000-4000-8000-000000000011',
  hostTeam: '24000000-0000-4000-8000-000000000020',
  awayTeam: '24000000-0000-4000-8000-000000000021',
  tournament: '24000000-0000-4000-8000-000000000030',
  hostRegistration: '24000000-0000-4000-8000-000000000040',
  awayRegistration: '24000000-0000-4000-8000-000000000041',
  fixtureHidden: '24000000-0000-4000-8000-000000000050',
  fixtureStatusOnly: '24000000-0000-4000-8000-000000000051',
  fixtureMain: '24000000-0000-4000-8000-000000000052',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const staffAccess = new TournamentStaffAccessService(prisma);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService());
// Issue #377 -- `getMatch` now takes a `TournamentStaffAccessService` (real
// instance, same one `resultReview` already uses against this same `prisma`)
// plus an optional caller identity. Every `getMatch(...)` call below
// deliberately passes `undefined` for that identity, never `authUser(ids.platformOps)`
// (already in scope and used elsewhere in this file) -- `ids.platformOps` is
// seeded as a real `v1AdminUser` (`adminRole: 'ops'`, see `beforeAll`), so
// passing it would silently flip `resolveStaffBypass` to the platform_ops
// admin bypass and make every masked-participant assertion below (revoked
// consent, unlinked guest) show a real name instead, invalidating this
// suite's actual purpose (consent gating) without any compile error to catch
// it. `undefined` reproduces the pre-#377 anonymous-only behavior exactly.
const tournamentRecords = new PublicTournamentRecordsService(prisma, staffAccess);
const teamRecords = new PublicTeamRecordsService(prisma);
const userRecords = new PublicUserRecordsService(prisma);

const authUser = (id: string) => ({
  id,
  email: `${id}@task24.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function sourceContext(payload: unknown, commandId: string): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

async function grantTakeover(gameId: string, seed: string): Promise<string> {
  const grant = await games.requestTakeover(authUser(ids.platformOps), gameId, {
    clientInstanceId: `task24-${seed}-client`,
    lastSequence: 0,
  });
  return grant.takeoverToken;
}

async function drainOutbox(): Promise<void> {
  const worker = new V1GameOperationsWorkerService(prisma);
  let guard = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await worker.processOne()) {
    guard += 1;
    if (guard > 50) throw new Error('Task 24 outbox drain guard exceeded');
  }
}

function previewHash(revision: { score: unknown; goalEvents: unknown; eventsHash: string; mvpParticipantId: string | null }): string {
  return canonicalGameCommandPayloadHash({
    score: revision.score,
    goalEvents: revision.goalEvents,
    eventsHash: revision.eventsHash,
    mvpParticipantId: revision.mvpParticipantId,
  });
}

async function buildGame(
  fixtureId: string,
  participants: ReadonlyArray<{ sourceParticipantId: string; sideKey: V1GameSideKey; displayNameSnapshot: string }>,
): Promise<string> {
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
    where: { name: 'football-v1', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
    sourceId: fixtureId,
    competitionConfigVersionId: config.id,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 24 Host' },
      { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Task 24 Away' },
    ],
    participants,
  };
  const created = await prisma.$transaction((tx) =>
    games.createFromSourceInTransaction(tx, input, sourceContext(input, `task24-source-${fixtureId}`)),
  );
  return created.gameId;
}

describe('Task 24 public tournament schedule/match and team/player record projections', () => {
  let gameHiddenId: string;
  let gameStatusOnlyId: string;
  let gameMainId: string;
  let homeSideId: string;
  let scorerConsentedId: string;
  let scorerRevokedId: string;
  let scorerGuestId: string;
  let officialRevisionId: string;
  let correctionOfficialId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 24 integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.userConsented, ids.userRevoked].map((id, index) => ({
        id,
        email: `task24-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1UserProfile.createMany({
      data: [
        { userId: ids.userConsented, nickname: 'Task24Consented' },
        { userId: ids.userRevoked, nickname: 'Task24Revoked' },
      ],
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Task 24 Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK24_REGION', name: 'Task 24 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 24 Host FC' },
        { id: ids.awayTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 24 Away FC' },
      ],
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Task 24 Cup',
        bracketPublishedAt: new Date(),
      },
    });
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        { id: ids.hostRegistration, tournamentId: ids.tournament, teamId: ids.hostTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
        { id: ids.awayRegistration, tournamentId: ids.tournament, teamId: ids.awayTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
      ],
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        {
          id: ids.fixtureHidden,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
          scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          homeRegistrationId: ids.hostRegistration,
          awayRegistrationId: ids.awayRegistration,
        },
        {
          id: ids.fixtureStatusOnly,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
          scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          homeRegistrationId: ids.hostRegistration,
          awayRegistrationId: ids.awayRegistration,
        },
        {
          id: ids.fixtureMain,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 3,
          // Well past scheduledAt-60m so D-02's fallback publishes the
          // lineup even though `V1GameVisibilityPolicy.lineupAt` itself is
          // never written by anything in this worktree yet (Task 14 gap;
          // see the report).
          scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          homeRegistrationId: ids.hostRegistration,
          awayRegistrationId: ids.awayRegistration,
          competitionConfigVersionId: config.id,
        },
      ],
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'PUBLIC_LIVE' },
      create: { key: 'PUBLIC_LIVE', value: 'on', ownerActor: 'platform_ops' },
      update: { value: 'on' },
    });

    // -- hidden --
    gameHiddenId = await buildGame(ids.fixtureHidden, [
      { sourceParticipantId: `hidden-home-${ids.fixtureHidden}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Hidden Home Player' },
    ]);
    await prisma.v1GameVisibilityPolicy.update({ where: { gameId: gameHiddenId }, data: { mode: 'HIDDEN' } });

    // -- status_only, driven straight to an OFFICIAL 1-0 --
    gameStatusOnlyId = await buildGame(ids.fixtureStatusOnly, [
      { sourceParticipantId: `status-home-${ids.fixtureStatusOnly}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Status Only Home Player' },
    ]);
    await prisma.v1GameVisibilityPolicy.update({ where: { gameId: gameStatusOnlyId }, data: { mode: 'STATUS_ONLY' } });
    await driveToOfficial(gameStatusOnlyId, []);

    // -- main: live -> official -> corrected, with consented/revoked/unlinked-guest scorers --
    // `sourceParticipantId` below is only an input-payload uniqueness key
    // (`assertGameSourceCreationInput`); `V1GameParticipant.id` is a fresh
    // server-generated uuid, so the real per-scorer ids are looked up by
    // `displayNameSnapshot` right after creation, not assumed equal to it.
    gameMainId = await buildGame(ids.fixtureMain, [
      { sourceParticipantId: `main-consented-${ids.fixtureMain}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Consented Scorer' },
      { sourceParticipantId: `main-revoked-${ids.fixtureMain}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Revoked Scorer' },
      { sourceParticipantId: `main-guest-${ids.fixtureMain}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Guest Scorer' },
    ]);
    const homeSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId: gameMainId, sideKey: V1GameSideKey.HOME } });
    homeSideId = homeSide.id;
    const consentedParticipant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { gameId: gameMainId, displayNameSnapshot: 'Consented Scorer' },
    });
    const revokedParticipant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { gameId: gameMainId, displayNameSnapshot: 'Revoked Scorer' },
    });
    const guestParticipant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { gameId: gameMainId, displayNameSnapshot: 'Guest Scorer' },
    });
    scorerConsentedId = consentedParticipant.id;
    scorerRevokedId = revokedParticipant.id;
    scorerGuestId = guestParticipant.id;

    // Two-party link + consent, seeded directly (Task 14's write-side flow
    // does not exist in this worktree yet -- see the report's gap note).
    // `V1ParticipantIdentityLinkCurrent`/`V1ParticipantConsentSnapshot`/
    // `V1UserRecordConsent` are exactly the three tables `public-consent.ts`
    // reads (2026-08-13 규칙 재정의), so seeding them directly still exercises
    // the real read-side join/gate.
    await prisma.v1ParticipantIdentityLinkCurrent.create({
      data: {
        participantId: consentedParticipant.id,
        linkId: `link-consented-${ids.fixtureMain}`,
        userId: ids.userConsented,
        version: 1,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    await prisma.v1ParticipantConsentSnapshot.create({
      data: {
        participantId: consentedParticipant.id,
        linkId: `link-consented-${ids.fixtureMain}`,
        consentVersion: 1,
        state: 'GRANTED',
        effectiveAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        policyHash: 'task24-policy-hash',
        actorUserId: ids.userConsented,
      },
    });
    // Linked, but consent was later revoked -- the latest snapshot for this
    // link is REVOKED, so the row must never appear publicly, including in
    // this same game (D-03/consent truth table: "all identity-linked career
    // rows, including pre-T3 rows, hide immediately").
    await prisma.v1ParticipantIdentityLinkCurrent.create({
      data: {
        participantId: revokedParticipant.id,
        linkId: `link-revoked-${ids.fixtureMain}`,
        userId: ids.userRevoked,
        version: 1,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    await prisma.v1ParticipantConsentSnapshot.createMany({
      data: [
        {
          participantId: revokedParticipant.id,
          linkId: `link-revoked-${ids.fixtureMain}`,
          consentVersion: 1,
          state: 'GRANTED',
          effectiveAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          policyHash: 'task24-policy-hash',
          actorUserId: ids.userRevoked,
        },
        {
          participantId: revokedParticipant.id,
          linkId: `link-revoked-${ids.fixtureMain}`,
          consentVersion: 2,
          state: 'REVOKED',
          effectiveAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          policyHash: 'task24-policy-hash',
          actorUserId: ids.userRevoked,
        },
      ],
    });
    // `scorerGuestId` gets no link/consent row at all -- the unlinked-guest case.

    // Task 24 규칙 재정의(2026-08-13): 공개 동의가 participant 단위 스냅샷이 아니라
    // 사용자 단위 `V1UserRecordConsent`로 옮겨갔다. 둘 다 GRANTED로 심어서 이 스위트가
    // 검증하려는 실제 계약(개별 participant의 REVOKED 스냅샷이 사용자 단위 GRANTED를
    // 덮어써서 숨긴다)이 새 모델에서도 그대로 성립하는지 증명한다.
    await prisma.v1UserRecordConsent.createMany({
      data: [
        { userId: ids.userConsented, state: 'GRANTED', policyHash: 'task24-policy-hash' },
        { userId: ids.userRevoked, state: 'GRANTED', policyHash: 'task24-policy-hash' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Drives SCHEDULED -> LIVE -> ENDED, appending one GOAL per given participant. */
  async function driveToLive(gameId: string, scorers: readonly string[]): Promise<void> {
    const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
    // GamesService.assertLineupsSubmittedForStart requires a SUBMITTED/LOCKED
    // lineup on every side before `start` is allowed. createFromSourceInTransaction
    // already creates a DRAFT revision-1 lineup per side at game creation, so
    // flip those straight to SUBMITTED (bypassing
    // GamesService.saveLineup/submitLineup, which would consume `version`).
    await prisma.v1GameLineup.updateMany({
      where: { gameId, revision: 1 },
      data: { state: 'SUBMITTED' },
    });
    let version = 0;
    const startToken = await grantTakeover(gameId, `start-${gameId}`);
    await games.executeCommand(authUser(ids.platformOps), gameId, 'start', `task24-start-${gameId}`, {
      expectedVersion: version,
      clientCommandId: `task24-start-${gameId}`,
      takeoverToken: startToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version += 1;
    for (const [index, participantId] of scorers.entries()) {
      const token = await grantTakeover(gameId, `goal-${gameId}-${index}`);
      await games.appendEvent(authUser(ids.platformOps), gameId, `task24-goal-${gameId}-${index}`, {
        expectedVersion: version,
        clientEventId: `task24-goal-${gameId}-${index}`,
        takeoverToken: token,
        type: V1GameEventType.GOAL,
        sideId: home.id,
        participantId,
        period: 1,
        clockMs: (index + 1) * 60_000,
        occurredAt: new Date().toISOString(),
        payload: {},
      });
      version += 1;
    }
  }

  async function endGame(gameId: string, expectedVersion: number): Promise<void> {
    const endToken = await grantTakeover(gameId, `end-${gameId}`);
    await games.executeCommand(authUser(ids.platformOps), gameId, 'end', `task24-end-${gameId}`, {
      expectedVersion,
      clientCommandId: `task24-end-${gameId}`,
      takeoverToken: endToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
  }

  /** Convenience for the simple single-goal games that go straight to OFFICIAL. */
  async function driveToOfficial(gameId: string, scorers: readonly string[]): Promise<void> {
    await driveToLive(gameId, scorers);
    await endGame(gameId, scorers.length + 1);
    await drainOutbox();
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });
    await resultReview.officializeResultRevision(authUser(ids.platformOps), gameId, submitted.id, `task24-officialize-${gameId}`, {
      expectedVersion: scorers.length + 2,
      clientCommandId: `task24-officialize-${gameId}`,
      projectionPreviewHash: previewHash(submitted),
    });
    await drainOutbox();
  }

  describe('pure D-02/D-06 helper contracts (no DB)', () => {
    it('D-02: keeps the lineup hidden before scheduledAt-60m and publishes it after, purely from scheduledAt', () => {
      const scheduledAt = new Date('2026-08-04T18:00:00.000Z');
      const before = new Date('2026-08-04T16:59:00.000Z'); // 61m before kickoff
      const after = new Date('2026-08-04T17:00:01.000Z'); // 59m59s before kickoff
      expect(isLineupPublished({ lineupAt: null, scheduledAt }, before)).toBe(false);
      expect(isLineupPublished({ lineupAt: null, scheduledAt }, after)).toBe(true);
    });

    it('D-02: an explicit lineupAt pin wins over the scheduledAt fallback even if the schedule later moves later', () => {
      const publishedAt = new Date('2026-08-04T10:00:00.000Z');
      const rescheduledLater = new Date('2026-08-05T18:00:00.000Z');
      expect(
        isLineupPublished({ lineupAt: publishedAt, scheduledAt: rescheduledLater }, new Date('2026-08-04T10:00:01.000Z')),
      ).toBe(true);
    });
  });

  it('hidden: never appears in the schedule and the match route 404s exactly like a nonexistent fixture', async () => {
    const schedule = await tournamentRecords.getSchedule(ids.tournament, {});
    expect(schedule.items.find((item) => item.fixtureId === ids.fixtureHidden)).toBeUndefined();

    const hidden = await captureFailure(() => tournamentRecords.getMatch(ids.tournament, ids.fixtureHidden, undefined));
    expectHttpCode(hidden, 404, 'TOURNAMENT_MATCH_NOT_FOUND');
    const nonexistent = await captureFailure(() => tournamentRecords.getMatch(ids.tournament, 'nonexistent-fixture', undefined));
    expectHttpCode(nonexistent, 404, 'TOURNAMENT_MATCH_NOT_FOUND');
  });

  it('status_only: schedule/match expose lifecycle and the official record but never the numeric score, lineup, or events', async () => {
    const schedule = await tournamentRecords.getSchedule(ids.tournament, {});
    const entry = schedule.items.find((item) => item.fixtureId === ids.fixtureStatusOnly);
    expect(entry).toBeDefined();
    expect(entry?.visibilityMode).toBe('status_only');
    expect(entry?.score).toBeNull();
    expect(entry?.resultState).toBe('official');

    const match = await tournamentRecords.getMatch(ids.tournament, ids.fixtureStatusOnly, undefined);
    expect(match.visibilityMode).toBe('status_only');
    expect(match.scoreStatus).toBe('official');
    expect(match.score).toBeNull();
    expect(match.lineup).toBeNull();
    expect(match.events).toEqual([]);
    expect(match.resultState).toBe('official');
  });

  it('live: while the game is in progress the match is pending with a pending-projection marker, and the published lineup names every participant regardless of consent (participant-name-public policy)', async () => {
    await driveToLive(gameMainId, [scorerConsentedId, scorerRevokedId, scorerGuestId]);

    const match = await tournamentRecords.getMatch(ids.tournament, ids.fixtureMain, undefined);
    expect(match.visibilityMode).toBe('live');
    expect(match.status).toBe('live');
    expect(match.resultState).toBe('pending');
    expect(match.pendingProjection).toBe(true);
    expect(match.scoreStatus).toBe('live');

    expect(match.lineup).not.toBeNull();
    const homeLineup = match.lineup?.home ?? [];
    expect(homeLineup).toHaveLength(3);
    const consentedEntry = homeLineup.find((entry) => entry.participantId === scorerConsentedId);
    const revokedEntry = homeLineup.find((entry) => entry.participantId === scorerRevokedId);
    const guestEntry = homeLineup.find((entry) => entry.participantId === scorerGuestId);
    // Policy change (2026-08-13): tournament participants are named regardless of
    // consent-link state, so the linked-but-revoked and unlinked-guest scorers are
    // no longer redacted here -- only `public-user-records.service.ts`'s own
    // consent gate (unaffected by this change, see the 'official' test below)
    // still hides them from their *personal* record pages.
    expect(consentedEntry?.displayName).toBe('Consented Scorer');
    expect(revokedEntry?.displayName).toBe('Revoked Scorer');
    expect(guestEntry?.displayName).toBe('Guest Scorer');
  });

  /**
   * [P1-d · D4] **공개 라인업은 등번호와 이름까지다.** 포지션·선발/후보·좌표는 팀이 짜
   * 넣은 전술 정보라 팀 전술보드 안에 머물고, 상대 팀과 관중에게는 나가지 않는다.
   *
   * 이 테스트가 없으면 회귀를 못 잡는다. 실제로 `position` 이 공개 응답으로 나가고 화면에
   * 그려지고 있었는데(match-detail-content.tsx), 어느 스펙도 그걸 보고 있지 않았다.
   * 파일 단위로 훑으면 놓친다 -- 같은 파일에 participants select 가 여러 개이고, 그중
   * 하나만 `position: true` 였다. **필드가 응답에 나가는지**를 직접 단언한다.
   */
  it('공개 라인업에는 포지션·선발여부·좌표가 실리지 않는다 (D4 — 등번호와 이름까지)', async () => {
    const match = await tournamentRecords.getMatch(ids.tournament, ids.fixtureMain, undefined);
    const entries = [...(match.lineup?.home ?? []), ...(match.lineup?.away ?? [])];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      // 있어야 하는 것
      expect(entry).toHaveProperty('displayName');
      expect(entry).toHaveProperty('jerseyNumber');
      // 나가면 안 되는 것
      expect(entry).not.toHaveProperty('position');
      expect(entry).not.toHaveProperty('started');
      expect(entry).not.toHaveProperty('positionX');
      expect(entry).not.toHaveProperty('positionY');
      expect(entry).not.toHaveProperty('goalkeeper');
    }
  });

  it('official: the current revision names every scorer in events/lineup regardless of consent (participant-name-public policy), while team goal counts and personal user records stay independent of any scorer\'s consent state', async () => {
    await endGame(gameMainId, 4);
    await drainOutbox();
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: gameMainId } });
    const officialized = await resultReview.officializeResultRevision(
      authUser(ids.platformOps),
      gameMainId,
      submitted.id,
      'task24-officialize-main',
      {
        expectedVersion: 5,
        clientCommandId: 'task24-officialize-main',
        projectionPreviewHash: previewHash(submitted),
      },
    );
    officialRevisionId = officialized.revisionId;
    await drainOutbox();

    const match = await tournamentRecords.getMatch(ids.tournament, ids.fixtureMain, undefined);
    expect(match.resultState).toBe('official');
    expect(match.pendingProjection).toBe(false);
    expect(match.score).toEqual({ home: 3, away: 0, penalties: null });

    const goalEvents = match.events.filter((event) => event.type === 'GOAL');
    expect(goalEvents).toHaveLength(3);
    // Policy change (2026-08-13): every home scorer is a tournament participant,
    // so all three are now named regardless of consent-link state -- not just
    // the consented one.
    const namedGoals = goalEvents.filter((event) => event.participantId !== null);
    expect(namedGoals).toHaveLength(3);
    expect(namedGoals.map((event) => event.participantId).sort()).toEqual(
      [scorerConsentedId, scorerRevokedId, scorerGuestId].sort(),
    );

    const teamRecord = await teamRecords.getRecords(ids.hostTeam, {});
    const teamItem = teamRecord.items.find((item) => item.gameId === gameMainId);
    expect(teamItem).toBeDefined();
    // Team aggregates count every goal regardless of any scorer's consent.
    expect(teamItem?.goalsFor).toBe(3);
    // No shootout on this fixture (regulation 3:0 decided it outright).
    expect(teamItem?.penalties).toBeNull();
    // Team records' event summary shares the exact same name-gating rule as
    // tournament records (participant-name-gating.ts) -- every home scorer is
    // named here too, and all three are 'own' since hostTeam is the home side.
    const teamGoalEvents = teamItem?.events.filter((event) => event.type === 'GOAL') ?? [];
    expect(teamGoalEvents).toHaveLength(3);
    expect(teamGoalEvents.every((event) => event.side === 'own')).toBe(true);
    expect(teamGoalEvents.every((event) => event.participantName !== null)).toBe(true);

    const consentedRecords = await userRecords.getRecords(ids.userConsented, {});
    const consentedItem = consentedRecords.items.find((item) => item.gameId === gameMainId);
    expect(consentedItem).toBeDefined();
    expect(consentedItem?.goals).toBe(1);
  });

  it('no-consent: a linked-but-revoked participant contributes to the team goal count but never to their own public user record', async () => {
    const revokedRecords = await userRecords.getRecords(ids.userRevoked, {});
    expect(revokedRecords.items.find((item) => item.gameId === gameMainId)).toBeUndefined();
    expect(revokedRecords.summary.appearances).toBe(0);
  });

  it('unlinked guest: never creates a `V1ParticipantIdentityLinkCurrent` row and so cannot surface under any user records page', async () => {
    const link = await prisma.v1ParticipantIdentityLinkCurrent.findUnique({
      where: { participantId: scorerGuestId },
    });
    expect(link).toBeNull();
  });

  it('corrected: officializing a correction moves both team and user records onto the new numbers only, never double-counting the superseded fact', async () => {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameMainId } });
    const correction = await resultReview.createResultCorrection(authUser(ids.platformOps), gameMainId, 'task24-correction', {
      expectedVersion: game.version,
      clientCommandId: 'task24-correction',
      baseRevisionId: officialRevisionId,
      reason: 'consented scorer actually scored twice',
      changes: {
        score: { home: 4, away: 0 },
        actualParticipants: [
          {
            participantId: scorerConsentedId,
            sideId: homeSideId,
            started: true,
            goals: 2,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
          {
            participantId: scorerRevokedId,
            sideId: homeSideId,
            started: true,
            goals: 1,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
          {
            participantId: scorerGuestId,
            sideId: homeSideId,
            started: true,
            goals: 1,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
        ],
        eventsHash: 'task24-correction-hash',
      },
    });

    const draft = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: correction.revisionId } });
    const officialized = await resultReview.officializeResultRevision(
      authUser(ids.platformOps),
      gameMainId,
      correction.revisionId,
      'task24-correction-officialize',
      {
        expectedVersion: game.version + 1,
        clientCommandId: 'task24-correction-officialize',
        projectionPreviewHash: previewHash(draft),
      },
    );
    correctionOfficialId = officialized.revisionId;
    await drainOutbox();

    const match = await tournamentRecords.getMatch(ids.tournament, ids.fixtureMain, undefined);
    expect(match.resultState).toBe('corrected');
    expect(match.score).toEqual({ home: 4, away: 0, penalties: null });
    expect(match.history.some((entry) => entry.isCorrection)).toBe(true);

    const teamRecord = await teamRecords.getRecords(ids.hostTeam, {});
    const teamItemsForGame = teamRecord.items.filter((item) => item.gameId === gameMainId);
    // Exactly one row for this game -- the stale pre-correction fact is
    // excluded by the `game.currentOfficialRevisionId` join, never
    // double-counted alongside the new one.
    expect(teamItemsForGame).toHaveLength(1);
    expect(teamItemsForGame[0]?.goalsFor).toBe(4);

    const consentedRecords = await userRecords.getRecords(ids.userConsented, {});
    const consentedItemsForGame = consentedRecords.items.filter((item) => item.gameId === gameMainId);
    expect(consentedItemsForGame).toHaveLength(1);
    expect(consentedItemsForGame[0]?.goals).toBe(2);

    // The revoked participant still never surfaces even under the new revision.
    const revokedRecords = await userRecords.getRecords(ids.userRevoked, {});
    expect(revokedRecords.items.find((item) => item.gameId === gameMainId)).toBeUndefined();
  });

  it('never exposes roster realName, only displayNameSnapshot-derived identity, anywhere in the public DTOs', async () => {
    const match = await tournamentRecords.getMatch(ids.tournament, ids.fixtureMain, undefined);
    const serialized = JSON.stringify(match);
    expect(serialized).not.toContain('realName');
    const schedule = await tournamentRecords.getSchedule(ids.tournament, {});
    expect(JSON.stringify(schedule)).not.toContain('realName');
  });
});
