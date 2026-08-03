import { ConflictException, HttpException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import {
  V1EscalationStatus,
  V1GameSideKey,
  V1GameSourceType,
  V1TournamentStaffRole,
  type Prisma,
} from '@prisma/client';
import request = require('supertest');
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { V1AuthGuard } from '../../src/auth/v1-auth.guard';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import type { SaveGameLineupDto, SubmitGameLineupDto } from '../../src/games/dto/game-lineup.dto';
import { GamesService } from '../../src/games/games.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RealtimeGateway } from '../../src/realtime/realtime.gateway';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { DirectGameReadAuthorityService } from '../../src/tournament-operations/board/direct-game-read-authority.service';
import {
  GAME_READ_AUTHORITY,
  type GameReadAuthorityPort,
  type GameReadAuthorityResult,
} from '../../src/tournament-operations/board/game-read-authority.port';
import { TournamentOperationsBoardModule } from '../../src/tournament-operations/board/tournament-operations-board.module';
import { TournamentOperationsBoardService } from '../../src/tournament-operations/board/tournament-operations-board.service';
import type {
  AssignTournamentFixtureFieldDto,
  CreateTournamentFieldDto,
  UpdateTournamentFieldDto,
} from '../../src/tournament-operations/fields/dto/tournament-operations-field.dto';
import { TournamentOperationsFieldsService } from '../../src/tournament-operations/fields/tournament-operations-fields.service';
import { TournamentFixtureLineupService } from '../../src/tournament-operations/lineups/tournament-fixture-lineup.service';
import type { GrantTournamentStaffDto } from '../../src/tournament-operations/staff/dto/grant-tournament-staff.dto';
import type { RevokeTournamentStaffDto } from '../../src/tournament-operations/staff/dto/revoke-tournament-staff.dto';
import { TournamentOperationsStaffService } from '../../src/tournament-operations/staff/tournament-operations-staff.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentStaffGuard } from '../../src/tournaments/staff/tournament-staff.guard';
import { TournamentStaffService } from '../../src/tournaments/staff/tournament-staff.service';

const ids = {
  sport: '78000000-0000-4000-8000-000000000010',
  paginationTournament: '78000000-0000-4000-8000-000000000020',
  detailTournament: '78000000-0000-4000-8000-000000000021',
  field: '78000000-0000-4000-8000-000000000030',
  staffUser: '78000000-0000-4000-8000-000000000040',
  grantorUser: '78000000-0000-4000-8000-000000000041',
  liveFixture: '78000000-0000-4000-8000-000000000050',
  clearFixture: '78000000-0000-4000-8000-000000000051',
  overdueFixture: '78000000-0000-4000-8000-000000000052',
  boundaryFixture: '78000000-0000-4000-8000-000000000053',
  lineupSubmittedFixture: '78000000-0000-4000-8000-000000000054',
  lineupMissingFixture: '78000000-0000-4000-8000-000000000055',
  staffAssignment: '78000000-0000-4000-8000-000000000060',
  boundaryStaffAssignment: '78000000-0000-4000-8000-000000000061',
} as const;

const PAGINATION_FIXTURE_COUNT = 100;

const prisma = new PrismaService();

/** Mirrors scripts/qa/verify-game-result-cutover.mjs's normalized/hashBody so this spec proves
 * the same byte-identity guarantee the CI cutover harness depends on.
 *
 * Review finding #12.1 fix: a `Date` has no enumerable own keys, so the original version of this
 * function silently normalized every `Date` to `{}` -- two response bodies differing ONLY in
 * `scheduledAt` (a real `Date`, see tournament-operations-board.service.ts's `scheduledAt:
 * row.scheduledAt`) hashed IDENTICALLY even though their actual HTTP JSON bodies differ. `Date`
 * must be matched BEFORE the generic object branch (a `Date` also satisfies `typeof value ===
 * 'object'`) and serialized to its ISO string, the same representation `JSON.stringify` itself
 * would produce for a `Date` nested in a plain object. */
function normalized(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, normalized((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(normalized(body))).digest('hex');
}

/** The hash-stable body only -- `{items, nextCursor, watermark}` -- see
 * tournament-operations-board.service.ts's "Stable body vs. time-relative part" doc section. A
 * determinism/cutover oracle must compare exactly this slice, never the whole response (which
 * also carries `liveWarnings`, explicitly NOT part of the stable snapshot). */
function stableBodyOf({
  items,
  nextCursor,
  watermark,
}: {
  items: unknown;
  nextCursor: unknown;
  watermark: unknown;
}) {
  return { items, nextCursor, watermark };
}

type GameReadAuthorityResolveInput = Parameters<GameReadAuthorityPort['resolve']>[0];

/**
 * Review finding #12.2 fix: the original `StaticGameReadAuthority` fake completely ignored its
 * `resolve()` input and always returned whatever canned result it was constructed with -- a board
 * bug that called `resolve()` with the wrong `gameId`/`tournamentFixtureId`/expected
 * version/revision/score-hash (see game-read-authority.port.ts's finding #3 contract) could never
 * have failed a test built on that fake, because nothing ever inspected what was actually passed
 * in. This spy instead RECORDS every call verbatim (so a test can assert the board's real seam
 * input) and, optionally, runs a side effect from inside `resolve()` itself (used below to
 * simulate a write racing the board's post-resolution CAS recheck, review finding #3's
 * `GAME_RESULT_READ_STALE` path) before returning the caller-supplied outcome.
 */
class RecordingGameReadAuthority implements GameReadAuthorityPort {
  readonly calls: GameReadAuthorityResolveInput[] = [];
  constructor(
    private readonly result: GameReadAuthorityResult,
    private readonly onResolve?: () => Promise<void>,
  ) {}
  async resolve(input: GameReadAuthorityResolveInput): Promise<GameReadAuthorityResult> {
    this.calls.push(input);
    if (this.onResolve) await this.onResolve();
    return this.result;
  }
}

async function setGameReadFlag(value: 'legacy' | 'compare' | 'new'): Promise<void> {
  await prisma.v1GameOperationFlag.upsert({
    where: { key: 'GAME_READ' },
    create: { key: 'GAME_READ', value, ownerActor: 'platform_ops' },
    update: { value },
  });
}

/** Shared helpers for the staff/fields/lineups/incremental-update blocks below. */
async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpError(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('Task 18 tournament operations board snapshot/filter', () => {
  let configId: string;
  // Fixed instant the boundaryFixture/boundaryStaffAssignment deadlines are anchored to, so the
  // "stable body is a pure function of persisted state" test below can pick two `now` values on
  // opposite sides of both deadlines without depending on real wall-clock timing.
  let boundaryBase: number;
  // Review finding #17 fix: a `now` strictly BEFORE both boundaryFixture/boundaryStaffAssignment
  // deadlines, for every test in this describe block that inspects `liveWarnings` (or otherwise
  // cares about time-relative codes) but isn't itself testing the boundary straddle. Passing this
  // instead of relying on `board.list()`'s real-wall-clock default removes any dependency on how
  // long CI takes to reach these assertions relative to `beforeAll` -- the original defect (review
  // finding #17) was exactly this: a slow CI run could cross the 5-minute
  // `boundaryStaffAssignment.expiresAt` boundary between two calls and fail for a reason having
  // nothing to do with the behavior under test.
  let safeNow: Date;
  // overdueFixture's game/revision identity, hoisted out of beforeAll so the compare-mode tests
  // below can assert the exact `resolve()` input the board is contractually required to pass
  // (review finding #3's expectedGameVersion/expectedRevisionId/expectedScoreHash).
  let overdueGameId: string;
  let overdueRevisionId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 18 operations board spec');
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

    const sportId = (
      await prisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: ids.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;

    await prisma.v1User.createMany({
      data: [
        { id: ids.staffUser, email: 'task18-staff@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
        { id: ids.grantorUser, email: 'task18-grantor@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
      ],
    });

    await prisma.v1Tournament.createMany({
      data: [
        {
          id: ids.paginationTournament,
          sportId,
          title: 'Task 18 pagination tournament',
          competitionConfigVersionId: configId,
        },
        {
          id: ids.detailTournament,
          sportId,
          title: 'Task 18 detail tournament',
          competitionConfigVersionId: configId,
        },
      ],
    });

    await prisma.v1TournamentField.create({
      data: { id: ids.field, tournamentId: ids.detailTournament, scopeKey: 'main-court', name: 'Main court' },
    });

    // 100 plain fixtures (no game) so the deterministic-pagination test exercises the exact
    // scale the plan calls out ("100-fixture board snapshot").
    const paginationFixtures: Prisma.V1TournamentFixtureCreateManyInput[] = Array.from(
      { length: PAGINATION_FIXTURE_COUNT },
      (_, index) => ({
        id: randomUUID(),
        tournamentId: ids.paginationTournament,
        round: 'group',
        fixtureNumber: index + 1,
        competitionConfigVersionId: configId,
      }),
    );
    await prisma.v1TournamentFixture.createMany({ data: paginationFixtures });

    boundaryBase = Date.now();
    safeNow = new Date(boundaryBase - 1_000);
    // deadline (scheduledAt - 60m) lands exactly on boundaryBase.
    const boundaryScheduledAt = new Date(boundaryBase + 60 * 60 * 1000);

    // Detail fixtures for status/warning/GAME_READ seam coverage.
    await prisma.v1TournamentFixture.createMany({
      data: [
        {
          id: ids.liveFixture,
          tournamentId: ids.detailTournament,
          round: 'group',
          fixtureNumber: 1,
          fieldId: ids.field,
          competitionConfigVersionId: configId,
        },
        {
          id: ids.clearFixture,
          tournamentId: ids.detailTournament,
          round: 'group',
          fixtureNumber: 2,
          competitionConfigVersionId: configId,
        },
        {
          id: ids.overdueFixture,
          tournamentId: ids.detailTournament,
          round: 'group',
          fixtureNumber: 3,
          scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h ago -> well past the 60m lock window
          competitionConfigVersionId: configId,
        },
        {
          // No fieldId on purpose: its NO_STAFF_ASSIGNED coverage comes only from the
          // fixture-scoped boundaryStaffAssignment below, never from ids.field's permanent
          // (expiresAt: null) coverage, so the boundary test isn't accidentally masked.
          id: ids.boundaryFixture,
          tournamentId: ids.detailTournament,
          round: 'group',
          fixtureNumber: 4,
          scheduledAt: boundaryScheduledAt,
          competitionConfigVersionId: configId,
        },
        // Regression pair for the Copilot C1 finding (latestLineupStateBySide() previously keyed
        // its map by the V1GameLineup.sideId UUID while isLineupOverdue() looked up the literal
        // 'HOME'/'AWAY' V1GameSideKey strings -- the lookup could never hit, so LINEUP_NOT_SUBMITTED
        // fired unconditionally past the deadline regardless of whether lineups were submitted).
        // Both fixtures share the same 3h-in-the-past scheduledAt (well past the 60m lock window)
        // so the ONLY variable between them is whether a lineup was actually submitted. Both are
        // assigned ids.field (permanent, expiresAt:null staff coverage from ids.staffAssignment) so
        // NO_FIELD_ASSIGNED/NO_STAFF_ASSIGNED never fire here and don't disturb the exact-match
        // `?warning=NO_STAFF_ASSIGNED` assertion below, which is scoped to clearFixture/overdueFixture.
        {
          id: ids.lineupSubmittedFixture,
          tournamentId: ids.detailTournament,
          round: 'group',
          fixtureNumber: 5,
          fieldId: ids.field,
          scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          competitionConfigVersionId: configId,
        },
        {
          id: ids.lineupMissingFixture,
          tournamentId: ids.detailTournament,
          round: 'group',
          fixtureNumber: 6,
          fieldId: ids.field,
          scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          competitionConfigVersionId: configId,
        },
      ],
    });

    const liveGame = await prisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: ids.liveFixture,
        state: 'LIVE',
        competitionConfigVersionId: configId,
      },
    });
    const overdueGame = await prisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: ids.overdueFixture,
        state: 'ENDED',
        competitionConfigVersionId: configId,
      },
    });
    overdueGameId = overdueGame.id;

    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: overdueGame.id,
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 1, away: 0 },
        eventsHash: 'task18-overdue-events-hash',
        missingScorer: true,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'TASK18_TEST_SEED',
        submittedAt: new Date(),
        officialAt: new Date(),
      },
    });
    overdueRevisionId = revision.id;
    await prisma.v1Game.update({
      where: { id: overdueGame.id },
      data: { currentOfficialRevisionId: revision.id },
    });
    await prisma.v1ResultEscalation.create({
      data: {
        resultRevisionId: revision.id,
        kind: 'ESCALATION',
        dueAt: new Date(),
        status: V1EscalationStatus.PENDING,
      },
    });

    // liveGame has no lineups at all -> both sides default to "missing" -> LINEUP_NOT_SUBMITTED.
    void liveGame;

    // lineupSubmittedFixture: both V1GameSide rows have a latest SUBMITTED lineup ->
    // LINEUP_NOT_SUBMITTED must be ABSENT despite the deadline having passed. This is the
    // assertion that would have failed against the pre-fix sideId-keyed map (which could never
    // resolve to a HOME/AWAY hit and so always reported the warning as if lineups were missing).
    const lineupSubmittedGame = await prisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: ids.lineupSubmittedFixture,
        state: 'SCHEDULED',
        competitionConfigVersionId: configId,
      },
    });
    const submittedHomeSide = await prisma.v1GameSide.create({
      data: { gameId: lineupSubmittedGame.id, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home' },
    });
    const submittedAwaySide = await prisma.v1GameSide.create({
      data: { gameId: lineupSubmittedGame.id, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away' },
    });
    await prisma.v1GameLineup.createMany({
      data: [
        { gameId: lineupSubmittedGame.id, sideId: submittedHomeSide.id, revision: 1, state: 'SUBMITTED' },
        { gameId: lineupSubmittedGame.id, sideId: submittedAwaySide.id, revision: 1, state: 'SUBMITTED' },
      ],
    });

    // lineupMissingFixture: same deadline, but no V1GameSide/V1GameLineup rows at all ->
    // LINEUP_NOT_SUBMITTED must still be PRESENT (the "missing lineup" direction).
    await prisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: ids.lineupMissingFixture,
        state: 'SCHEDULED',
        competitionConfigVersionId: configId,
      },
    });

    // No lineups either -> LINEUP_NOT_SUBMITTED flips purely on `now` vs its scheduledAt-60m
    // deadline (boundaryBase), independent of any DB write.
    await prisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: ids.boundaryFixture,
        state: 'SCHEDULED',
        competitionConfigVersionId: configId,
      },
    });

    await prisma.v1TournamentStaffAssignment.create({
      data: {
        id: ids.staffAssignment,
        tournamentId: ids.detailTournament,
        userId: ids.staffUser,
        role: 'FIELD_OPERATOR',
        fieldId: ids.field,
        grantedByUserId: ids.grantorUser,
      },
    });

    // Fixture-scoped (not field-scoped) coverage for boundaryFixture, with expiresAt 5 minutes
    // after boundaryBase -- covered while `now <= expiresAt`, uncovered once `now` passes it. This
    // is a second, independent clock boundary from the lineup deadline above (same anchor instant,
    // different offset) so the new determinism test exercises both time-relative codes.
    await prisma.$transaction(async (tx) => {
      const boundaryAssignment = await tx.v1TournamentStaffAssignment.create({
        data: {
          id: ids.boundaryStaffAssignment,
          tournamentId: ids.detailTournament,
          userId: ids.staffUser,
          role: 'FIELD_OPERATOR',
          expiresAt: new Date(boundaryBase + 5 * 60 * 1000),
          grantedByUserId: ids.grantorUser,
        },
      });
      await tx.v1TournamentStaffFixtureScope.create({
        data: { assignmentId: boundaryAssignment.id, fixtureId: ids.boundaryFixture },
      });
    });

    await setGameReadFlag('legacy');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('hashBody hashes a Date by its content, not by erasing it (regression for review finding #12.1)', () => {
    // Before the fix, `normalized()` treated every `Date` as a plain object with no enumerable
    // own keys and reduced it to `{}` -- two bodies differing ONLY in a `Date` field (exactly the
    // shape of `items[].scheduledAt` in the real response) hashed identically even though their
    // real HTTP JSON bodies (where `Date` serializes to an ISO string) would differ.
    const earlier = { scheduledAt: new Date('2026-01-01T00:00:00.000Z'), other: 'unchanged' };
    const later = { scheduledAt: new Date('2026-01-02T00:00:00.000Z'), other: 'unchanged' };
    expect(hashBody(earlier)).not.toBe(hashBody(later));

    // Sanity check the positive direction too: two logically-identical Dates (same instant, new
    // object identity) must still hash the same.
    const earlierAgain = { scheduledAt: new Date('2026-01-01T00:00:00.000Z'), other: 'unchanged' };
    expect(hashBody(earlier)).toBe(hashBody(earlierAgain));

    // A `Date` nested inside an array must be normalized the same way (array branch recurses
    // through `normalized`, not through the object branch).
    expect(hashBody([new Date('2026-01-01T00:00:00.000Z')])).not.toBe(
      hashBody([new Date('2026-01-02T00:00:00.000Z')]),
    );
  });

  it('walks 100 fixtures across cursor pages with no duplicate/loss and a null terminal cursor', async () => {
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());
    const seen = new Set<string>();
    let cursor: string | undefined;
    let safety = 0;
    for (;;) {
      const page = await board.list(ids.paginationTournament, { cursor, limit: 20 });
      for (const item of page.items) {
        expect(seen.has(item.fixtureId)).toBe(false);
        seen.add(item.fixtureId);
      }
      safety += 1;
      expect(safety).toBeLessThan(20);
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(PAGINATION_FIXTURE_COUNT);
  });

  it('filters status against V1Game.state, not the dead V1TournamentFixture.status column', async () => {
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());
    const page = await board.list(ids.detailTournament, { status: 'LIVE', limit: 50 });
    const fixtureIds = page.items.map((item) => item.fixtureId);
    expect(fixtureIds).toContain(ids.liveFixture);
    expect(fixtureIds).not.toContain(ids.clearFixture);
    expect(fixtureIds).not.toContain(ids.overdueFixture);
  });

  it('keys the lineup lookup by (gameId, sideKey) not (gameId, sideId): a fully-submitted lineup clears LINEUP_NOT_SUBMITTED past the deadline, while a missing lineup still raises it (regression for the Copilot C1 finding)', async () => {
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());
    const page = await board.list(ids.detailTournament, { limit: 50 }, safeNow);
    const liveByFixture = new Map(page.liveWarnings.map((entry) => [entry.fixtureId, entry]));

    // Both sides SUBMITTED, deadline (scheduledAt - 60m) already passed -> must be ABSENT. Pre-fix,
    // latestLineupStateBySide() keyed its map by the raw V1GameLineup.sideId UUID while
    // isLineupOverdue() looked up the literal 'HOME'/'AWAY' V1GameSideKey strings, so this lookup
    // could never hit and the code fired unconditionally regardless of submission state -- this
    // assertion is the one that would have failed against that bug.
    expect(liveByFixture.get(ids.lineupSubmittedFixture)?.warnings ?? []).not.toContain(
      'LINEUP_NOT_SUBMITTED',
    );

    // Same deadline, but no lineup rows at all -> must be PRESENT.
    expect(liveByFixture.get(ids.lineupMissingFixture)?.warnings).toContain('LINEUP_NOT_SUBMITTED');
  });

  it('returns a clean empty page (never a 500) when the cursor value does not match any existing fixture row', async () => {
    // Copilot C2 claimed `cursor` needed @IsUUID() validation because a non-UUID value could
    // surface as an internal error. Verified false: `ListTournamentOperationsQueryDto.cursor` is a
    // deliberately opaque cursor token (same @IsString()-only contract as 15+ other cursor-paginated
    // DTOs in this repo, see docs/api/global-contract.md's "opaque cursor" contract), and
    // `V1TournamentFixture.id` is a Postgres `text` column (no @db.Uuid), so an arbitrary string
    // cannot trigger a type-cast error the way it would against a real `uuid` column. Prisma's
    // keyset-cursor SQL simply finds no anchor row for a non-existent id and the tuple comparison
    // yields an empty result set -- this test proves that directly rather than trusting the claim.
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());
    const page = await board.list(ids.paginationTournament, {
      cursor: 'not-a-real-fixture-id-and-not-a-uuid-either',
      limit: 20,
    });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('rejects a cursor whose row exists but belongs to a DIFFERENT tournament with 400 OPERATIONS_BOARD_CURSOR_TOURNAMENT_MISMATCH, instead of silently anchoring the page on a foreign row\'s sort position (review finding #7)', async () => {
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());
    // ids.liveFixture is a real, existing row -- but it belongs to ids.detailTournament, not
    // ids.paginationTournament. Pre-fix, `where: { tournamentId }` combined with this foreign
    // row's `(round, fixtureNumber, id)` tuple as the keyset anchor with no validation at all; the
    // fix resolves the cursor's owning tournamentId first and rejects a mismatch before running
    // the page query at all.
    const caught = await captureFailure(() =>
      board.list(ids.paginationTournament, { cursor: ids.liveFixture, limit: 20 }),
    );
    expectHttpError(caught, 400, 'OPERATIONS_BOARD_CURSOR_TOURNAMENT_MISMATCH');

    // Sanity-check this is a genuine cross-tournament MISMATCH check, not an over-eager guard
    // that rejects every cursor: the SAME fixture id used as its own tournament's cursor (where
    // the resolved tournamentId legitimately equals the tournamentId being queried) must succeed
    // normally, never throwing.
    await expect(board.list(ids.detailTournament, { cursor: ids.liveFixture, limit: 50 })).resolves.toEqual(
      expect.objectContaining({ nextCursor: null }),
    );
  });

  it('surfaces the full warning set per fixture (split stable items.warnings / time-relative liveWarnings), lets ?warning= narrow items by a STABLE code, and REJECTS ?warning= for a time-relative code instead of filtering by it (review finding #2)', async () => {
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());
    const full = await board.list(ids.detailTournament, { limit: 50 }, safeNow);
    const byFixture = new Map(full.items.map((item) => [item.fixtureId, item]));
    const byFixtureLive = new Map(full.liveWarnings.map((entry) => [entry.fixtureId, entry]));

    // liveFixture: has a field + permanent (expiresAt: null) staff coverage, no scheduledAt (so
    // LINEUP_NOT_SUBMITTED can never fire) -> stable warnings empty, liveWarnings empty too.
    const live = byFixture.get(ids.liveFixture);
    expect(live?.warnings).toEqual([]);
    expect(byFixtureLive.get(ids.liveFixture)?.warnings).toEqual([]);

    // clearFixture: no field, no game -> stable NO_FIELD_ASSIGNED only; time-relative
    // NO_STAFF_ASSIGNED (never covered) but no LINEUP_NOT_SUBMITTED (no scheduledAt/game at all).
    const clear = byFixture.get(ids.clearFixture);
    expect(clear?.warnings.sort()).toEqual(['NO_FIELD_ASSIGNED']);
    expect(byFixtureLive.get(ids.clearFixture)?.warnings.sort()).toEqual(['NO_STAFF_ASSIGNED']);

    // overdueFixture: no field assigned, scheduledAt 3h in the past (well past the 60m lock
    // window) with no lineups, an official revision with missingScorer=true, and an open
    // ESCALATION -> every stable code fires, plus both time-relative codes.
    const overdue = byFixture.get(ids.overdueFixture);
    expect(overdue?.warnings.sort()).toEqual(['MISSING_SCORER', 'NO_FIELD_ASSIGNED', 'RESULT_REVIEW_OVERDUE'].sort());
    expect(byFixtureLive.get(ids.overdueFixture)?.warnings.sort()).toEqual(
      ['LINEUP_NOT_SUBMITTED', 'NO_STAFF_ASSIGNED'].sort(),
    );

    // No time-relative code ever leaks into the stable `warnings` array on any fixture.
    for (const item of full.items) {
      expect(item.warnings).not.toContain('NO_STAFF_ASSIGNED');
      expect(item.warnings).not.toContain('LINEUP_NOT_SUBMITTED');
    }

    const missingScorerOnly = await board.list(
      ids.detailTournament,
      { limit: 50, warning: 'MISSING_SCORER' },
      safeNow,
    );
    expect(missingScorerOnly.items.map((item) => item.fixtureId)).toEqual([ids.overdueFixture]);

    // P0 fix, review finding #2: `?warning=` REJECTS a time-relative code instead of filtering
    // `items`/`liveWarnings` by it. The filter runs BEFORE `items` is built, so a time-relative
    // filter used to change `items` MEMBERSHIP as a pure function of `now` -- two identical,
    // unchanged databases queried on either side of a `NO_STAFF_ASSIGNED`/`LINEUP_NOT_SUBMITTED`
    // deadline could return DIFFERENT `items`, re-contaminating the very "hash-stable body"
    // guarantee `{items, nextCursor, watermark}` exists to provide. Both time-relative codes are
    // exercised so neither is silently still accepted as a filter value.
    const noStaffFilterAttempt = await captureFailure(() =>
      board.list(ids.detailTournament, { limit: 50, warning: 'NO_STAFF_ASSIGNED' }, safeNow),
    );
    expectHttpError(noStaffFilterAttempt, 400, 'OPERATIONS_BOARD_WARNING_FILTER_NOT_STABLE');

    const lineupFilterAttempt = await captureFailure(() =>
      board.list(ids.detailTournament, { limit: 50, warning: 'LINEUP_NOT_SUBMITTED' }, safeNow),
    );
    expectHttpError(lineupFilterAttempt, 400, 'OPERATIONS_BOARD_WARNING_FILTER_NOT_STABLE');

    // A client that wants a live-warning-aware view must fetch the (always time-independent) full
    // page and filter client-side using the separate `liveWarnings` array -- prove that path still
    // works: the fixtures carrying NO_STAFF_ASSIGNED in the unfiltered `full` response above are
    // exactly clearFixture/overdueFixture, and their `items[].warnings` never contains it.
    const noStaffFixtureIds = full.liveWarnings
      .filter((entry) => entry.warnings.includes('NO_STAFF_ASSIGNED'))
      .map((entry) => entry.fixtureId)
      .sort();
    expect(noStaffFixtureIds).toEqual([ids.clearFixture, ids.overdueFixture].sort());
    for (const item of full.items) {
      expect(item.warnings).not.toContain('NO_STAFF_ASSIGNED');
    }
  });

  it('proves the stable body {items, nextCursor, watermark} is a pure function of persisted state, invariant under `now` alone, while liveWarnings may legitimately differ across a clock boundary', async () => {
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());

    // Both injected `now` values straddle TWO independent time-relative boundaries anchored to
    // the same boundaryBase instant (see beforeAll): the LINEUP_NOT_SUBMITTED deadline
    // (scheduledAt - 60m == boundaryBase) and the boundaryStaffAssignment's expiresAt
    // (boundaryBase + 5m). Zero DB writes happen between the two `list()` calls below.
    const nowBeforeBothDeadlines = new Date(boundaryBase - 1_000); // 1s before either deadline
    const nowAfterBothDeadlines = new Date(boundaryBase + 11 * 60 * 1000); // 11m after boundaryBase
    expect(nowAfterBothDeadlines.getTime() - nowBeforeBothDeadlines.getTime()).toBeGreaterThan(10 * 60 * 1000);

    const before = await board.list(ids.detailTournament, { limit: 50 }, nowBeforeBothDeadlines);
    const after = await board.list(ids.detailTournament, { limit: 50 }, nowAfterBothDeadlines);

    expect(hashBody(stableBodyOf(after))).toBe(hashBody(stableBodyOf(before)));
    // Extra explicit check beyond the hash: no item anywhere gained/lost a stable warning either.
    expect(after.items).toEqual(before.items);

    // liveWarnings for boundaryFixture legitimately flips on both codes across the boundary.
    const liveBefore = before.liveWarnings.find((entry) => entry.fixtureId === ids.boundaryFixture);
    const liveAfter = after.liveWarnings.find((entry) => entry.fixtureId === ids.boundaryFixture);
    expect(liveBefore?.warnings.sort()).toEqual([]);
    expect(liveAfter?.warnings.sort()).toEqual(['LINEUP_NOT_SUBMITTED', 'NO_STAFF_ASSIGNED'].sort());
    expect(hashBody(before.liveWarnings)).not.toBe(hashBody(after.liveWarnings));
  });

  it('keeps the hash-stable body {items,nextCursor,watermark} byte-identical across GAME_READ legacy/compare/new, calling the compare-mode authority exactly once with the exact revision/score it is about to serve and zero times under legacy/new (regression for review findings #12.2/#12.3: the old fake ignored its input and the equality-only assertion could not prove the authority was even being exercised correctly)', async () => {
    const authority = new RecordingGameReadAuthority({ outcome: 'ok' });
    const okBoard = new TournamentOperationsBoardService(prisma, authority);

    await setGameReadFlag('legacy');
    const legacy = await okBoard.list(ids.detailTournament, { limit: 50 }, safeNow);
    expect(authority.calls).toHaveLength(0); // legacy must never call the authority

    await setGameReadFlag('compare');
    const compare = await okBoard.list(ids.detailTournament, { limit: 50 }, safeNow);
    // Exactly one fixture on this page (overdueFixture) has a current/official result -- the
    // authority must be called exactly once, bound to THAT row's exact expected identity/value.
    // Before the fix, a board bug that called resolve() with a wrong gameId/tournamentFixtureId/
    // expectedGameVersion/expectedRevisionId/expectedScoreHash would have passed this test anyway,
    // because the fake ignored whatever it was given.
    const expectedScoreHash = createHash('sha256')
      .update(JSON.stringify({ home: 1, away: 0 }))
      .digest('hex');
    expect(authority.calls).toEqual([
      {
        gameId: overdueGameId,
        tournamentFixtureId: ids.overdueFixture,
        expectedGameVersion: 0,
        expectedRevisionId: overdueRevisionId,
        expectedScoreHash,
      },
    ]);

    await setGameReadFlag('new');
    const rolled = await okBoard.list(ids.detailTournament, { limit: 50 }, safeNow);
    expect(authority.calls).toHaveLength(1); // 'new' must not call the authority either

    // Compare ONLY the hash-stable body -- review finding #17: this test used to hash the WHOLE
    // response (including `liveWarnings`) across three real-wall-clock `list()` calls, so a slow
    // CI run straddling boundaryStaffAssignment's 5-minute expiry could fail this for a reason
    // unrelated to GAME_READ. An explicit `safeNow` and a stable-body-only comparison remove both
    // the clock dependency and any chance a legitimate liveWarnings difference masks a real
    // regression here.
    expect(hashBody(stableBodyOf(compare))).toBe(hashBody(stableBodyOf(legacy)));
    expect(hashBody(stableBodyOf(rolled))).toBe(hashBody(stableBodyOf(legacy)));

    await setGameReadFlag('legacy');
  });

  it('fails closed with 409 GAME_RESULT_READ_MISMATCH under GAME_READ=compare when the seam reports a mismatch, called with the exact expected revision/score (regression for review finding #12.2)', async () => {
    const mismatchAuthority = new RecordingGameReadAuthority({
      outcome: 'mismatch',
      detail: { entity: `TOURNAMENT_FIXTURE:${ids.overdueFixture}`, revision: 'seed-revision', field: 'score.regulation.home' },
    });
    const mismatchBoard = new TournamentOperationsBoardService(prisma, mismatchAuthority);
    await setGameReadFlag('compare');

    let caught: unknown;
    try {
      await mismatchBoard.list(ids.detailTournament, { limit: 50 }, safeNow);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getStatus()).toBe(409);
    expect((caught as ConflictException).getResponse()).toEqual(
      expect.objectContaining({ code: 'GAME_RESULT_READ_MISMATCH' }),
    );
    const expectedScoreHash = createHash('sha256')
      .update(JSON.stringify({ home: 1, away: 0 }))
      .digest('hex');
    expect(mismatchAuthority.calls).toEqual([
      {
        gameId: overdueGameId,
        tournamentFixtureId: ids.overdueFixture,
        expectedGameVersion: 0,
        expectedRevisionId: overdueRevisionId,
        expectedScoreHash,
      },
    ]);

    await setGameReadFlag('legacy');
  });

  it('fails closed with 409 GAME_RESULT_READ_STALE when the database changes between the compare-mode authority decision and the post-resolution freshness recheck', async () => {
    // A conforming GAME_READ_AUTHORITY only ever sees the identity/value the board is ABOUT to
    // serve -- it cannot itself detect a write racing the instant right after it approves. The
    // board's own post-resolution CAS recheck (review finding #3) is what closes that: after every
    // 'ok' outcome it re-reads V1Game fresh (non-transactionally) and must refuse to serve a
    // response that no longer matches what it just approved. This fake deterministically lands in
    // that exact window by mutating the DB from inside resolve() itself, before returning 'ok'.
    const staleAuthority = new RecordingGameReadAuthority({ outcome: 'ok' }, async () => {
      await prisma.v1Game.update({
        where: { id: overdueGameId },
        data: { version: { increment: 1 } },
      });
    });
    const staleBoard = new TournamentOperationsBoardService(prisma, staleAuthority);
    await setGameReadFlag('compare');

    let caught: unknown;
    try {
      await staleBoard.list(ids.detailTournament, { limit: 50 }, safeNow);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getStatus()).toBe(409);
    expect((caught as ConflictException).getResponse()).toEqual(
      expect.objectContaining({ code: 'GAME_RESULT_READ_STALE' }),
    );

    // Restore overdueGame.version to 0 so later tests/describe blocks that assume the original
    // seed state (e.g. the mode-equality/mismatch tests above, if re-run, and this file's other
    // describe blocks which never touch this game) are unaffected by this test's induced race.
    await prisma.v1Game.update({ where: { id: overdueGameId }, data: { version: 0 } });
    await setGameReadFlag('legacy');
  });

  it('fails closed with 500 GAME_READ_FLAG_INVALID when V1GameOperationFlag(GAME_READ) holds an unrecognized value, instead of silently defaulting to non-compare (review finding #4)', async () => {
    // A row that EXISTS with a value other than exactly 'legacy'/'compare'/'new' is a
    // configuration defect the board cannot safely interpret -- distinct from a genuinely MISSING
    // row (fresh environment), which still defaults to 'legacy' (exercised by every other test in
    // this file that never touches the flag before calling list()).
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'GAME_READ' },
      create: { key: 'GAME_READ', value: 'not-a-real-mode', ownerActor: 'platform_ops' },
      update: { value: 'not-a-real-mode' },
    });
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());

    const caught = await captureFailure(() => board.list(ids.detailTournament, { limit: 50 }, safeNow));
    expectHttpError(caught, 500, 'GAME_READ_FLAG_INVALID');

    await setGameReadFlag('legacy');
  });

  it('fails closed with 500 GAME_READ_AUTHORITY_NOT_CONFIGURED when GAME_READ=compare is set but the default (non-comparing) DirectGameReadAuthorityService is still bound, instead of silently approving every result (review finding #4)', async () => {
    // Exercises the actual DEFAULT DI binding end-to-end through the board: a composition root
    // that flips GAME_READ=compare without wiring a real comparator must fail loudly the moment
    // the board calls resolve() on the one page row (overdueFixture) that has a current/official
    // result -- not silently serve a 200 nobody can trust.
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());
    await setGameReadFlag('compare');

    const caught = await captureFailure(() => board.list(ids.detailTournament, { limit: 50 }, safeNow));
    expectHttpError(caught, 500, 'GAME_READ_AUTHORITY_NOT_CONFIGURED');

    await setGameReadFlag('legacy');
  });

  it('DirectGameReadAuthorityService.resolve() always throws GAME_READ_AUTHORITY_NOT_CONFIGURED when actually invoked, rather than the pre-fix stub which unconditionally returned {outcome:"ok"} (review finding #4)', async () => {
    const authority = new DirectGameReadAuthorityService();
    const caught = await captureFailure(() => authority.resolve());
    expectHttpError(caught, 500, 'GAME_READ_AUTHORITY_NOT_CONFIGURED');
  });

  it('lets a composition root swap GAME_READ_AUTHORITY via TournamentOperationsBoardModule.register() without editing the board module, and the live HTTP endpoint fails closed with 409 on mismatch', async () => {
    // Proves the D2 fix directly: TournamentOperationsBoardModule no longer hardcodes
    // GAME_READ_AUTHORITY in its own local `providers` array (which no importer could ever
    // override, regardless of import order -- Nest always resolves a token from the declaring
    // module's own local provider first). Here `register()` is called from THIS TEST'S module
    // graph -- not from tournament-operations-board.module.ts -- with the exact call shape a
    // later task uses from app.module.ts:
    // `TournamentOperationsBoardModule.register({ provide: GAME_READ_AUTHORITY, useClass: CompareGameReadAuthorityService })`.
    // If the override seam were still broken, the swapped-in fake below would never be reached
    // and the live endpoint would return 200, not 409.
    await setGameReadFlag('compare');

    const mismatchAuthority: GameReadAuthorityPort = {
      async resolve(): Promise<GameReadAuthorityResult> {
        return {
          outcome: 'mismatch',
          detail: {
            entity: `TOURNAMENT_FIXTURE:${ids.overdueFixture}`,
            revision: 'seed-revision',
            field: 'score.regulation.home',
          },
        };
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        TournamentOperationsBoardModule.register({ provide: GAME_READ_AUTHORITY, useValue: mismatchAuthority }),
      ],
    })
      .overrideGuard(V1AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TournamentStaffGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();

    try {
      // The override actually took effect -- the resolved instance is the fake this test
      // supplied, not the module's own default DirectGameReadAuthorityService.
      expect(app.get(GAME_READ_AUTHORITY)).toBe(mismatchAuthority);

      const response = await request(app.getHttpServer())
        .get(`/tournament-ops/tournaments/${ids.detailTournament}/operations`)
        .expect(409);

      expect(response.body).toEqual(
        expect.objectContaining({
          code: 'GAME_RESULT_READ_MISMATCH',
          details: expect.objectContaining({
            mismatch: expect.objectContaining({
              entity: `TOURNAMENT_FIXTURE:${ids.overdueFixture}`,
              field: 'score.regulation.home',
            }),
          }),
        }),
      );
    } finally {
      await app.close();
      await setGameReadFlag('legacy');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Staff grant/revoke/list (apps/v1_api/src/tournament-operations/staff/**)
// ─────────────────────────────────────────────────────────────────────────

const staffPrisma = new PrismaService();

const staffIds = {
  sport: '79000000-0000-4000-8000-000000000010',
  tournament: '79000000-0000-4000-8000-000000000020',
  platformOps: '79000000-0000-4000-8000-000000000030',
  director: '79000000-0000-4000-8000-000000000031',
  fieldOperator: '79000000-0000-4000-8000-000000000032',
  outsider: '79000000-0000-4000-8000-000000000033',
  supportTarget: '79000000-0000-4000-8000-000000000034',
  field: '79000000-0000-4000-8000-000000000040',
} as const;

describe('Task 18 tournament staff grant/revoke/list', () => {
  let staffService: TournamentOperationsStaffService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 18 staff spec');
    }
    await staffPrisma.$connect();

    const config = await staffPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }

    const sportId = (
      await staffPrisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: staffIds.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;

    await staffPrisma.v1User.createMany({
      data: [
        staffIds.platformOps,
        staffIds.director,
        staffIds.fieldOperator,
        staffIds.outsider,
        staffIds.supportTarget,
      ].map((id, index) => ({
        id,
        email: `task18-staff-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await staffPrisma.v1AdminUser.create({
      data: { userId: staffIds.platformOps, adminRole: 'ops', status: 'active' },
    });

    await staffPrisma.v1Tournament.create({
      data: {
        id: staffIds.tournament,
        sportId,
        title: 'Task 18 staff tournament',
        competitionConfigVersionId: config.id,
      },
    });
    await staffPrisma.v1TournamentField.create({
      data: { id: staffIds.field, tournamentId: staffIds.tournament, scopeKey: 'main-court', name: 'Main court' },
    });

    const access = new TournamentStaffAccessService(staffPrisma);
    const auditWriter = new OperationAuditWriterService();
    const realtimeGateway = { evictUserFromScopedGameRooms: () => {} } as unknown as RealtimeGateway;
    const staffCore = new TournamentStaffService(staffPrisma, access, auditWriter, realtimeGateway);
    staffService = new TournamentOperationsStaffService(staffPrisma, access, staffCore);
  });

  afterAll(async () => {
    await staffPrisma.$disconnect();
  });

  it('refuses a non-staff actor (no admin grant, no assignment) on list and grant', async () => {
    const listDenied = await captureFailure(() => staffService.list(staffIds.outsider, staffIds.tournament));
    expectHttpError(listDenied, 403, 'STAFF_SCOPE_DENIED');
    expect((listDenied as HttpException).getResponse()).toEqual(
      expect.objectContaining({ details: { reason: 'ASSIGNMENT_REQUIRED' } }),
    );

    const grantDenied = await captureFailure(() =>
      staffService.grant(
        staffIds.outsider,
        staffIds.tournament,
        { userId: staffIds.director, role: V1TournamentStaffRole.SUPPORT_READONLY } as GrantTournamentStaffDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(grantDenied, 403, 'STAFF_SCOPE_DENIED');
  });

  it('bootstraps the first director via platform_ops when the tournament has zero active directors', async () => {
    const before = await staffPrisma.v1TournamentStaffAssignment.count({
      where: { tournamentId: staffIds.tournament, role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR },
    });
    expect(before).toBe(0);

    const bootstrapped = await staffService.grant(
      staffIds.platformOps,
      staffIds.tournament,
      { userId: staffIds.director, role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR } as GrantTournamentStaffDto,
      { requestId: randomUUID() },
    );
    expect(bootstrapped).toEqual(
      expect.objectContaining({
        tournamentId: staffIds.tournament,
        userId: staffIds.director,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        revokedAt: null,
      }),
    );

    const list = await staffService.list(staffIds.platformOps, staffIds.tournament);
    expect(list.items.map((item) => item.userId)).toContain(staffIds.director);
  });

  it('lets a director grant a subordinate role but never TOURNAMENT_DIRECTOR', async () => {
    const granted = await staffService.grant(
      staffIds.director,
      staffIds.tournament,
      {
        userId: staffIds.fieldOperator,
        role: V1TournamentStaffRole.FIELD_OPERATOR,
        fieldId: staffIds.field,
      } as GrantTournamentStaffDto,
      { requestId: randomUUID() },
    );
    expect(granted).toEqual(
      expect.objectContaining({
        userId: staffIds.fieldOperator,
        role: V1TournamentStaffRole.FIELD_OPERATOR,
        fieldId: staffIds.field,
      }),
    );

    const directorGrantsDirector = await captureFailure(() =>
      staffService.grant(
        staffIds.director,
        staffIds.tournament,
        { userId: staffIds.supportTarget, role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR } as GrantTournamentStaffDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(directorGrantsDirector, 403, 'STAFF_MANAGEMENT_DENIED');
    expect((directorGrantsDirector as HttpException).getResponse()).toEqual(
      expect.objectContaining({ details: { reason: 'DIRECTOR_CANNOT_GRANT_DIRECTOR' } }),
    );
  });

  it('refuses a field_operator (a staff role lacking the required authority) from granting or revoking staff', async () => {
    const grantDenied = await captureFailure(() =>
      staffService.grant(
        staffIds.fieldOperator,
        staffIds.tournament,
        { userId: staffIds.supportTarget, role: V1TournamentStaffRole.SUPPORT_READONLY } as GrantTournamentStaffDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(grantDenied, 403, 'STAFF_SCOPE_DENIED');
    expect((grantDenied as HttpException).getResponse()).toEqual(
      expect.objectContaining({ details: { reason: 'ROLE_ACTION_DENIED' } }),
    );

    const revokeDenied = await captureFailure(() =>
      staffService.revoke(
        staffIds.fieldOperator,
        staffIds.tournament,
        randomUUID(),
        { expectedVersion: 0, reason: 'not authorized' } as RevokeTournamentStaffDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(revokeDenied, 403, 'STAFF_SCOPE_DENIED');
  });

  it('revokes an assignment with CAS, rejects a duplicate revoke, and removes the revoked user access', async () => {
    const granted = await staffService.grant(
      staffIds.director,
      staffIds.tournament,
      { userId: staffIds.supportTarget, role: V1TournamentStaffRole.SUPPORT_READONLY } as GrantTournamentStaffDto,
      { requestId: randomUUID() },
    );

    const revoked = await staffService.revoke(
      staffIds.director,
      staffIds.tournament,
      granted.id,
      { expectedVersion: granted.version, reason: 'no longer needed' } as RevokeTournamentStaffDto,
      { requestId: randomUUID() },
    );
    expect(revoked.revokedAt).not.toBeNull();

    const staleRetry = await captureFailure(() =>
      staffService.revoke(
        staffIds.director,
        staffIds.tournament,
        granted.id,
        { expectedVersion: granted.version, reason: 'retry' } as RevokeTournamentStaffDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(staleRetry, 409, 'STAFF_ASSIGNMENT_ALREADY_REVOKED');

    const revokedUserDenied = await captureFailure(() =>
      staffService.list(staffIds.supportTarget, staffIds.tournament),
    );
    expectHttpError(revokedUserDenied, 403, 'STAFF_SCOPE_DENIED');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Field/court CRUD + fixture assignment (apps/v1_api/src/tournament-operations/fields/**)
// ─────────────────────────────────────────────────────────────────────────

const fieldsPrisma = new PrismaService();

const fieldIds = {
  sport: '7a000000-0000-4000-8000-000000000010',
  tournament: '7a000000-0000-4000-8000-000000000020',
  platformOps: '7a000000-0000-4000-8000-000000000030',
  director: '7a000000-0000-4000-8000-000000000031',
  fieldOperator: '7a000000-0000-4000-8000-000000000032',
  fixture: '7a000000-0000-4000-8000-000000000040',
} as const;

describe('Task 18 tournament field/court CRUD and fixture assignment', () => {
  let fieldsService: TournamentOperationsFieldsService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 18 fields spec');
    }
    await fieldsPrisma.$connect();

    const config = await fieldsPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }

    const sportId = (
      await fieldsPrisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: fieldIds.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;

    await fieldsPrisma.v1User.createMany({
      data: [fieldIds.platformOps, fieldIds.director, fieldIds.fieldOperator].map((id, index) => ({
        id,
        email: `task18-fields-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await fieldsPrisma.v1AdminUser.create({
      data: { userId: fieldIds.platformOps, adminRole: 'ops', status: 'active' },
    });
    await fieldsPrisma.v1Tournament.create({
      data: {
        id: fieldIds.tournament,
        sportId,
        title: 'Task 18 fields tournament',
        competitionConfigVersionId: config.id,
      },
    });
    await fieldsPrisma.v1TournamentFixture.create({
      data: {
        id: fieldIds.fixture,
        tournamentId: fieldIds.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
      },
    });
    await fieldsPrisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: fieldIds.tournament,
        userId: fieldIds.director,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        grantedByUserId: fieldIds.platformOps,
      },
    });
    await fieldsPrisma.$transaction(async (tx) => {
      const assignment = await tx.v1TournamentStaffAssignment.create({
        data: {
          tournamentId: fieldIds.tournament,
          userId: fieldIds.fieldOperator,
          role: V1TournamentStaffRole.FIELD_OPERATOR,
          grantedByUserId: fieldIds.platformOps,
        },
      });
      await tx.v1TournamentStaffFixtureScope.create({
        data: { assignmentId: assignment.id, fixtureId: fieldIds.fixture },
      });
    });

    const access = new TournamentStaffAccessService(fieldsPrisma);
    const auditWriter = new OperationAuditWriterService();
    fieldsService = new TournamentOperationsFieldsService(fieldsPrisma, access, auditWriter);
  });

  afterAll(async () => {
    await fieldsPrisma.$disconnect();
  });

  it('creates a field as platform_ops and rejects a duplicate scopeKey', async () => {
    const created = await fieldsService.create(
      fieldIds.platformOps,
      fieldIds.tournament,
      { scopeKey: 'court-a', name: 'Court A' } as CreateTournamentFieldDto,
      { requestId: randomUUID() },
    );
    expect(created).toEqual(
      expect.objectContaining({
        tournamentId: fieldIds.tournament,
        scopeKey: 'court-a',
        name: 'Court A',
        version: 0,
        active: true,
      }),
    );

    const duplicate = await captureFailure(() =>
      fieldsService.create(
        fieldIds.platformOps,
        fieldIds.tournament,
        { scopeKey: 'court-a', name: 'Court A dup' } as CreateTournamentFieldDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(duplicate, 409, 'FIELD_SCOPE_KEY_DUPLICATE');
  });

  it('denies field creation to a tournament_director (contract row 168: platform_ops-only mutation)', async () => {
    const denied = await captureFailure(() =>
      fieldsService.create(
        fieldIds.director,
        fieldIds.tournament,
        { scopeKey: 'court-b', name: 'Court B' } as CreateTournamentFieldDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(denied, 403, 'FIELD_MANAGEMENT_DENIED');
  });

  it('updates a field with CAS and rejects a stale expectedVersion', async () => {
    const before = await fieldsService.list(fieldIds.platformOps, fieldIds.tournament);
    const courtA = before.items.find((field) => field.scopeKey === 'court-a')!;

    const updated = await fieldsService.update(
      fieldIds.platformOps,
      fieldIds.tournament,
      courtA.id,
      { expectedVersion: courtA.version, name: 'Court A Renamed' } as UpdateTournamentFieldDto,
      { requestId: randomUUID() },
    );
    expect(updated).toEqual(
      expect.objectContaining({ id: courtA.id, name: 'Court A Renamed', version: courtA.version + 1 }),
    );

    const stale = await captureFailure(() =>
      fieldsService.update(
        fieldIds.platformOps,
        fieldIds.tournament,
        courtA.id,
        { expectedVersion: courtA.version, name: 'Court A Stale' } as UpdateTournamentFieldDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(stale, 409, 'STALE_FIELD_VERSION');
  });

  it('assigns and reassigns a fixture to a field, PERSISTING the change to V1TournamentFixture.fieldId (not just the returned object), without duplicating field rows, then clears it -- and a replayed Idempotency-Key does not re-apply the mutation or duplicate the audit trail (regression for review finding #15: the prior version of this test only checked the constructed return value and a field-row count, which an implementation that merely echoed dto.fieldId/null without writing V1TournamentFixture would also have satisfied)', async () => {
    const courtB = await fieldsService.create(
      fieldIds.platformOps,
      fieldIds.tournament,
      { scopeKey: 'court-b', name: 'Court B' } as CreateTournamentFieldDto,
      { requestId: randomUUID() },
    );
    const courtA = (await fieldsService.list(fieldIds.platformOps, fieldIds.tournament)).items.find(
      (field) => field.scopeKey === 'court-a',
    )!;
    const beforeCount = (await fieldsService.list(fieldIds.platformOps, fieldIds.tournament)).items.length;

    async function persistedFieldId(): Promise<string | null> {
      const row = await fieldsPrisma.v1TournamentFixture.findUniqueOrThrow({
        where: { id: fieldIds.fixture },
        select: { fieldId: true },
      });
      return row.fieldId;
    }
    async function auditCount(action: string): Promise<number> {
      return fieldsPrisma.v1OperationAudit.count({ where: { action, targetId: fieldIds.fixture } });
    }

    const assignRequestId = randomUUID();
    const assigned = await fieldsService.assignFixtureField(
      fieldIds.director,
      fieldIds.tournament,
      fieldIds.fixture,
      { fieldId: courtA.id } as AssignTournamentFixtureFieldDto,
      { requestId: assignRequestId },
    );
    expect(assigned).toEqual({ fixtureId: fieldIds.fixture, tournamentId: fieldIds.tournament, fieldId: courtA.id });
    // The durable side effect, read back from the database directly -- not the service's own
    // return value or an unrelated field-row count.
    expect(await persistedFieldId()).toBe(courtA.id);
    expect((await fieldsService.list(fieldIds.platformOps, fieldIds.tournament)).items).toHaveLength(beforeCount);

    const auditCountAfterAssign = await auditCount('tournament.fixture.field_assign');
    expect(auditCountAfterAssign).toBeGreaterThan(0);

    // Replaying the identical Idempotency-Key + identical body (review finding #9's real
    // idempotency contract) must return the stored response without re-running the mutation or
    // writing a second audit row -- durable proof, not just "the response looked the same".
    const replayedAssign = await fieldsService.assignFixtureField(
      fieldIds.director,
      fieldIds.tournament,
      fieldIds.fixture,
      { fieldId: courtA.id } as AssignTournamentFixtureFieldDto,
      { requestId: assignRequestId },
    );
    expect(replayedAssign).toEqual(assigned);
    expect(await persistedFieldId()).toBe(courtA.id);
    expect(await auditCount('tournament.fixture.field_assign')).toBe(auditCountAfterAssign);

    const reassigned = await fieldsService.assignFixtureField(
      fieldIds.director,
      fieldIds.tournament,
      fieldIds.fixture,
      { fieldId: courtB.id } as AssignTournamentFixtureFieldDto,
      { requestId: randomUUID() },
    );
    expect(reassigned.fieldId).toBe(courtB.id);
    expect(await persistedFieldId()).toBe(courtB.id);
    const afterReassign = await fieldsService.list(fieldIds.platformOps, fieldIds.tournament);
    expect(afterReassign.items).toHaveLength(beforeCount);
    expect(afterReassign.items.find((field) => field.id === courtA.id)).toBeDefined();

    const denied = await captureFailure(() =>
      fieldsService.assignFixtureField(
        fieldIds.fieldOperator,
        fieldIds.tournament,
        fieldIds.fixture,
        { fieldId: courtA.id } as AssignTournamentFixtureFieldDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(denied, 403, 'STAFF_SCOPE_DENIED');
    // A denied attempt must never have touched the persisted row.
    expect(await persistedFieldId()).toBe(courtB.id);

    const cleared = await fieldsService.clearFixtureField(
      fieldIds.director,
      fieldIds.tournament,
      fieldIds.fixture,
      { requestId: randomUUID() },
    );
    expect(cleared).toEqual({ fixtureId: fieldIds.fixture, tournamentId: fieldIds.tournament, fieldId: null });
    expect(await persistedFieldId()).toBeNull();
    expect((await fieldsService.list(fieldIds.platformOps, fieldIds.tournament)).items).toHaveLength(beforeCount);
  });

  it('rejects an empty PATCH body (only expectedVersion) instead of manufacturing a new version/audit for no semantic change (regression for review finding #16.1)', async () => {
    const before = await fieldsService.list(fieldIds.platformOps, fieldIds.tournament);
    const courtA = before.items.find((field) => field.scopeKey === 'court-a')!;
    const auditCountBefore = await fieldsPrisma.v1OperationAudit.count({
      where: { action: 'tournament.field.update', targetId: courtA.id },
    });

    const emptyPatch = await captureFailure(() =>
      fieldsService.update(
        fieldIds.platformOps,
        fieldIds.tournament,
        courtA.id,
        { expectedVersion: courtA.version } as UpdateTournamentFieldDto,
        { requestId: randomUUID() },
      ),
    );
    expectHttpError(emptyPatch, 422, 'FIELD_UPDATE_EMPTY');

    // Durable proof: no version bump, no audit row, for the rejected request.
    const after = await fieldsPrisma.v1TournamentField.findUniqueOrThrow({ where: { id: courtA.id } });
    expect(after.version).toBe(courtA.version);
    const auditCountAfter = await fieldsPrisma.v1OperationAudit.count({
      where: { action: 'tournament.field.update', targetId: courtA.id },
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it('breaks ties on id when two fields share both sortOrder and createdAt, so the list order is total and repeatable (regression for review finding #16.2)', async () => {
    const tieSortOrder = 9_000;
    const sharedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    const tieFieldIds = [randomUUID(), randomUUID(), randomUUID()].sort();

    await fieldsPrisma.v1TournamentField.createMany({
      data: tieFieldIds.map((id, index) => ({
        id,
        tournamentId: fieldIds.tournament,
        scopeKey: `tie-court-${index}`,
        name: `Tie Court ${index}`,
        sortOrder: tieSortOrder,
        createdAt: sharedCreatedAt,
      })),
    });

    const first = await fieldsService.list(fieldIds.platformOps, fieldIds.tournament);
    const second = await fieldsService.list(fieldIds.platformOps, fieldIds.tournament);
    const tieOrderFirst = first.items.filter((field) => tieFieldIds.includes(field.id)).map((field) => field.id);
    const tieOrderSecond = second.items.filter((field) => tieFieldIds.includes(field.id)).map((field) => field.id);

    // Without an `id` tie-breaker, two fields sharing sortOrder AND createdAt have no total order
    // -- Postgres would be free to return them in either order, and a naive test re-running the
    // same query twice would not by itself prove anything either way. Asserting the EXACT
    // ascending-id order (not just "first === second") is what actually pins the tie-breaker down.
    expect(tieOrderFirst).toEqual(tieFieldIds);
    expect(tieOrderSecond).toEqual(tieFieldIds);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tournament fixture lineup capture + submit (apps/v1_api/src/tournament-operations/lineups/**)
// ─────────────────────────────────────────────────────────────────────────

const lineupPrisma = new PrismaService();

const lineupIds = {
  sport: '7b000000-0000-4000-8000-000000000010',
  tournament: '7b000000-0000-4000-8000-000000000020',
  director: '7b000000-0000-4000-8000-000000000030',
  fieldOperator: '7b000000-0000-4000-8000-000000000031',
  fixture: '7b000000-0000-4000-8000-000000000040',
  fixtureNoGame: '7b000000-0000-4000-8000-000000000041',
} as const;

describe('Task 18 tournament fixture lineup capture and submit', () => {
  let lineupService: TournamentFixtureLineupService;
  let gameId: string;
  let homeSideId: string;
  let lineupId: string;

  const authUser = (id: string): V1AuthUser => ({
    id,
    email: `${id}@task18.example.test`,
    accountStatus: 'active',
    onboardingStatus: 'completed',
  });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 18 lineup spec');
    }
    await lineupPrisma.$connect();

    const config = await lineupPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }

    const sportId = (
      await lineupPrisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: lineupIds.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;

    await lineupPrisma.v1User.createMany({
      data: [lineupIds.director, lineupIds.fieldOperator].map((id, index) => ({
        id,
        email: `task18-lineup-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await lineupPrisma.v1Tournament.create({
      data: {
        id: lineupIds.tournament,
        sportId,
        title: 'Task 18 lineup tournament',
        competitionConfigVersionId: config.id,
      },
    });
    await lineupPrisma.v1TournamentFixture.createMany({
      data: [
        {
          id: lineupIds.fixture,
          tournamentId: lineupIds.tournament,
          round: 'group',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: lineupIds.fixtureNoGame,
          tournamentId: lineupIds.tournament,
          round: 'group',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
        },
      ],
    });

    const game = await lineupPrisma.v1Game.create({
      data: {
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        tournamentFixtureId: lineupIds.fixture,
        state: 'SCHEDULED',
        competitionConfigVersionId: config.id,
      },
    });
    gameId = game.id;
    const home = await lineupPrisma.v1GameSide.create({
      data: { gameId, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home' },
    });
    homeSideId = home.id;
    await lineupPrisma.v1GameSide.create({
      data: { gameId, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away' },
    });

    await lineupPrisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: lineupIds.tournament,
        userId: lineupIds.director,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        grantedByUserId: lineupIds.director,
      },
    });
    await lineupPrisma.$transaction(async (tx) => {
      const assignment = await tx.v1TournamentStaffAssignment.create({
        data: {
          tournamentId: lineupIds.tournament,
          userId: lineupIds.fieldOperator,
          role: V1TournamentStaffRole.FIELD_OPERATOR,
          grantedByUserId: lineupIds.director,
        },
      });
      await tx.v1TournamentStaffFixtureScope.create({
        data: { assignmentId: assignment.id, fixtureId: lineupIds.fixture },
      });
    });

    const gamesService = new GamesService(lineupPrisma, new OperationAuditWriterService());
    lineupService = new TournamentFixtureLineupService(lineupPrisma, gamesService);
  });

  afterAll(async () => {
    await lineupPrisma.$disconnect();
  });

  it('404s when the fixture has no linked game', async () => {
    const denied = await captureFailure(() =>
      lineupService.listLineups(authUser(lineupIds.director), lineupIds.tournament, lineupIds.fixtureNoGame),
    );
    expectHttpError(denied, 404, 'TOURNAMENT_FIXTURE_GAME_NOT_FOUND');
  });

  it('lists an empty lineup set before any capture', async () => {
    const lineups = await lineupService.listLineups(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
    );
    expect(lineups).toEqual([]);
  });

  // NOTE: per tournament-staff-policy.ts's allowsRoleAction(), FIELD_OPERATOR is authorized for
  // 'read' | 'tournament_command' | 'event_append' only -- NOT 'lineup_mutate'. So for a
  // TOURNAMENT_FIXTURE-sourced game, only platform_ops/tournament_director may capture or submit
  // a lineup. This is shipped, already-merged Task 7 policy code (not owned by this lane); per
  // Decision #1 the test asserts the actual shipped behavior rather than the recon spec's
  // "field_operator may capture actual participants after start" characterization.
  it('denies lineup capture to a field_operator (only tournament_director/platform_ops may lineup_mutate)', async () => {
    const dto: SaveGameLineupDto = { expectedVersion: 0, clientCommandId: 'task18-lineup-denied', participants: [] };
    const denied = await captureFailure(() =>
      lineupService.saveLineup(
        authUser(lineupIds.fieldOperator),
        lineupIds.tournament,
        lineupIds.fixture,
        homeSideId,
        undefined,
        dto,
      ),
    );
    expectHttpError(denied, 403, 'PERMISSION_DENIED');
  });

  it('captures a draft lineup as tournament_director', async () => {
    const dto: SaveGameLineupDto = {
      expectedVersion: 0,
      clientCommandId: 'task18-lineup-save',
      participants: [{ displayNameSnapshot: 'Player One', started: true }],
    };
    const saved = await lineupService.saveLineup(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
      homeSideId,
      undefined,
      dto,
    );
    expect(saved).toEqual(expect.objectContaining({ gameId, lineupRevision: 1, replayed: false }));
    lineupId = saved.lineupId;

    const lineups = await lineupService.listLineups(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
    );
    expect(lineups).toHaveLength(1);
    expect(lineups[0]).toEqual(expect.objectContaining({ id: lineupId, state: 'DRAFT', sideId: homeSideId }));
  });

  it('requires a takeover token to submit a tournament-fixture lineup', async () => {
    const dto: SubmitGameLineupDto = { expectedVersion: 1, clientCommandId: 'task18-submit-no-token' };
    const denied = await captureFailure(() =>
      lineupService.submitLineup(
        authUser(lineupIds.director),
        lineupIds.tournament,
        lineupIds.fixture,
        lineupId,
        undefined,
        dto,
      ),
    );
    expectHttpError(denied, 403, 'TAKEOVER_TOKEN_EXPIRED');
  });

  it('submits the lineup and idempotently replays the identical submit, without duplicating the persisted mutation or its durable idempotency record (regression for review finding #15: counting rows by lineup id alone cannot prove a replay did not silently duplicate a version bump or another durable side effect while the row count coincidentally stayed the same)', async () => {
    const dto: SubmitGameLineupDto = {
      expectedVersion: 1,
      clientCommandId: 'task18-submit',
      takeoverToken: 'task18-submit-takeover',
    };
    const first = await lineupService.submitLineup(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
      lineupId,
      undefined,
      dto,
    );
    expect(first).toEqual(expect.objectContaining({ lineupId, lineupState: 'SUBMITTED', replayed: false }));

    // Durable state read directly from the database -- not the service's constructed return
    // value: the lineup row's own `version` (bumped by submitLineup's `version:{increment:1}`),
    // the game's own `version` (bumped alongside it in the same transaction), and the durable
    // V1IdempotencyRecord this command wrote.
    const lineupAfterFirst = await lineupPrisma.v1GameLineup.findUniqueOrThrow({ where: { id: lineupId } });
    const gameAfterFirst = await lineupPrisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const idempotencyWhere = { resourceType: 'GAME', resourceId: gameId, action: 'lineup_submit' } as const;
    const idempotencyCountAfterFirst = await lineupPrisma.v1IdempotencyRecord.count({ where: idempotencyWhere });
    expect(idempotencyCountAfterFirst).toBe(1);

    const replay = await lineupService.submitLineup(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
      lineupId,
      undefined,
      dto,
    );
    expect(replay).toEqual(expect.objectContaining({ lineupId, lineupState: 'SUBMITTED', replayed: true }));

    // The replay must not have re-run the mutation: the lineup's own version, the game's own
    // version, and the idempotency-record count must be EXACTLY unchanged -- an implementation
    // that duplicated a version bump, an audit row, or another durable side effect on replay would
    // still pass the old row-count-by-id assertion below, but fails these.
    const lineupAfterReplay = await lineupPrisma.v1GameLineup.findUniqueOrThrow({ where: { id: lineupId } });
    const gameAfterReplay = await lineupPrisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(lineupAfterReplay.version).toBe(lineupAfterFirst.version);
    expect(lineupAfterReplay.state).toBe('SUBMITTED');
    expect(gameAfterReplay.version).toBe(gameAfterFirst.version);
    expect(await lineupPrisma.v1IdempotencyRecord.count({ where: idempotencyWhere })).toBe(
      idempotencyCountAfterFirst,
    );

    const submittedCount = await lineupPrisma.v1GameLineup.count({ where: { id: lineupId, state: 'SUBMITTED' } });
    expect(submittedCount).toBe(1);
  });

  it('rejects a non-idempotent submit attempt against an already-submitted lineup', async () => {
    const dto: SubmitGameLineupDto = {
      expectedVersion: 2,
      clientCommandId: 'task18-submit-again',
      takeoverToken: 'task18-submit-again-takeover',
    };
    const denied = await captureFailure(() =>
      lineupService.submitLineup(
        authUser(lineupIds.director),
        lineupIds.tournament,
        lineupIds.fixture,
        lineupId,
        undefined,
        dto,
      ),
    );
    expectHttpError(denied, 409, 'INVALID_LINEUP_STATE');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Operations board incremental updates keyed by (fixtureId, version, revisionId)
// ─────────────────────────────────────────────────────────────────────────

const incrementalPrisma = new PrismaService();

const incrementalIds = {
  sport: '7c000000-0000-4000-8000-000000000010',
  tournament: '7c000000-0000-4000-8000-000000000020',
  fixtureA: '7c000000-0000-4000-8000-000000000030',
  fixtureB: '7c000000-0000-4000-8000-000000000031',
} as const;

describe('Task 18 operations board incremental updates keyed by fixture/revision/version', () => {
  let board: TournamentOperationsBoardService;
  let gameAId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 18 incremental-update spec');
    }
    await incrementalPrisma.$connect();

    const config = await incrementalPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }

    const sportId = (
      await incrementalPrisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: incrementalIds.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;

    await incrementalPrisma.v1Tournament.create({
      data: {
        id: incrementalIds.tournament,
        sportId,
        title: 'Task 18 incremental tournament',
        competitionConfigVersionId: config.id,
      },
    });
    await incrementalPrisma.v1TournamentFixture.createMany({
      data: [
        {
          id: incrementalIds.fixtureA,
          tournamentId: incrementalIds.tournament,
          round: 'group',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: incrementalIds.fixtureB,
          tournamentId: incrementalIds.tournament,
          round: 'group',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
        },
      ],
    });
    const gameA = await incrementalPrisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: incrementalIds.fixtureA,
        state: 'LIVE',
        competitionConfigVersionId: config.id,
      },
    });
    gameAId = gameA.id;
    await incrementalPrisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: incrementalIds.fixtureB,
        state: 'LIVE',
        competitionConfigVersionId: config.id,
      },
    });

    // Isolate this block from the board describe's GAME_READ mutations above -- explicit rather
    // than relying on declaration-order-dependent global flag state.
    await incrementalPrisma.v1GameOperationFlag.upsert({
      where: { key: 'GAME_READ' },
      create: { key: 'GAME_READ', value: 'legacy', ownerActor: 'platform_ops' },
      update: { value: 'legacy' },
    });

    board = new TournamentOperationsBoardService(incrementalPrisma, new DirectGameReadAuthorityService());
  });

  afterAll(async () => {
    await incrementalPrisma.$disconnect();
  });

  it('lets a client diff two watermarked snapshots by (fixtureId, version, revisionId) to find only what changed', async () => {
    const before = await board.list(incrementalIds.tournament, { limit: 50 });
    const beforeByFixture = new Map(before.items.map((item) => [item.fixtureId, item]));
    expect(beforeByFixture.get(incrementalIds.fixtureA)?.version).toBe(0);
    expect(beforeByFixture.get(incrementalIds.fixtureA)?.revisionId).toBeNull();
    expect(beforeByFixture.get(incrementalIds.fixtureB)?.version).toBe(0);

    // Simulate a real "officialize result" command effect on fixtureA's game only: every
    // GamesService mutation ends with a version increment, and officializing a result also sets
    // currentOfficialRevisionId -- fixtureB is left completely untouched as the control.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const revision = await incrementalPrisma.v1GameResultRevision.create({
      data: {
        gameId: gameAId,
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 1, away: 0 },
        eventsHash: 'task18-incremental-hash',
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'TASK18_INCREMENTAL_TEST',
        submittedAt: new Date(),
        officialAt: new Date(),
      },
    });
    await incrementalPrisma.v1Game.update({
      where: { id: gameAId },
      data: { version: { increment: 1 }, currentOfficialRevisionId: revision.id },
    });

    const after = await board.list(incrementalIds.tournament, { limit: 50 });
    const afterByFixture = new Map(after.items.map((item) => [item.fixtureId, item]));

    expect(after.watermark).not.toBe(before.watermark);

    const changedFixtureIds = [...afterByFixture.keys()].filter((fixtureId) => {
      const beforeItem = beforeByFixture.get(fixtureId);
      const afterItem = afterByFixture.get(fixtureId)!;
      return (
        beforeItem === undefined ||
        beforeItem.version !== afterItem.version ||
        beforeItem.revisionId !== afterItem.revisionId
      );
    });
    expect(changedFixtureIds).toEqual([incrementalIds.fixtureA]);
    expect(afterByFixture.get(incrementalIds.fixtureA)?.version).toBe(1);
    expect(afterByFixture.get(incrementalIds.fixtureA)?.revisionId).toBe(revision.id);
    expect(afterByFixture.get(incrementalIds.fixtureB)?.version).toBe(0);
    expect(afterByFixture.get(incrementalIds.fixtureB)?.revisionId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Operations board items[].stableRevision incremental key + watermark
// (apps/v1_api/src/tournament-operations/board/**) -- review finding #5
// ─────────────────────────────────────────────────────────────────────────
//
// (fixtureId, version, revisionId) alone cannot identify every stable-body change: version/
// revisionId are V1Game fields, so a fixture-only mutation (field (re)assignment, a field
// rename, an escalation transition that doesn't flip RESULT_REVIEW_OVERDUE's boolean) can change
// the response without moving either -- and a fixture with no game at all always has
// version:null, revisionId:null regardless of its own mutations. This block seeds exactly the
// four failure paths the reviewer named and asserts the CONCRETE stableRevision/watermark values
// actually change across each one, not merely that the field exists on the response.

const stableRevPrisma = new PrismaService();

const stableRevIds = {
  sport: '7f000000-0000-4000-8000-000000000010',
  tournament: '7f000000-0000-4000-8000-000000000020',
  fieldA: '7f000000-0000-4000-8000-000000000030',
  fixtureNoGame: '7f000000-0000-4000-8000-000000000040',
  fixtureWithGame: '7f000000-0000-4000-8000-000000000041',
} as const;

describe('Task 18 operations board items[].stableRevision incremental key (review finding #5)', () => {
  let board: TournamentOperationsBoardService;
  let escalationId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 18 stableRevision spec');
    }
    await stableRevPrisma.$connect();

    const config = await stableRevPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    const sportId = (
      await stableRevPrisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: stableRevIds.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;

    await stableRevPrisma.v1Tournament.create({
      data: {
        id: stableRevIds.tournament,
        sportId,
        title: 'Task 18 stableRevision tournament',
        competitionConfigVersionId: config.id,
      },
    });
    await stableRevPrisma.v1TournamentField.create({
      data: {
        id: stableRevIds.fieldA,
        tournamentId: stableRevIds.tournament,
        scopeKey: 'rev-court',
        name: 'Rev Court',
      },
    });
    await stableRevPrisma.v1TournamentFixture.createMany({
      data: [
        {
          id: stableRevIds.fixtureNoGame,
          tournamentId: stableRevIds.tournament,
          round: 'group',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: stableRevIds.fixtureWithGame,
          tournamentId: stableRevIds.tournament,
          round: 'group',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
        },
      ],
    });

    const game = await stableRevPrisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: stableRevIds.fixtureWithGame,
        state: 'ENDED',
        competitionConfigVersionId: config.id,
      },
    });
    const revision = await stableRevPrisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 2, away: 1 },
        eventsHash: 'task18-stablerev-events-hash',
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'TASK18_STABLEREV_TEST_SEED',
        submittedAt: new Date(),
        officialAt: new Date(),
      },
    });
    await stableRevPrisma.v1Game.update({
      where: { id: game.id },
      data: { currentOfficialRevisionId: revision.id },
    });
    const escalation = await stableRevPrisma.v1ResultEscalation.create({
      data: {
        resultRevisionId: revision.id,
        kind: 'ESCALATION',
        dueAt: new Date(),
        status: V1EscalationStatus.PENDING,
      },
    });
    escalationId = escalation.id;

    await stableRevPrisma.v1GameOperationFlag.upsert({
      where: { key: 'GAME_READ' },
      create: { key: 'GAME_READ', value: 'legacy', ownerActor: 'platform_ops' },
      update: { value: 'legacy' },
    });

    board = new TournamentOperationsBoardService(stableRevPrisma, new DirectGameReadAuthorityService());
  });

  afterAll(async () => {
    await stableRevPrisma.$disconnect();
  });

  it('changes stableRevision (and moves watermark) on a fixture-only field reassignment, a field rename, and an escalation transition that does not move (version, revisionId) -- and stays consistent for a fixture with no game at all, where version/revisionId stay null,null throughout every mutation (all four reviewer-named failure paths, finding #5)', async () => {
    const snapshot0 = await board.list(stableRevIds.tournament, { limit: 50 });
    const noGame0 = snapshot0.items.find((item) => item.fixtureId === stableRevIds.fixtureNoGame)!;
    const withGame0 = snapshot0.items.find((item) => item.fixtureId === stableRevIds.fixtureWithGame)!;

    // Baseline: the fixture-less row always has version:null, revisionId:null -- exactly the
    // "fixture-less rows that were always null/null" case the (fixtureId, version, revisionId)
    // tuple could never distinguish from any OTHER game-less fixture, regardless of its own
    // mutations.
    expect(noGame0.version).toBeNull();
    expect(noGame0.revisionId).toBeNull();
    expect(noGame0.fieldId).toBeNull();
    expect(typeof noGame0.stableRevision).toBe('string');
    expect(noGame0.stableRevision.length).toBeGreaterThan(0);
    expect(withGame0.warnings).toContain('RESULT_REVIEW_OVERDUE');

    // ── Failure path 1: fixture-only field (re)assignment ────────────────────────────────────
    // No game exists for this fixture at all, so version/revisionId cannot move -- yet the
    // response DOES change (fieldId/fieldName). stableRevision must move with it, and the
    // concrete value must differ, not merely remain "some string".
    await stableRevPrisma.v1TournamentFixture.update({
      where: { id: stableRevIds.fixtureNoGame },
      data: { fieldId: stableRevIds.fieldA },
    });
    const snapshot1 = await board.list(stableRevIds.tournament, { limit: 50 });
    const noGame1 = snapshot1.items.find((item) => item.fixtureId === stableRevIds.fixtureNoGame)!;
    expect(noGame1.fieldId).toBe(stableRevIds.fieldA);
    expect(noGame1.version).toBeNull();
    expect(noGame1.revisionId).toBeNull();
    expect(noGame1.stableRevision).not.toBe(noGame0.stableRevision);
    expect(snapshot1.watermark).not.toBe(snapshot0.watermark);

    // ── Failure path 2: field rename, no game change at all ──────────────────────────────────
    // Renaming the ALREADY-assigned field bumps V1TournamentField.version but touches neither
    // this fixture's game nor anything version/revisionId could reflect -- yet the field's new
    // name/version feeds this fixture's stable body, so stableRevision (and the page watermark)
    // must move again, to a value distinct from BOTH prior snapshots.
    await stableRevPrisma.v1TournamentField.update({
      where: { id: stableRevIds.fieldA },
      data: { name: 'Rev Court Renamed', version: { increment: 1 } },
    });
    const snapshot2 = await board.list(stableRevIds.tournament, { limit: 50 });
    const noGame2 = snapshot2.items.find((item) => item.fixtureId === stableRevIds.fixtureNoGame)!;
    expect(noGame2.fieldName).toBe('Rev Court Renamed');
    expect(noGame2.version).toBeNull();
    expect(noGame2.revisionId).toBeNull();
    expect(noGame2.stableRevision).not.toBe(noGame1.stableRevision);
    expect(noGame2.stableRevision).not.toBe(noGame0.stableRevision);
    expect(snapshot2.watermark).not.toBe(snapshot1.watermark);

    // ── Failure path 3: escalation transition with no version/revisionId move ────────────────
    // PENDING -> ACKNOWLEDGED is still "open" (RESULT_REVIEW_OVERDUE stays true either way), and
    // neither this fixture's game.version nor its currentOfficialRevisionId are touched -- but
    // the escalation's OWN version/updatedAt (which stableRevision hashes into the max across all
    // escalations for the game) move, and stableRevision must move with them even though the
    // stable warnings BOOLEAN and (version, revisionId) do not.
    await stableRevPrisma.v1ResultEscalation.update({
      where: { id: escalationId },
      data: { status: V1EscalationStatus.ACKNOWLEDGED, version: { increment: 1 } },
    });
    const snapshot3 = await board.list(stableRevIds.tournament, { limit: 50 });
    const withGame3 = snapshot3.items.find((item) => item.fixtureId === stableRevIds.fixtureWithGame)!;
    expect(withGame3.warnings).toContain('RESULT_REVIEW_OVERDUE'); // boolean UNCHANGED
    expect(withGame3.version).toBe(withGame0.version); // V1Game.version UNCHANGED
    expect(withGame3.revisionId).toBe(withGame0.revisionId); // currentOfficialRevisionId UNCHANGED
    expect(withGame3.stableRevision).not.toBe(withGame0.stableRevision); // yet the key MOVES
    expect(snapshot3.watermark).not.toBe(snapshot2.watermark);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Operations board query-count/perf proof at realistic 100-fixture scale
// (apps/v1_api/src/tournament-operations/board/**) -- review finding #13
// ─────────────────────────────────────────────────────────────────────────
//
// The original "100-fixture" pagination test (top of this file) seeds 100 PLAIN fixtures with NO
// games at all -- both game-dependent helpers (latestLineupStateBySide/escalationSummaryByGameId)
// return before querying anything, and compare mode's per-row authority loop never runs, since
// `gameIds` is empty. It proves pagination correctness at scale, but nothing whatsoever about
// query count or per-row cost, despite the plan calling out "100-fixture board snapshot" as a
// performance requirement. This block seeds every fixture with a real game, two real sides, and a
// real lineup, so every game-dependent code path actually executes at the stated scale.

const perfPrisma = new PrismaService();

const perfIds = {
  sport: '7d000000-0000-4000-8000-000000000010',
  tournament: '7d000000-0000-4000-8000-000000000020',
} as const;

const PERF_FIXTURE_COUNT = 100;
const PERF_ESCALATION_FIXTURE_COUNT = 20;

describe('Task 18 operations board query-count/perf proof at realistic scale (review finding #13)', () => {
  let perfGameIds: string[];
  let perfHomeSideIds: string[];
  let perfAwaySideIds: string[];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 18 board perf spec');
    }
    await perfPrisma.$connect();

    const config = await perfPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    const sportId = (
      await perfPrisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: perfIds.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;
    await perfPrisma.v1Tournament.create({
      data: {
        id: perfIds.tournament,
        sportId,
        title: 'Task 18 perf tournament',
        competitionConfigVersionId: config.id,
      },
    });

    const perfFixtureIds = Array.from({ length: PERF_FIXTURE_COUNT }, () => randomUUID());
    perfGameIds = perfFixtureIds.map(() => randomUUID());
    perfHomeSideIds = perfGameIds.map(() => randomUUID());
    perfAwaySideIds = perfGameIds.map(() => randomUUID());

    await perfPrisma.v1TournamentFixture.createMany({
      data: perfFixtureIds.map((id, index) => ({
        id,
        tournamentId: perfIds.tournament,
        round: 'group',
        fixtureNumber: index + 1,
        competitionConfigVersionId: config.id,
      })),
    });
    await perfPrisma.v1Game.createMany({
      data: perfGameIds.map((id, index) => ({
        id,
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: perfFixtureIds[index],
        state: 'LIVE',
        competitionConfigVersionId: config.id,
      })),
    });
    await perfPrisma.v1GameSide.createMany({
      data: [
        ...perfGameIds.map((gameId, index) => ({
          id: perfHomeSideIds[index],
          gameId,
          sideKey: V1GameSideKey.HOME,
          displayNameSnapshot: 'Home',
        })),
        ...perfGameIds.map((gameId, index) => ({
          id: perfAwaySideIds[index],
          gameId,
          sideKey: V1GameSideKey.AWAY,
          displayNameSnapshot: 'Away',
        })),
      ],
    });
    // One SUBMITTED lineup revision per side -- the realistic, common case (a side saves and
    // submits its lineup once).
    await perfPrisma.v1GameLineup.createMany({
      data: [
        ...perfHomeSideIds.map((sideId, index) => ({
          gameId: perfGameIds[index],
          sideId,
          revision: 1,
          state: 'SUBMITTED' as const,
        })),
        ...perfAwaySideIds.map((sideId, index) => ({
          gameId: perfGameIds[index],
          sideId,
          revision: 1,
          state: 'SUBMITTED' as const,
        })),
      ],
    });

    // A fifth of the games also carry an open escalation, so escalationSummaryByGameId's join
    // actually returns rows too (not an empty result set for 100 games with none).
    for (let index = 0; index < PERF_ESCALATION_FIXTURE_COUNT; index += 1) {
      const revision = await perfPrisma.v1GameResultRevision.create({
        data: {
          gameId: perfGameIds[index],
          revision: 1,
          state: 'OFFICIAL',
          score: { home: 1, away: 1 },
          eventsHash: `task18-perf-events-hash-${index}`,
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'TASK18_PERF_TEST_SEED',
          submittedAt: new Date(),
          officialAt: new Date(),
        },
      });
      await perfPrisma.v1Game.update({
        where: { id: perfGameIds[index] },
        data: { currentOfficialRevisionId: revision.id },
      });
      await perfPrisma.v1ResultEscalation.create({
        data: {
          resultRevisionId: revision.id,
          kind: 'ESCALATION',
          dueAt: new Date(),
          status: V1EscalationStatus.PENDING,
        },
      });
    }

    await perfPrisma.v1GameOperationFlag.upsert({
      where: { key: 'GAME_READ' },
      create: { key: 'GAME_READ', value: 'legacy', ownerActor: 'platform_ops' },
      update: { value: 'legacy' },
    });
  });

  afterAll(async () => {
    await perfPrisma.$disconnect();
  });

  it('runs a small, page-size-independent number of Prisma queries at limit=100 with real games/lineups/escalations seeded (not the pagination test\'s zero-game shortcut) -- a regression toward per-row (N+1) querying would blow this count up', async () => {
    const queryLog: string[] = [];
    const instrumented = perfPrisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            queryLog.push(`${model}.${operation}`);
            return query(args);
          },
        },
      },
    });
    const board = new TournamentOperationsBoardService(
      instrumented as unknown as PrismaService,
      new DirectGameReadAuthorityService(),
    );

    const page = await board.list(perfIds.tournament, { limit: 100 });
    expect(page.items).toHaveLength(PERF_FIXTURE_COUNT);

    // Exactly the fixed set of round-trips list() documents: 1 fixture page read, 2 lineup/side
    // reads, 1 escalation read, 1 staff-coverage read, 1 GAME_READ flag read -- six total,
    // regardless of how many of the 100 rows have games/lineups/escalations (all batched via `IN`
    // clauses). Sorted before comparison so this isn't coupled to incidental Promise.all dispatch
    // ordering -- what matters is the SET and COUNT of distinct round-trips, not their sequence.
    expect(queryLog).toHaveLength(6);
    expect([...queryLog].sort()).toEqual(
      [
        'v1TournamentFixture.findMany',
        'v1GameLineup.findMany',
        'v1GameSide.findMany',
        'v1ResultEscalation.findMany',
        'v1TournamentStaffAssignment.findMany',
        'v1GameOperationFlag.findUnique',
      ].sort(),
    );
  });

  it(
    'bounds the lineup row count to one row per (gameId, sideId) regardless of how many revisions were saved for a side (review finding #13: "the lineup query also retrieves every historical revision... only the first per side is used, but all are transferred" -- this was previously an it.failing() marker encoding the CORRECT target behavior while tournament-operations-board.service.ts still ran the unbounded query; now that latestLineupStateBySide() bounds the v1GameLineup.findMany() call with `distinct: [\'gameId\', \'sideId\']`, this is a normal, passing assertion. Reverting that `distinct` clause makes the query return all 5 revisions for perfGameIds[0]\'s HOME side again -- a row count of `PERF_FIXTURE_COUNT * 2 + 4` instead of the ideal `PERF_FIXTURE_COUNT * 2` -- failing this test loudly rather than silently regressing)',
    async () => {
      // Give perfGameIds[0]'s HOME side four MORE lineup revisions (five total) beyond the single
      // baseline revision every other side has. The IDEAL bound is still exactly 2 rows for this
      // game (1 latest row per side) -- the current, unbounded query instead returns all of them.
      await perfPrisma.v1GameLineup.createMany({
        data: [2, 3, 4, 5].map((revision) => ({
          gameId: perfGameIds[0],
          sideId: perfHomeSideIds[0],
          revision,
          state: 'DRAFT' as const,
        })),
      });

      const lineupRowCounts: number[] = [];
      const instrumented = perfPrisma.$extends({
        query: {
          v1GameLineup: {
            async findMany({ args, query }) {
              const result = await query(args);
              lineupRowCounts.push(result.length);
              return result;
            },
          },
        },
      });
      const board = new TournamentOperationsBoardService(
        instrumented as unknown as PrismaService,
        new DirectGameReadAuthorityService(),
      );

      await board.list(perfIds.tournament, { limit: 100 });

      // Target/ideal bound: exactly 2 lineup rows per game with lineups (1 per side), independent
      // of how many revisions any single side has accumulated over its history.
      const idealLineupRowCount = PERF_FIXTURE_COUNT * 2;
      expect(lineupRowCounts).toEqual([idealLineupRowCount]);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Operations board single-consistent-snapshot barrier test (review finding #6)
// ─────────────────────────────────────────────────────────────────────────
//
// list()'s fixture-page read and its escalation read must share ONE RepeatableRead transaction
// snapshot, not run as two independent round-trips. This proves it with a real concurrent write:
// a SEPARATE connection commits an escalation status change strictly BETWEEN the fixture-page
// read and the escalation read inside list()'s own transaction (via a Prisma query-extension
// barrier hooked to the fixture-page query's completion), then the test verifies via a THIRD,
// independent read that the write really did commit -- yet the board's response still reflects
// the PRE-barrier state, proving the escalation read never left that single fixed snapshot.

const tearingPrisma = new PrismaService();
const tearingBarrierPrisma = new PrismaService();

const tearingIds = {
  sport: '7g000000-0000-4000-8000-000000000010',
  tournament: '7g000000-0000-4000-8000-000000000020',
  fixture: '7g000000-0000-4000-8000-000000000030',
} as const;

describe('Task 18 operations board single-consistent-snapshot barrier (review finding #6)', () => {
  let tearingEscalationId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 18 tearing-barrier spec');
    }
    await tearingPrisma.$connect();
    await tearingBarrierPrisma.$connect();

    const config = await tearingPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    const sportId = (
      await tearingPrisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: tearingIds.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;
    await tearingPrisma.v1Tournament.create({
      data: {
        id: tearingIds.tournament,
        sportId,
        title: 'Task 18 tearing-barrier tournament',
        competitionConfigVersionId: config.id,
      },
    });
    await tearingPrisma.v1TournamentFixture.create({
      data: {
        id: tearingIds.fixture,
        tournamentId: tearingIds.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
      },
    });
    const game = await tearingPrisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: tearingIds.fixture,
        state: 'ENDED',
        competitionConfigVersionId: config.id,
      },
    });
    const revision = await tearingPrisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 1, away: 1 },
        eventsHash: 'task18-tearing-events-hash',
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'TASK18_TEARING_TEST_SEED',
        submittedAt: new Date(),
        officialAt: new Date(),
      },
    });
    await tearingPrisma.v1Game.update({
      where: { id: game.id },
      data: { currentOfficialRevisionId: revision.id },
    });
    const escalation = await tearingPrisma.v1ResultEscalation.create({
      data: {
        resultRevisionId: revision.id,
        kind: 'ESCALATION',
        dueAt: new Date(),
        status: V1EscalationStatus.PENDING,
      },
    });
    tearingEscalationId = escalation.id;

    await tearingPrisma.v1GameOperationFlag.upsert({
      where: { key: 'GAME_READ' },
      create: { key: 'GAME_READ', value: 'legacy', ownerActor: 'platform_ops' },
      update: { value: 'legacy' },
    });
  });

  afterAll(async () => {
    await tearingPrisma.$disconnect();
    await tearingBarrierPrisma.$disconnect();
  });

  it('never observes a concurrent escalation status change committed strictly between the fixture-page read and the escalation read, because both share ONE RepeatableRead transaction snapshot (no tearing, review finding #6)', async () => {
    const instrumented = tearingPrisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const result = await query(args);
            if (model === 'v1TournamentFixture' && operation === 'findMany') {
              // Barrier: commit a concurrent mutation on a SEPARATE connection right here --
              // strictly AFTER list()'s fixture-page read has already executed but BEFORE its
              // escalation read runs. If both reads genuinely share one RepeatableRead snapshot,
              // the escalation read below cannot observe this write no matter how it interleaves
              // in real time.
              await tearingBarrierPrisma.v1ResultEscalation.update({
                where: { id: tearingEscalationId },
                data: { status: V1EscalationStatus.RESOLVED, version: { increment: 1 } },
              });
            }
            return result;
          },
        },
      },
    });
    const board = new TournamentOperationsBoardService(
      instrumented as unknown as PrismaService,
      new DirectGameReadAuthorityService(),
    );

    const page = await board.list(tearingIds.tournament, { limit: 50 });
    const item = page.items.find((row) => row.fixtureId === tearingIds.fixture)!;

    // The barrier write DID commit -- verified with a fresh, independent read on a SEPARATE
    // connection -- so a passing assertion below is not a false negative from the mutation
    // silently failing to apply.
    const persisted = await tearingBarrierPrisma.v1ResultEscalation.findUniqueOrThrow({
      where: { id: tearingEscalationId },
    });
    expect(persisted.status).toBe(V1EscalationStatus.RESOLVED);

    // Yet the board's response still reflects the PRE-barrier snapshot: RESULT_REVIEW_OVERDUE is
    // still present (the escalation was PENDING at the instant list()'s transaction snapshot was
    // taken), proving the escalation read -- which runs LATER in list()'s own program order --
    // was still bound to the SAME point-in-time transaction snapshot as the earlier fixture-page
    // read. If list() ever reverted to running the fixture-page read and the escalation read as
    // two INDEPENDENT (non-transactional) queries, the escalation read would run under its own
    // fresh snapshot AFTER the barrier committed and would observe RESOLVED, flipping this
    // assertion to fail.
    expect(item.warnings).toContain('RESULT_REVIEW_OVERDUE');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Task 18 HTTP authorization/validation/envelope contract (review finding #14)
// ─────────────────────────────────────────────────────────────────────────
//
// Every other describe block in this file calls the tournament-operations SERVICES directly and
// overrides both guards with `{canActivate: () => true}` where it touches HTTP at all -- so CI
// never actually exercised: an unauthenticated caller being refused; a caller who IS staff but of
// a DIFFERENT tournament being refused (cross-tournament IDOR); an unknown DTO field being
// rejected by the whitelist ValidationPipe; or each endpoint's real success status code and
// `{status,data,timestamp}` envelope. This block mounts the REAL `AppModule` (real V1AuthGuard,
// real TournamentStaffGuard, the real global ValidationPipe/TransformInterceptor/
// AllExceptionsFilter -- see `createV1IntegrationApp()`) and proves all of that against one
// representative mutating route per controller (board/fields/staff/lineups) plus the board's own
// read route.

const httpIds = {
  sport: '7e000000-0000-4000-8000-000000000010',
  tournamentA: '7e000000-0000-4000-8000-000000000020',
  tournamentB: '7e000000-0000-4000-8000-000000000021',
  platformOps: '7e000000-0000-4000-8000-000000000030',
  directorA: '7e000000-0000-4000-8000-000000000031',
  // Staff of tournament B ONLY -- the cross-tournament IDOR probe against tournament A.
  directorB: '7e000000-0000-4000-8000-000000000032',
  fieldOperatorA: '7e000000-0000-4000-8000-000000000033',
  // No staff assignment anywhere, no admin row -- a fully non-staff authenticated caller.
  outsider: '7e000000-0000-4000-8000-000000000034',
  fixtureA: '7e000000-0000-4000-8000-000000000040',
  fieldA: '7e000000-0000-4000-8000-000000000050',
} as const;

describe('Task 18 tournament operations HTTP contract (guards/validation/envelope, review finding #14)', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let httpPrisma: PrismaService;
  let gameAId: string;
  let homeSideAId: string;

  function withUser(userId: string) {
    return { 'x-v1-user-id': userId };
  }

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    httpPrisma = app.get(PrismaService);

    const config = await httpPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    const sportId = (
      await httpPrisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: httpIds.sport, code: 'football', name: 'Task 18 Football' },
        update: {},
      })
    ).id;

    const userIds = [
      httpIds.platformOps,
      httpIds.directorA,
      httpIds.directorB,
      httpIds.fieldOperatorA,
      httpIds.outsider,
    ];
    await httpPrisma.v1User.createMany({
      data: userIds.map((id, index) => ({
        id,
        email: `task18-http-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
        // V1AuthGuard fail-closed-enforces phone verification on WRITE routes unless disabled --
        // this block exercises real mutating HTTP routes, so every actor needs to be verified.
        phoneVerifiedAt: new Date(),
      })),
    });
    await httpPrisma.v1AdminUser.create({
      data: { userId: httpIds.platformOps, adminRole: 'ops', status: 'active' },
    });

    // V1AuthGuard also fail-closed-enforces managed-terms reconsent on every route; accept
    // whatever the seeded environment currently requires so these actors aren't blocked by an
    // unrelated gate this block isn't testing.
    const termsService = app.get(ManagedTermsRuntimeService);
    const currentTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = currentTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      userIds.map((userId) => termsService.acceptSignupTerms(userId, requiredDocumentIds)),
    );

    await httpPrisma.v1Tournament.createMany({
      data: [
        {
          id: httpIds.tournamentA,
          sportId,
          title: 'Task 18 HTTP tournament A',
          competitionConfigVersionId: config.id,
        },
        {
          id: httpIds.tournamentB,
          sportId,
          title: 'Task 18 HTTP tournament B',
          competitionConfigVersionId: config.id,
        },
      ],
    });
    await httpPrisma.v1TournamentField.create({
      data: { id: httpIds.fieldA, tournamentId: httpIds.tournamentA, scopeKey: 'main-court', name: 'Main court' },
    });
    await httpPrisma.v1TournamentFixture.create({
      data: {
        id: httpIds.fixtureA,
        tournamentId: httpIds.tournamentA,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
      },
    });

    await httpPrisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: httpIds.tournamentA,
        userId: httpIds.directorA,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        grantedByUserId: httpIds.platformOps,
      },
    });
    await httpPrisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: httpIds.tournamentB,
        userId: httpIds.directorB,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        grantedByUserId: httpIds.platformOps,
      },
    });
    await httpPrisma.$transaction(async (tx) => {
      const assignment = await tx.v1TournamentStaffAssignment.create({
        data: {
          tournamentId: httpIds.tournamentA,
          userId: httpIds.fieldOperatorA,
          role: V1TournamentStaffRole.FIELD_OPERATOR,
          grantedByUserId: httpIds.platformOps,
        },
      });
      await tx.v1TournamentStaffFixtureScope.create({
        data: { assignmentId: assignment.id, fixtureId: httpIds.fixtureA },
      });
    });

    const game = await httpPrisma.v1Game.create({
      data: {
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: httpIds.fixtureA,
        state: 'SCHEDULED',
        competitionConfigVersionId: config.id,
      },
    });
    gameAId = game.id;
    const home = await httpPrisma.v1GameSide.create({
      data: { gameId: game.id, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home' },
    });
    homeSideAId = home.id;
    await httpPrisma.v1GameSide.create({
      data: { gameId: game.id, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away' },
    });
  }, 30_000);

  afterAll(async () => {
    await cleanupApp?.();
  });

  // ── Board GET (real guards) ──────────────────────────────────────────────

  it('board GET: refuses an unauthenticated caller with 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/operations`)
      .expect(401);
    expect(res.body).toEqual(
      expect.objectContaining({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED' }),
    );
  });

  it('board GET: refuses an authenticated non-staff outsider with 403 STAFF_SCOPE_DENIED', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/operations`)
      .set(withUser(httpIds.outsider))
      .expect(403);
    expect(res.body).toEqual(
      expect.objectContaining({ status: 'error', statusCode: 403, code: 'STAFF_SCOPE_DENIED' }),
    );
  });

  it('board GET: refuses staff of a DIFFERENT tournament with 403 STAFF_SCOPE_DENIED (cross-tournament IDOR)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/operations`)
      .set(withUser(httpIds.directorB))
      .expect(403);
    expect(res.body).toEqual(
      expect.objectContaining({ status: 'error', statusCode: 403, code: 'STAFF_SCOPE_DENIED' }),
    );
  });

  it('board GET: rejects a malformed tournamentId with 422 (ParseUUIDPipe) -- platform_ops bypasses the per-tournament assignment lookup so the guard itself does not mask the pipe', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/tournament-ops/tournaments/not-a-uuid/operations')
      .set(withUser(httpIds.platformOps))
      .expect(422);
  });

  it('board GET: rejects an unknown query parameter via the global whitelist ValidationPipe with 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/operations?bogusParam=1`)
      .set(withUser(httpIds.directorA))
      .expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({ status: 'error', statusCode: 400, code: 'VALIDATION_ERROR' }),
    );
  });

  it('board GET: returns 200 with the global {status,data,timestamp} envelope for an authorized director', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/operations`)
      .set(withUser(httpIds.directorA))
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({
          items: expect.any(Array),
          nextCursor: null,
          watermark: expect.any(String),
        }),
        timestamp: expect.any(String),
      }),
    );
  });

  // ── Fields POST (real guards) ────────────────────────────────────────────

  it('fields POST: refuses an unauthenticated caller with 401', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fields`)
      .send({ scopeKey: 'http-court-noauth', name: 'HTTP Court' })
      .expect(401);
  });

  it('fields POST: refuses a non-platform_ops actor (tournament_director) with 403 FIELD_MANAGEMENT_DENIED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fields`)
      .set(withUser(httpIds.directorA))
      .send({ scopeKey: 'http-court-director', name: 'HTTP Court' })
      .expect(403);
    expect(res.body).toEqual(expect.objectContaining({ code: 'FIELD_MANAGEMENT_DENIED' }));
  });

  it('fields POST: rejects an unknown body field via the global whitelist ValidationPipe with 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fields`)
      .set(withUser(httpIds.platformOps))
      .send({ scopeKey: 'http-court-wl', name: 'HTTP Court WL', notAWhitelistedField: 'nope' })
      .expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({ status: 'error', statusCode: 400, code: 'VALIDATION_ERROR' }),
    );
  });

  it('fields POST: creates a field and returns 201 with the global envelope for platform_ops', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fields`)
      .set(withUser(httpIds.platformOps))
      .send({ scopeKey: 'http-court-ok', name: 'HTTP Court OK' })
      .expect(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ scopeKey: 'http-court-ok', tournamentId: httpIds.tournamentA }),
      }),
    );
  });

  // ── Staff POST (real guards) ──────────────────────────────────────────────

  it('staff POST: refuses staff of a DIFFERENT tournament attempting to grant with 403 STAFF_SCOPE_DENIED (cross-tournament IDOR)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/staff`)
      .set(withUser(httpIds.directorB))
      .send({ userId: httpIds.outsider, role: 'SUPPORT_READONLY' })
      .expect(403);
    expect(res.body).toEqual(expect.objectContaining({ code: 'STAFF_SCOPE_DENIED' }));
  });

  it("staff POST: grants a role for the tournament's own director and returns 201 with the global envelope", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/staff`)
      .set(withUser(httpIds.directorA))
      .send({ userId: httpIds.outsider, role: 'SUPPORT_READONLY' })
      .expect(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ userId: httpIds.outsider, role: 'SUPPORT_READONLY' }),
      }),
    );
  });

  // ── Lineup PUT (real guards, delegates to GamesService.resolveActor) ─────

  it('lineup PUT: refuses an unauthenticated caller with 401', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fixtures/${httpIds.fixtureA}/lineup/${homeSideAId}`)
      .send({ expectedVersion: 0, clientCommandId: randomUUID(), participants: [] })
      .expect(401);
  });

  it('lineup PUT: rejects a malformed sideId with 422 (ParseUUIDPipe, review finding #14 sibling gap / S2) -- TournamentFixtureLineupController previously had no ParseUUIDPipe on its route params unlike board/fields/staff, so a malformed uuid fell through to the service layer instead of failing fast at the HTTP boundary', async () => {
    // Only V1AuthGuard (authentication) sits in front of this controller -- no per-tournament
    // TournamentStaffGuard -- so any authenticated actor reaching the pipe is enough to prove the
    // malformed-param rejection isn't masked by a deeper authorization check.
    await request(app.getHttpServer())
      .put(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fixtures/${httpIds.fixtureA}/lineup/not-a-uuid`)
      .set(withUser(httpIds.directorA))
      .send({ expectedVersion: 0, clientCommandId: randomUUID(), participants: [] })
      .expect(422);
  });

  it('lineup PUT: refuses a field_operator (lacks lineup_mutate authority for a TOURNAMENT_FIXTURE game) with 403 PERMISSION_DENIED', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fixtures/${httpIds.fixtureA}/lineup/${homeSideAId}`)
      .set(withUser(httpIds.fieldOperatorA))
      .send({ expectedVersion: 0, clientCommandId: randomUUID(), participants: [] })
      .expect(403);
    expect(res.body).toEqual(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
  });

  it('lineup PUT: an authorized director can save a lineup with a matching Idempotency-Key header, returning 200 with the global envelope', async () => {
    const clientCommandId = randomUUID();
    const res = await request(app.getHttpServer())
      .put(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fixtures/${httpIds.fixtureA}/lineup/${homeSideAId}`)
      .set(withUser(httpIds.directorA))
      .set('idempotency-key', clientCommandId)
      .send({
        expectedVersion: 0,
        clientCommandId,
        participants: [{ displayNameSnapshot: 'HTTP Player', started: true }],
      })
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ gameId: gameAId, replayed: false }),
      }),
    );
  });
});
