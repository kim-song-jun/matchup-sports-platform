import { HttpException, type INestApplication } from '@nestjs/common';
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
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RealtimeGateway } from '../../src/realtime/realtime.gateway';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { TournamentOperationsBoardController } from '../../src/tournament-operations/board/tournament-operations-board.controller';
import type { ListTournamentOperationsQueryDto } from '../../src/tournament-operations/board/dto/list-operations-query.dto';
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
import { TournamentStaffAccessService, type TournamentStaffPrincipal } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentStaffGuard, type TournamentStaffRequest } from '../../src/tournaments/staff/tournament-staff.guard';
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

/** Derives `expectedScoreHash` the same CANONICAL way
 * `tournament-operations-board.service.ts`'s `canonicalizeForHash()` does (recursively sorted
 * object keys before `JSON.stringify`) -- reusing this file's own `normalized()` above, which
 * already sorts keys the same way. Deliberately NOT a pasted literal digest: this still derives
 * the hash from the semantic score value, so the assertions below keep failing if production ever
 * changes what it hashes or stops canonicalizing before hashing. The seeded DB score is a plain
 * `{ home, away }` object with no `Date`, so `normalized()`'s extra `Date` handling is inert here
 * and this is equivalent to calling the production canonicalizer directly. */
function expectedScoreHashFor(score: unknown): string {
  return createHash('sha256').update(JSON.stringify(normalized(score))).digest('hex');
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

    // Detail fixtures for status/warning coverage.
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
    const board = new TournamentOperationsBoardService(prisma);
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
    const board = new TournamentOperationsBoardService(prisma);
    const page = await board.list(ids.detailTournament, { status: 'LIVE', limit: 50 });
    const fixtureIds = page.items.map((item) => item.fixtureId);
    expect(fixtureIds).toContain(ids.liveFixture);
    expect(fixtureIds).not.toContain(ids.clearFixture);
    expect(fixtureIds).not.toContain(ids.overdueFixture);
  });

  it('keys the lineup lookup by (gameId, sideKey) not (gameId, sideId): a fully-submitted lineup clears LINEUP_NOT_SUBMITTED past the deadline, while a missing lineup still raises it (regression for the Copilot C1 finding)', async () => {
    const board = new TournamentOperationsBoardService(prisma);
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
    const board = new TournamentOperationsBoardService(prisma);
    const page = await board.list(ids.paginationTournament, {
      cursor: 'not-a-real-fixture-id-and-not-a-uuid-either',
      limit: 20,
    });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  // A cursor minted for a DIFFERENT tournament is now normalized to a clean empty page, exactly
  // like a cursor that fails to decode at all -- not a distinguishing 400. (Superseded test: this
  // used to assert `400 OPERATIONS_BOARD_CURSOR_TOURNAMENT_MISMATCH` here, which is exactly the
  // review finding #7 hardening that Task 18 review P1-1 later found to itself be an existence
  // oracle -- see the mandatory identical-response test right below this one.)
  it('normalizes a cursor minted for a DIFFERENT tournament to a clean empty page, instead of anchoring the page on that foreign row\'s sort position', async () => {
    const board = new TournamentOperationsBoardService(prisma);
    // A real, valid cursor minted by ids.detailTournament's own list() call -- but supplied
    // against ids.paginationTournament below.
    const foreignCursor = (await board.list(ids.detailTournament, { limit: 1 })).nextCursor;
    expect(foreignCursor).not.toBeNull();

    const page = await board.list(ids.paginationTournament, {
      cursor: foreignCursor as string,
      limit: 20,
    });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();

    // Sanity-check this is a genuine cross-tournament normalization, not an over-eager guard that
    // empties every cursor: the SAME cursor, supplied back to its OWN minting tournament, must
    // resume paging normally.
    const ownTournamentPage = await board.list(ids.detailTournament, {
      cursor: foreignCursor as string,
      limit: 50,
    });
    expect(ownTournamentPage.nextCursor).toBeNull();
    expect(ownTournamentPage.items.length).toBeGreaterThan(0);
  });

  // Regression for Task 18 review P1-1 (the mandated test: identical response, not merely "both
  // are some kind of empty/error"). Pre-fix, a cursor naming a fixture that exists in a DIFFERENT,
  // possibly-private tournament got `400 OPERATIONS_BOARD_CURSOR_TOURNAMENT_MISMATCH`, while a
  // cursor matching nothing anywhere got a clean `200` empty page -- two distinguishable
  // responses a caller could use as an oracle for "does this fixture id exist in some other
  // tournament?". Reverting the P1-1 fix (restoring the tournamentId-mismatch 400 branch) makes
  // this test fail: `privateFixtureExists` would reject with an HttpException where
  // `noSuchFixtureExists` resolves normally, so the `toEqual` below would never even run.
  it('returns the IDENTICAL response for a cursor naming a real fixture in a DIFFERENT (private) tournament and a cursor that decodes to nothing at all -- never a distinguishing error that would leak whether that other fixture exists (Task 18 review P1-1)', async () => {
    const board = new TournamentOperationsBoardService(prisma);

    // Case 1: "private fixture exists" -- a cursor that decodes fine and names a REAL, EXISTING
    // fixture, but in ids.detailTournament, a DIFFERENT tournament than the one being queried.
    const foreignCursor = (await board.list(ids.detailTournament, { limit: 1 })).nextCursor as string;
    const privateFixtureExists = await board.list(ids.paginationTournament, {
      cursor: foreignCursor,
      limit: 20,
    });

    // Case 2: "no such fixture" -- a cursor that does not decode to anything at all.
    const noSuchFixtureExists = await board.list(ids.paginationTournament, {
      cursor: 'not-a-real-fixture-id-and-not-a-uuid-either',
      limit: 20,
    });

    // IDENTICAL, not merely "both happen to be empty pages" -- every field, byte for byte.
    expect(privateFixtureExists).toEqual(noSuchFixtureExists);
    expect(privateFixtureExists).toEqual({
      items: [],
      nextCursor: null,
      watermark: noSuchFixtureExists.watermark,
      liveWarnings: [],
    });
  });

  // Regression for Task 18 review P1-2: the cursor must be durable against its own anchor row
  // being deleted between two page requests. Pre-fix (raw fixture-id cursor, re-resolved by
  // re-reading that row on the next page request), deleting the anchor row made the NEXT page
  // request find no such row and silently return an empty page, losing every remaining fixture in
  // the walk. The self-describing tuple cursor carries its own sort position, so it no longer
  // needs that row to still exist.
  it('keeps paging correctly after the page-1 anchor fixture is deleted before the page-2 request (Task 18 review P1-2)', async () => {
    const board = new TournamentOperationsBoardService(prisma);

    const page1 = await board.list(ids.paginationTournament, { limit: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).not.toBeNull();
    const seenOnPage1 = new Set(page1.items.map((item) => item.fixtureId));

    // Delete the exact anchor row page1.nextCursor was minted from.
    const anchorFixtureId = page1.items[page1.items.length - 1].fixtureId;
    await prisma.v1TournamentFixture.delete({ where: { id: anchorFixtureId } });

    const page2 = await board.list(ids.paginationTournament, {
      cursor: page1.nextCursor as string,
      limit: 20,
    });
    // Every row on page 2 must be a NEW fixture (never one already seen on page 1, and obviously
    // never the deleted anchor itself), and page 2 must not be empty -- the pre-fix behavior lost
    // every one of these rows instead.
    expect(page2.items.length).toBeGreaterThan(0);
    for (const item of page2.items) {
      expect(item.fixtureId).not.toBe(anchorFixtureId);
      expect(seenOnPage1.has(item.fixtureId)).toBe(false);
    }
    // `ids.paginationTournament` is not referenced by any test after this one in this describe
    // (only the full-100-fixture walk and the two cursor-normalization tests above use it, both
    // of which already ran), so deleting one of its fixtures here has no effect on later tests.
  });

  it('surfaces the full warning set per fixture (split stable items.warnings / time-relative liveWarnings), lets ?warning= narrow items by a STABLE code, and REJECTS ?warning= for a time-relative code instead of filtering by it (review finding #2)', async () => {
    const board = new TournamentOperationsBoardService(prisma);
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
    const board = new TournamentOperationsBoardService(prisma);

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

  // Regression for Task 18 review P1-3: the revoke `reason` must land in the SAME audit row, in
  // the SAME transaction, as the revocation itself -- not in a second, separate
  // `v1OperationAudit` row written by a follow-up call AFTER `revokeStaff()`'s own transaction has
  // already committed. Reverting the fix (moving the reason-persist back to a follow-up
  // `tournament.staff.revoke_reason` row in TournamentOperationsStaffService.revoke()) makes this
  // test fail two ways: the audit-row COUNT for this assignment becomes 2 instead of 1, and the
  // main `tournament.staff.revoke` row's own `reason` column reverts to null (the reason would
  // only exist on the separate row).
  it('persists the revoke reason onto the SAME tournament.staff.revoke audit row as the revocation itself, atomically, with no second follow-up row (Task 18 review P1-3)', async () => {
    const granted = await staffService.grant(
      staffIds.director,
      staffIds.tournament,
      { userId: staffIds.supportTarget, role: V1TournamentStaffRole.FIELD_OPERATOR, fieldId: staffIds.field } as GrantTournamentStaffDto,
      { requestId: randomUUID() },
    );

    const reasonText = 'p1-3 atomicity regression reason';
    await staffService.revoke(
      staffIds.director,
      staffIds.tournament,
      granted.id,
      { expectedVersion: granted.version, reason: reasonText } as RevokeTournamentStaffDto,
      { requestId: randomUUID() },
    );

    const auditRows = await staffPrisma.v1OperationAudit.findMany({
      where: { resourceType: 'TOURNAMENT_STAFF_ASSIGNMENT', resourceId: granted.id },
    });
    // Exactly one durable audit row exists for this assignment's revoke -- not a
    // 'tournament.staff.revoke' row plus a separate 'tournament.staff.revoke_reason' row.
    const revokeRows = auditRows.filter((row) => row.action === 'tournament.staff.revoke');
    expect(revokeRows).toHaveLength(1);
    expect(auditRows.filter((row) => row.action === 'tournament.staff.revoke_reason')).toHaveLength(0);
    expect(revokeRows[0].reason).toBe(reasonText);
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
      // OperationAuditWriter maps the envelope's targetType/targetId onto the DB columns
      // resourceType/resourceId, so the persisted column to filter on is resourceId.
      return fieldsPrisma.v1OperationAudit.count({ where: { action, resourceId: fieldIds.fixture } });
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
      where: { action: 'tournament.field.update', resourceId: courtA.id },
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
      where: { action: 'tournament.field.update', resourceId: courtA.id },
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it('breaks ties on id when two fields share both sortOrder and createdAt, so the list order is total and repeatable (regression for review finding #16.2)', async () => {
    const tieSortOrder = 9_000;
    const sharedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    const tieFieldIds: string[] = [randomUUID(), randomUUID(), randomUUID()].sort();

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

  it('lets an EXPIRED Idempotency-Key be reused for a brand new mutation instead of permanently poisoning that key (regression for Task 18 review P1-5: consumeIdempotency() correctly treats an expired row as "no existing record" and proceeds, but the pre-fix recordIdempotency() then did a bare create() against the SAME still-present unique row, hitting Postgres P2002 and rolling back the ENTIRE transaction -- including the mutation this request was legitimately trying to make -- forever, for every future request replaying that exact key)', async () => {
    const reusedRequestId = randomUUID();
    const idempotencyWhere = {
      actorUserId_action_resourceType_resourceId_idempotencyKey: {
        actorUserId: fieldIds.platformOps,
        action: 'tournament.field.create',
        resourceType: 'TOURNAMENT_FIELD',
        resourceId: fieldIds.tournament,
        idempotencyKey: reusedRequestId,
      },
    } as const;

    const first = await fieldsService.create(
      fieldIds.platformOps,
      fieldIds.tournament,
      { scopeKey: 'p1-5-expiry-a', name: 'P1-5 Expiry A' } as CreateTournamentFieldDto,
      { requestId: reusedRequestId },
    );
    expect(first).toEqual(expect.objectContaining({ scopeKey: 'p1-5-expiry-a' }));

    // Force the durable idempotency row for this exact key into the past -- simulating its
    // natural 30-day TTL having elapsed -- without waiting 30 days.
    await fieldsPrisma.v1IdempotencyRecord.update({
      where: idempotencyWhere,
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    // Same Idempotency-Key, reused for a GENUINELY NEW mutation (different scopeKey/name/payload)
    // now that the prior record has expired -- consumeIdempotency() must treat this as fresh (not
    // a replay, not a payload conflict) and it must actually succeed end-to-end.
    const second = await fieldsService.create(
      fieldIds.platformOps,
      fieldIds.tournament,
      { scopeKey: 'p1-5-expiry-b', name: 'P1-5 Expiry B' } as CreateTournamentFieldDto,
      { requestId: reusedRequestId },
    );
    expect(second).toEqual(expect.objectContaining({ scopeKey: 'p1-5-expiry-b' }));
    expect(second.id).not.toBe(first.id);

    // Durable proof, not just "the call didn't throw": the second field actually persisted (the
    // pre-fix P2002 rolled back its own transaction, so the field row would have been created and
    // then immediately undone).
    const persistedSecond = await fieldsPrisma.v1TournamentField.findUnique({
      where: { id: second.id },
    });
    expect(persistedSecond).not.toBeNull();
    expect(persistedSecond?.scopeKey).toBe('p1-5-expiry-b');

    // The durable idempotency record for this key now reflects the SECOND mutation's response,
    // not a stale copy of the first -- proving `recordIdempotency()` overwrote (not merely
    // tolerated) the expired row.
    const idempotencyRow = await fieldsPrisma.v1IdempotencyRecord.findUniqueOrThrow({
      where: idempotencyWhere,
    });
    expect((idempotencyRow.responseBody as { scopeKey?: string }).scopeKey).toBe('p1-5-expiry-b');
    expect(idempotencyRow.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("TournamentStaffAccessService.assertAccess() row-locks the candidate assignment row when given a transaction client, so a concurrent revoke cannot commit in the gap between this decision and the caller's own subsequent write (Task 18 review P0-3)", async () => {
    const lockDirectorId = randomUUID();
    await fieldsPrisma.v1User.create({
      data: {
        id: lockDirectorId,
        email: `task18-p03-lock-${lockDirectorId}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    const assignment = await fieldsPrisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: fieldIds.tournament,
        userId: lockDirectorId,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        grantedByUserId: fieldIds.platformOps,
      },
    });
    const access = new TournamentStaffAccessService(fieldsPrisma);

    const order: string[] = [];
    let releaseHold: (() => void) | undefined;
    const holdReleased = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    let signalLockAcquired: (() => void) | undefined;
    const lockAcquired = new Promise<void>((resolve) => {
      signalLockAcquired = resolve;
    });

    // Simulates TournamentOperationsFieldsService.assignFixtureField()'s own `$transaction`:
    // assertAccess(input, tx) takes its `FOR SHARE` lock on the assignment row as literally its
    // first statement, then this transaction is deliberately held open (not yet committed) until
    // this test explicitly releases it below.
    const holdingTransaction = fieldsPrisma.$transaction(async (tx) => {
      await access.assertAccess(
        { userId: lockDirectorId, action: 'event_reverse', resource: { tournamentId: fieldIds.tournament } },
        tx,
      );
      order.push('lock-acquired');
      signalLockAcquired?.();
      await holdReleased;
      order.push('holding-tx-committing');
    });

    // Deterministic (not a timing guess): resolves exactly when the lock statement has completed.
    await lockAcquired;

    const revokePromise = fieldsPrisma.v1TournamentStaffAssignment
      .updateMany({
        where: { id: assignment.id, revokedAt: null },
        data: { revokedAt: new Date(), version: { increment: 1 } },
      })
      .then((result) => {
        order.push('revoke-committed');
        return result;
      });

    // The revoke must NOT be able to complete while the holding transaction still holds its
    // `FOR SHARE` lock on this exact assignment row -- give it ample time to (incorrectly) race
    // through if the pre-fix, unlocked read were still in place.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(order).toEqual(['lock-acquired']); // still just one entry -- the revoke is still blocked.

    releaseHold?.();
    await holdingTransaction;
    const revokeResult = await revokePromise;

    expect(order).toEqual(['lock-acquired', 'holding-tx-committing', 'revoke-committed']);
    expect(revokeResult.count).toBe(1);
  });

  it('assignFixtureField passes its OWN transaction client into TournamentStaffAccessService.assertAccess() (not the root PrismaService, and not omitted), so the authorization recheck row-locks against the same connection as the fixture write (Task 18 review P0-3)', async () => {
    const access = (fieldsService as unknown as { access: TournamentStaffAccessService }).access;
    const seenClients: unknown[] = [];
    const originalAssertAccess = access.assertAccess.bind(access);
    const spy = jest.spyOn(access, 'assertAccess').mockImplementation(async (input, client) => {
      seenClients.push(client);
      return originalAssertAccess(input, client);
    });

    try {
      const wiringFixtureId = randomUUID();
      const wiringFieldId = randomUUID();
      await fieldsPrisma.v1TournamentFixture.create({
        data: {
          id: wiringFixtureId,
          tournamentId: fieldIds.tournament,
          round: 'group',
          fixtureNumber: 9001,
          competitionConfigVersionId: (
            await fieldsPrisma.v1Tournament.findUniqueOrThrow({
              where: { id: fieldIds.tournament },
              select: { competitionConfigVersionId: true },
            })
          ).competitionConfigVersionId,
        },
      });
      await fieldsPrisma.v1TournamentField.create({
        data: {
          id: wiringFieldId,
          tournamentId: fieldIds.tournament,
          scopeKey: `p03-wiring-${wiringFieldId}`,
          name: 'P0-3 wiring court',
        },
      });

      await fieldsService.assignFixtureField(
        fieldIds.director,
        fieldIds.tournament,
        wiringFixtureId,
        { fieldId: wiringFieldId } as AssignTournamentFixtureFieldDto,
        { requestId: randomUUID() },
      );

      expect(seenClients).toHaveLength(1);
      // The pre-fix call site was `this.access.assertAccess({...})` -- a single argument, so
      // `client` here would have been `undefined`. A real transaction client is also never the
      // literal root `fieldsPrisma` instance.
      expect(seenClients[0]).not.toBeUndefined();
      expect(seenClients[0]).not.toBe(fieldsPrisma);
    } finally {
      spy.mockRestore();
    }
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
  // Declared at describe scope, not inside beforeAll: the takeover tests below call
  // gamesService.requestTakeover() directly. The merge that brought Task 18's P1-4 fix in narrowed
  // this to a beforeAll-local const, which those tests cannot see.
  let gamesService: GamesService;
  let gameId: string;
  let homeSideId: string;
  let awaySideId: string;
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
    const away = await lineupPrisma.v1GameSide.create({
      data: { gameId, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away' },
    });
    awaySideId = away.id;

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

    // Both sides of this merge widened a constructor: Task 20 added GameTakeoverService to
    // GamesService, and Task 18's P1-4 fix added TournamentStaffAccessService to
    // TournamentFixtureLineupService (so authorization runs before any fixture/game lookup).
    // Both are required - the current signatures are 3-arg on each.
    gamesService = new GamesService(lineupPrisma, new OperationAuditWriterService(), new GameTakeoverService());
    lineupService = new TournamentFixtureLineupService(
      lineupPrisma,
      gamesService,
      new TournamentStaffAccessService(lineupPrisma),
    );
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
    // Task 21 shape change: the bare `V1GameLineup[]` became `{gameId, lineups}` so the live
    // operations console can resolve fixtureId -> gameId before any lineup has ever been saved
    // (an empty `lineups` array alone carries no id to call any `/games/:gameId/*` route with;
    // see `OperateConsole`'s `useV1FixtureLineup` -> `gameId` -> `useV1Game`/command dispatch in
    // apps/v1_web/src/app/tournament-ops/.../operate/operate-console.tsx).
    const result = await lineupService.listLineups(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
    );
    expect(result).toEqual({ gameId, lineups: [] });
  });

  // 2026-08-11: FIELD_OPERATOR used to be denied 'lineup_mutate' here (per
  // tournament-staff-policy.ts's allowsRoleAction()) -- this described the actual shipped Task 7
  // policy at the time. Per owner decision that contract flipped: field_operator holds
  // 'tournament_command' (start the fixture) but had no way to satisfy its own precondition (a
  // saved lineup), so field ops staff alone could never run a tournament. The now-allowed case
  // lives at the end of this describe block (see 'allows lineup capture by a field_operator...')
  // rather than here, because a successful save bumps the shared game version and every test below
  // this point has a version already threaded through it (captures -> submits -> replay -> reject)
  // -- inserting a version-bumping call here would desync all of them.

  // Regression for Task 18 review P1-4: an actor with NO staff assignment at all in this
  // tournament must get the IDENTICAL 403 (same status, same code) whether the fixture id they
  // probe belongs to a real, existing fixture/game or to a fixture id that does not exist at all.
  // Pre-fix, `resolveGameId()` ran BEFORE authorization: a nonexistent fixture id 404'd
  // immediately (TOURNAMENT_FIXTURE_GAME_NOT_FOUND) while an existing-but-unauthorized fixture id
  // reached GamesService and 403'd (PERMISSION_DENIED) -- an outsider could fingerprint fixture
  // existence purely from which of the two responses came back, without ever being authorized to
  // see either. Reverting the fix (moving the fixture/game lookup back before the access check)
  // makes this test fail: the "real fixture" case would 404 instead of matching the "fake
  // fixture" case's 403.
  it('normalizes fixture existence for an unauthorized caller: a real (existing) fixture/game and a fabricated, nonexistent fixture id both deny with the IDENTICAL 403 STAFF_SCOPE_DENIED, never a 404 that would leak existence (Task 18 review P1-4)', async () => {
    const outsiderId = randomUUID();
    await lineupPrisma.v1User.create({
      data: {
        id: outsiderId,
        email: `task18-lineup-outsider-${outsiderId}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    // No V1TournamentStaffAssignment is ever created for `outsiderId` in `lineupIds.tournament`.

    const realFixtureDenied = await captureFailure(() =>
      lineupService.listLineups(authUser(outsiderId), lineupIds.tournament, lineupIds.fixture),
    );
    const fakeFixtureDenied = await captureFailure(() =>
      lineupService.listLineups(authUser(outsiderId), lineupIds.tournament, randomUUID()),
    );

    expectHttpError(realFixtureDenied, 403, 'STAFF_SCOPE_DENIED');
    expectHttpError(fakeFixtureDenied, 403, 'STAFF_SCOPE_DENIED');
    expect((realFixtureDenied as HttpException).getResponse()).toEqual(
      (fakeFixtureDenied as HttpException).getResponse(),
    );
  });

  it('captures a draft lineup as tournament_director', async () => {
    const dto: SaveGameLineupDto = {
      expectedVersion: 0,
      clientCommandId: 'task18-lineup-save',
      // football-v1 pins minPlayers:7/maxPlayers:11 (this route now enforces the
      // roster-size gate, mirroring team-match-lineup.service.ts#resolveEntries —
      // previously unvalidated here, a single-player roster was silently
      // accepted). A minimal-but-valid 7-player roster keeps this test's actual
      // subject (draft capture + listLineups projection) exercised.
      participants: Array.from({ length: 7 }, (_, index) => ({
        displayNameSnapshot: `Player ${index + 1}`,
        ...(index === 0 ? { position: 'GK' } : {}),
        started: true,
      })),
    };
    const saved = await lineupService.saveLineup(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
      homeSideId,
      dto.clientCommandId,
      dto,
    );
    expect(saved).toEqual(expect.objectContaining({ gameId, lineupRevision: 1, replayed: false }));
    lineupId = saved.lineupId;

    const result = await lineupService.listLineups(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
    );
    expect(result.gameId).toBe(gameId);
    expect(result.lineups).toHaveLength(1);
    expect(result.lineups[0]).toEqual(expect.objectContaining({ id: lineupId, state: 'DRAFT', sideId: homeSideId }));
  });

  // 2026-08-11 알파 실측 이후 오너 결정으로 계약이 바뀌었다: takeover 토큰은 "현장 기기가
  // 이 경기를 배타적으로 장악 중"이라는 라이브 운영 개념이라 경기 전 로스터 준비와는
  // 무관하다는 게 이 코드베이스의 기존 설계 의도였는데(games.service.ts의 requireTakeover
  // 주석 참고), 그 의도가 참가팀(team_manager/team_owner)에게만 적용되고 스태프
  // (tournament_director/field_operator/support_readonly)에게는 적용되지 않는 비대칭이
  // 있었다 -- saveLineup은 토큰 없이 통과하는데 submitLineup만 스태프에게 토큰을 요구해
  // 라인업 화면이 토큰을 얻지도 보내지도 않는 알파에서 제출이 구조적으로 막혔다. 이제
  // game.state === SCHEDULED(경기 시작 전)일 때만 스태프도 면제되고, 라이브로 전환된
  // 뒤(LIVE/PAUSED/ENDED/CANCELLED)에는 두 운영자의 충돌을 막기 위해 기존대로 토큰이
  // 필요하다 (games.service.ts의 staffLineupSubmitRequiresTakeover 참고). 아래 두 테스트는
  // 그 새 계약으로 뒤집혔고, 세 번째는 라이브 전환 이후에도 안전장치가 살아있는지 고정한다.
  it('경기가 아직 시작되지 않았으면(SCHEDULED) 스태프도 인계 토큰 없이 라인업을 제출할 수 있다', async () => {
    const dto: SubmitGameLineupDto = { expectedVersion: 1, clientCommandId: 'task18-submit-no-token' };
    const submitted = await lineupService.submitLineup(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
      lineupId,
      dto.clientCommandId,
      dto,
    );
    expect(submitted).toEqual(expect.objectContaining({ lineupId, lineupState: 'SUBMITTED', replayed: false }));
  });

  it('토큰 없이 제출한 커맨드를 그대로 재생해도 멱등하게 동일 응답을 반환하고, 영속 상태를 중복 변경하지 않는다 (regression for review finding #15: counting rows by lineup id alone cannot prove a replay did not silently duplicate a version bump or another durable side effect while the row count coincidentally stayed the same)', async () => {
    // 바로 위 테스트가 이미 'task18-submit-no-token'을 실제로 제출했다(토큰 없이, SCHEDULED
    // 면제). 여기서는 그 동일 clientCommandId를 동일 payload로 다시 호출해 idempotency
    // 조회가 replay로 단락되는지 확인한다 -- withCommand()는 replay를 실제 버전 검증/뮤테이션
    // 전에 가로채므로(games.service.ts), 재생 호출은 이후 커맨드가 game.version을 이미
    // 앞으로 옮겨놨어도 안전해야 한다.
    const dto: SubmitGameLineupDto = { expectedVersion: 1, clientCommandId: 'task18-submit-no-token' };

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
      dto.clientCommandId,
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
    const submitAgainTakeover = await gamesService.requestTakeover(authUser(lineupIds.director), gameId, {
      clientInstanceId: 'task18-submit-again-client',
      lastSequence: 0,
    });
    const dto: SubmitGameLineupDto = {
      expectedVersion: 1,
      clientCommandId: 'task18-submit-again',
      takeoverToken: submitAgainTakeover.takeoverToken,
    };
    const denied = await captureFailure(() =>
      lineupService.submitLineup(
        authUser(lineupIds.director),
        lineupIds.tournament,
        lineupIds.fixture,
        lineupId,
        dto.clientCommandId,
        dto,
      ),
    );
    expectHttpError(denied, 409, 'INVALID_LINEUP_STATE');
  });

  // 2026-08-11 owner decision (see comment above 'normalizes fixture existence...'): field_operator
  // now holds 'lineup_mutate' when its assignment is scoped to the fixture, exactly like
  // `lineupIds.fieldOperator` set up in this block's beforeAll (fixture-scoped to `lineupIds.fixture`).
  // Uses `awaySideId` (never touched by the tests above) and a freshly-read game version, so this
  // does not perturb the homeSideId capture/submit/replay chain those tests hardcode
  // expectedVersion against.
  //
  // 병합 메모(2026-08-11): 이 테스트는 원래 "이 describe 블록의 마지막"을 전제로 쓰였는데,
  // 아래 라이브 전환 테스트가 `game.state`를 LIVE로 **직접 바꾸는 파괴적 셋업**이라 그보다
  // 앞에 둔다. 순서를 뒤집으면 이 테스트가 LIVE 상태의 게임에 저장을 시도하게 되어
  // 검증 대상(권한)이 아니라 상태 게이트에 걸릴 수 있다.
  it('allows lineup capture by a field_operator scoped to the fixture (2026-08-11: lineup_mutate granted)', async () => {
    const dto: SaveGameLineupDto = {
      expectedVersion: 0,
      clientCommandId: 'task18-lineup-field-operator-allowed',
      // Same football-v1 minPlayers:7/maxPlayers:11 roster-size gate as the director capture test
      // above -- a real payload, not the old denial test's `participants: []` placeholder (which
      // only worked because it never reached this validation before the 403).
      participants: Array.from({ length: 7 }, (_, index) => ({
        displayNameSnapshot: `FO Player ${index + 1}`,
        ...(index === 0 ? { position: 'GK' } : {}),
        started: true,
      })),
    };
    const saved = await lineupService.saveLineup(
      authUser(lineupIds.fieldOperator),
      lineupIds.tournament,
      lineupIds.fixture,
      awaySideId,
      dto.clientCommandId,
      dto,
    );
    expect(saved).toEqual(expect.objectContaining({ gameId, lineupRevision: 1, replayed: false }));
  });

  // 오너 결정의 핵심 안전장치: SCHEDULED 면제는 "경기 전 로스터 준비"에만 적용되고, 경기가
  // 라이브로 전환된 뒤(피리어드가 시작된 이후)에는 두 운영자가 라인업을 놓고 충돌하는 것을
  // 막기 위해 스태프도 기존대로 토큰이 필요하다 -- 이 테스트가 없으면 SCHEDULED 면제가
  // 실수로 모든 상태에 적용되도록 조건이 풀려도 아무 테스트도 잡지 못한다. `start` 커맨드를
  // 거치지 않고 game.state를 직접 LIVE로 돌린다: 이 게임은 홈 사이드만 라인업을 제출했고
  // assertLineupsSubmittedForStart는 양쪽 사이드 모두 SUBMITTED/LOCKED를 요구하므로 실제
  // lifecycle로 LIVE에 도달할 수 없다 -- 같은 직접-업데이트 패턴을 이미
  // game-operations-lineup.integration-spec.ts:135가 쓰고 있다.
  //
  // **반드시 이 describe 블록의 마지막에 둘 것** — game.state 를 직접 LIVE 로 바꾸는 파괴적
  // 셋업이라 뒤에 오는 테스트의 전제를 깨뜨린다.
  it('경기가 라이브로 전환된 뒤에는 스태프도 인계 토큰 없이는 여전히 라인업을 제출할 수 없다', async () => {
    await lineupPrisma.v1Game.update({ where: { id: gameId }, data: { state: 'LIVE' } });

    // 버전을 하드코딩하지 않고 그 시점 값을 읽는다. 하드코딩(`expectedVersion: 2`)하면 이 블록에
    // 앞서 게임 버전을 올리는 테스트가 하나라도 추가되는 순간 CAS 가 먼저 걸려 409 가 나고,
    // 정작 검증하려던 403(TAKEOVER_TOKEN_EXPIRED)에는 도달하지 못한다 — 실제로 field_operator
    // 저장 테스트가 앞에 놓이면서 그렇게 깨졌다. 이 테스트의 관심사는 버전이 아니라 인계 토큰이다.
    const current = await lineupPrisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const dto: SubmitGameLineupDto = {
      expectedVersion: current.version,
      clientCommandId: 'task18-submit-live-no-token',
    };
    const denied = await captureFailure(() =>
      lineupService.submitLineup(
        authUser(lineupIds.director),
        lineupIds.tournament,
        lineupIds.fixture,
        lineupId,
        dto.clientCommandId,
        dto,
      ),
    );
    expectHttpError(denied, 403, 'TAKEOVER_TOKEN_EXPIRED');
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

    board = new TournamentOperationsBoardService(incrementalPrisma);
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
  let officialRevisionId: string;

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
    officialRevisionId = revision.id;

    board = new TournamentOperationsBoardService(stableRevPrisma);
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

  it("cannot have the CURRENT official revision's own score/missingScorer change in place -- the database forbids it, which is what makes stableRevision's revision-id component sufficient (Task 18 review P0-5, reclassified)", async () => {
    // The review asked for `stableRevision` to move when the CURRENT official revision's own
    // score/missingScorer change in place, without a new revision and without touching V1Game.
    // That state is UNREACHABLE, and the two facts that make it unreachable are asserted below
    // rather than assumed:
    //
    //   1. `V1Game.currentOfficialRevisionId` is only ever pointed at a revision whose state is
    //      OFFICIAL -- games.service.ts:1309 sets it exclusively when
    //      `target === V1GameResultRevisionState.OFFICIAL`.
    //   2. A revision in a terminal state (CHANGE_REQUESTED / SUPPLEMENT_REQUESTED / REJECTED /
    //      OFFICIAL / VOID) cannot be updated at all: trigger `v1_block_terminal_revision_mutation`
    //      (migration 20260729000100, lines 293-300) raises SQLSTATE 55000 on any UPDATE where
    //      NEW IS DISTINCT FROM OLD.
    //
    // So the content behind `currentOfficialRevisionId` is immutable for as long as that pointer
    // holds, and the only reachable way to change a game's official score is to create a NEW
    // revision and repoint -- which increments V1Game.version in the same statement
    // (games.service.ts:1305-1311) and therefore already moves stableRevision and the watermark.
    //
    // The earlier version of this test tried to perform the in-place mutation and was rejected by
    // the trigger before it could assert anything, so it could never pass. Asserting the invariant
    // is the honest replacement: drop the trigger and this test goes red, which is precisely the
    // condition under which the review's scenario would become real.
    const before = await board.list(stableRevIds.tournament, { limit: 50 });
    const withGameBefore = before.items.find((item) => item.fixtureId === stableRevIds.fixtureWithGame)!;
    expect(withGameBefore.currentScore).toEqual({ home: 2, away: 1 });

    const official = await stableRevPrisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: officialRevisionId },
      select: { state: true },
    });
    expect(official.state).toBe('OFFICIAL');

    // Fact 2, proven against the live database rather than read off the migration file.
    const rejected = await captureFailure(() =>
      stableRevPrisma.v1GameResultRevision.update({
        where: { id: officialRevisionId },
        data: { score: { home: 9, away: 9 }, missingScorer: true },
      }),
    );
    expect(String(rejected)).toContain('terminal result revisions are immutable');

    // Nothing changed, so a second read is byte-identical -- the board's stability guarantee holds
    // by construction here, not by defensive hashing.
    const after = await board.list(stableRevIds.tournament, { limit: 50 });
    const withGameAfter = after.items.find((item) => item.fixtureId === stableRevIds.fixtureWithGame)!;
    expect(withGameAfter.currentScore).toEqual({ home: 2, away: 1 });
    expect(withGameAfter.stableRevision).toBe(withGameBefore.stableRevision);
    expect(after.watermark).toBe(before.watermark);
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
    );

    const page = await board.list(perfIds.tournament, { limit: 100 });
    expect(page.items).toHaveLength(PERF_FIXTURE_COUNT);

    // Exactly the fixed set of MODEL-level round-trips list() documents: 1 fixture page read, 2
    // lineup/side reads, 1 staff-coverage read -- four, regardless of how many of the 100 rows
    // have games/lineups (all batched via `IN` clauses). Sorted before comparison so this isn't
    // coupled to incidental Promise.all dispatch ordering -- what matters is the SET and COUNT of
    // distinct round-trips, not their sequence.
    //
    // Task 18 review P1-6: the escalation summary no longer appears here as
    // 'V1ResultEscalation.findMany' -- it now runs as a single DB-side `GROUP BY` aggregate via
    // `tx.$queryRaw` (see `escalationSummaryByGameId()`), which this `$allModels.$allOperations`
    // hook does not intercept (raw queries are a separate Prisma extension surface, not a "model"
    // operation). It is still exactly one additional round-trip -- just not one this particular,
    // model-scoped instrumentation observes. The next test below proves the escalation aggregate
    // itself stays correct (and therefore still bounded to one summary row per game, not one row
    // per historical escalation) even with many escalation rows for a single game.
    //
    // Task 10 cutover cleanup: the fifth round-trip this count used to include,
    // `V1GameOperationFlag.findUnique` (the retired `GAME_READ` mode read), is gone -- `list()` no
    // longer reads any operation flag at all, see tournament-operations-board.service.ts's
    // "Retired: GAME_READ compare/legacy read authority" doc section.
    //
    // Task 165 BE-2: `V1Tournament.findFirst` joined this list. `list()` must know whether the
    // competition is a **regular-league mirror** before it can decide which table holds its
    // matches (`V1TournamentFixture` for tournaments, `V1TeamMatch` for leagues). It is ONE
    // constant round-trip per page -- it does not grow with page size, which is exactly what
    // this test defends. The count moving 4 -> 5 is the intended new contract, not a regression;
    // an N+1 regression would show up as a per-row multiple, not a fixed +1.
    expect(queryLog).toHaveLength(5);
    expect([...queryLog].sort()).toEqual(
      [
        'V1Tournament.findFirst',
        'V1TournamentFixture.findMany',
        'V1GameLineup.findMany',
        'V1GameSide.findMany',
        'V1TournamentStaffAssignment.findMany',
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
      );

      await board.list(perfIds.tournament, { limit: 100 });

      // Target/ideal bound: exactly 2 lineup rows per game with lineups (1 per side), independent
      // of how many revisions any single side has accumulated over its history.
      const idealLineupRowCount = PERF_FIXTURE_COUNT * 2;
      expect(lineupRowCounts).toEqual([idealLineupRowCount]);
    },
  );

  // Task 18 review P1-6 (escalation aggregate correctness): `escalationSummaryByGameId()` now
  // computes the overdue-boolean/max-version/max-updatedAt summary with a DB-side `GROUP BY`
  // (`$queryRaw`) instead of transferring every historical escalation row to the app and folding
  // them in JS (see that method's doc comment for why "one row per game, not one row per
  // historical escalation" follows structurally from `GROUP BY` itself and isn't re-measured
  // here). What a hand-written raw-SQL rewrite CAN get wrong is the aggregation LOGIC -- this
  // proves that stays correct at a realistic multi-revision depth for one game: many EXTRA,
  // already-RESOLVED historical escalations (on non-current revisions) must not suppress the
  // still-open baseline warning, and a version bump on one of those old, resolved rows must still
  // move `stableRevision` (mirrors the same "ALL escalations, not just open ones, feed the max"
  // contract already proven at n=1 in the dedicated stableRevision describe above, now proven
  // against real multi-row GROUP BY aggregation).
  it('keeps the escalation aggregate correct with many historical revisions/escalations on one game: the still-open baseline warning survives, and an old RESOLVED escalation\'s own version bump still moves stableRevision (Task 18 review P1-6)', async () => {
    const extraHistoricalRevisions = 8;
    const extraEscalationIds: string[] = [];
    for (let i = 0; i < extraHistoricalRevisions; i += 1) {
      const revision = await perfPrisma.v1GameResultRevision.create({
        data: {
          gameId: perfGameIds[0],
          revision: 900 + i,
          state: 'DRAFT',
          score: { home: 0, away: 0 },
          eventsHash: `task18-p1-6-escalation-bound-${i}`,
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'TASK18_P16_TEST_SEED',
        },
      });
      const escalation = await perfPrisma.v1ResultEscalation.create({
        data: {
          resultRevisionId: revision.id,
          kind: 'ESCALATION',
          dueAt: new Date(),
          status: V1EscalationStatus.RESOLVED,
        },
      });
      extraEscalationIds.push(escalation.id);
    }

    const before = await new TournamentOperationsBoardService(
      perfPrisma,
    ).list(perfIds.tournament, { limit: 100 });
    const beforeItem = before.items.find((item) => item.gameId === perfGameIds[0])!;
    // The baseline escalation (seeded in beforeAll) is still PENDING -- amid 8 extra RESOLVED
    // historical rows, the overdue boolean must still correctly reflect it.
    expect(beforeItem.warnings).toContain('RESULT_REVIEW_OVERDUE');

    // Bump an OLD, already-RESOLVED escalation's own version -- this does not touch the boolean
    // (still overdue either way) or V1Game at all, so ONLY the GROUP BY's MAX(version) moving can
    // explain stableRevision changing.
    await perfPrisma.v1ResultEscalation.update({
      where: { id: extraEscalationIds[0] },
      data: { version: { increment: 1 } },
    });

    const after = await new TournamentOperationsBoardService(
      perfPrisma,
    ).list(perfIds.tournament, { limit: 100 });
    const afterItem = after.items.find((item) => item.gameId === perfGameIds[0])!;
    expect(afterItem.warnings).toContain('RESULT_REVIEW_OVERDUE');
    expect(afterItem.stableRevision).not.toBe(beforeItem.stableRevision);
  });

  // Task 18 review P1-6 (staff-coverage row-transfer bound): `staffCoverage()` now scopes its
  // `V1TournamentStaffAssignment.findMany` WHERE clause to the CURRENT PAGE's own
  // fieldIds/fixtureIds (see that method's doc comment). This proves it at the database level,
  // not just by checking the final Set contents: an active FIELD_OPERATOR assignment scoped to a
  // field that is NOT on this page must not even be TRANSFERRED from the database -- captured
  // directly via the same per-model query-extension instrumentation the lineup-row-count test
  // above already uses successfully. Pre-fix, this read had no fieldId/fixtureId filter at all and
  // would have returned this assignment too (this tournament otherwise has zero staff
  // assignments, so the pre-fix row count here would have been exactly 1, not 0).
  it("bounds the staff-coverage read to the CURRENT PAGE's own fieldIds/fixtureIds, excluding an active FIELD_OPERATOR assignment scoped to a field outside this page (Task 18 review P1-6)", async () => {
    const config = await perfPrisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    const outOfPageOperatorId = randomUUID();
    const outOfPageFieldId = randomUUID();
    const outOfPageFixtureId = randomUUID();
    await perfPrisma.v1User.create({
      data: {
        id: outOfPageOperatorId,
        email: `task18-p1-6-staff-${outOfPageOperatorId}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await perfPrisma.v1TournamentField.create({
      data: {
        id: outOfPageFieldId,
        tournamentId: perfIds.tournament,
        scopeKey: 'p1-6-out-of-page-field',
        name: 'P1-6 Out Of Page Field',
      },
    });
    // Sorts after every one of the 100 page fixtures (round/fixtureNumber-wise) so it is never
    // itself part of the `limit: 100` page this test queries below.
    await perfPrisma.v1TournamentFixture.create({
      data: {
        id: outOfPageFixtureId,
        tournamentId: perfIds.tournament,
        round: 'zzz-out-of-page',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
      },
    });
    await perfPrisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: perfIds.tournament,
        userId: outOfPageOperatorId,
        role: 'FIELD_OPERATOR',
        fieldId: outOfPageFieldId,
        grantedByUserId: outOfPageOperatorId,
      },
    });

    const assignmentRowCounts: number[] = [];
    const instrumented = perfPrisma.$extends({
      query: {
        v1TournamentStaffAssignment: {
          async findMany({ args, query }) {
            const result = await query(args);
            assignmentRowCounts.push(result.length);
            return result;
          },
        },
      },
    });
    const board = new TournamentOperationsBoardService(
      instrumented as unknown as PrismaService,
    );

    const page = await board.list(perfIds.tournament, { limit: 100 });
    expect(page.items).toHaveLength(PERF_FIXTURE_COUNT);
    expect(page.items.some((item) => item.fixtureId === outOfPageFixtureId)).toBe(false);
    expect(assignmentRowCounts).toEqual([0]);
  });
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
            // Prisma's $allOperations reports `model` with the PascalCase model name from the
            // schema ('V1TournamentFixture'), not the camelCase client property. Comparing against
            // the camelCase form never matched, so the barrier below silently never fired and the
            // tearing assertion passed vacuously.
            if (model === 'V1TournamentFixture' && operation === 'findMany') {
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
  let awaySideAId: string;

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
    const away = await httpPrisma.v1GameSide.create({
      data: { gameId: game.id, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away' },
    });
    awaySideAId = away.id;
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

  it('TournamentOperationsBoardController forwards the guard-established request.tournamentStaff principal into board.list() as a 4th argument, instead of discarding it (Task 18 review P0-2)', async () => {
    // Unit-style, deterministic proof of the controller-side wiring specifically -- the service-
    // level test below proves the recheck itself protects against a stale principal, but that test
    // calls TournamentOperationsBoardService directly and would not notice a regression where the
    // CONTROLLER stops forwarding request.tournamentStaff at all (the pre-fix
    // `return this.board.list(tournamentId, query);`, discarding the guard's own decision).
    const fakePrincipal: TournamentStaffPrincipal = {
      userId: 'controller-wiring-user',
      role: 'tournament_director',
      tournamentId: httpIds.tournamentA,
      fixtureId: null,
      fieldOrCourtId: null,
      authorizationSubject: 'assignment:controller-wiring-fake@0',
      assignmentId: 'controller-wiring-fake-assignment',
      assignmentVersion: 0,
    };
    const listSpy = jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null, watermark: 'w', liveWarnings: [] });
    const controller = new TournamentOperationsBoardController({
      list: listSpy,
    } as unknown as TournamentOperationsBoardService);
    const fakeRequest = { tournamentStaff: fakePrincipal } as unknown as TournamentStaffRequest;
    const query = { limit: 50 } as ListTournamentOperationsQueryDto;

    await controller.list(httpIds.tournamentA, query, fakeRequest);

    expect(listSpy).toHaveBeenCalledWith(httpIds.tournamentA, query, undefined, fakePrincipal);
  });

  it('board.list() denies STAFF_SCOPE_DENIED when the caller-supplied principal\'s own assignment has since been revoked, instead of trusting a principal decided before this call (Task 18 review P0-2)', async () => {
    // A fresh, disposable director assignment for tournamentA -- NOT httpIds.directorA's shared
    // assignment used by every other test in this describe block -- so revoking it here cannot
    // affect any other test.
    const staleDirectorId = randomUUID();
    await httpPrisma.v1User.create({
      data: {
        id: staleDirectorId,
        email: `task18-p02-${staleDirectorId}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    const assignment = await httpPrisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: httpIds.tournamentA,
        userId: staleDirectorId,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        grantedByUserId: httpIds.platformOps,
      },
    });
    const principal: TournamentStaffPrincipal = {
      userId: staleDirectorId,
      role: 'tournament_director',
      tournamentId: httpIds.tournamentA,
      fixtureId: null,
      fieldOrCourtId: null,
      authorizationSubject: `assignment:${assignment.id}@${assignment.version}`,
      assignmentId: assignment.id,
      assignmentVersion: assignment.version,
    };
    const board = new TournamentOperationsBoardService(httpPrisma);

    // This principal is still fully valid right now -- the service must serve it normally.
    await expect(board.list(httpIds.tournamentA, { limit: 50 }, undefined, principal)).resolves.toEqual(
      expect.objectContaining({ items: expect.any(Array) }),
    );

    // Revoke it out-of-band -- simulating a revoke committing after TournamentStaffGuard already
    // decided this exact principal, but before (or during) the board's own transaction.
    await httpPrisma.v1TournamentStaffAssignment.update({
      where: { id: assignment.id },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });

    const caught = await captureFailure(() =>
      board.list(httpIds.tournamentA, { limit: 50 }, undefined, principal),
    );
    expectHttpError(caught, 403, 'STAFF_SCOPE_DENIED');
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

  // 2026-08-11 owner decision: field_operator (fixture-scoped, like `fieldOperatorA` set up in
  // this block's beforeAll) now holds 'lineup_mutate' and gets 200 here, not 403 -- see the
  // Task 18 unit-level lineup describe block's matching comment for the full rationale. The
  // corresponding success case ('allows a field_operator scoped to the fixture...') is placed at
  // the end of this describe block instead of here: a successful save bumps the shared game
  // version, and the very next test below hardcodes `expectedVersion: 0` against `homeSideAId`.

  it('lineup PUT: an authorized director can save a lineup with a matching Idempotency-Key header, returning 200 with the global envelope', async () => {
    const clientCommandId = randomUUID();
    const res = await request(app.getHttpServer())
      .put(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fixtures/${httpIds.fixtureA}/lineup/${homeSideAId}`)
      .set(withUser(httpIds.directorA))
      .set('idempotency-key', clientCommandId)
      .send({
        expectedVersion: 0,
        clientCommandId,
        // football-v1 pins minPlayers:7/maxPlayers:11 — this route now enforces
        // the roster-size gate (previously unvalidated). A minimal-but-valid
        // 7-player roster keeps this HTTP-contract test's actual subject
        // (200 + envelope shape + Idempotency-Key header) exercised.
        participants: Array.from({ length: 7 }, (_, index) => ({
          displayNameSnapshot: `HTTP Player ${index + 1}`,
          ...(index === 0 ? { position: 'GK' } : {}),
          started: true,
        })),
      })
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ gameId: gameAId, replayed: false }),
      }),
    );
  });

  // 2026-08-11 owner decision (see comment above the director save test): field_operator now
  // gets 200, not 403, once its assignment is scoped to the fixture. Placed last and targets
  // `awaySideAId` with a freshly-read game version so it doesn't perturb the director test's
  // hardcoded `expectedVersion: 0` against `homeSideAId` above.
  it('lineup PUT: allows a field_operator scoped to the fixture to save a lineup, returning 200 (2026-08-11: lineup_mutate granted)', async () => {
    const clientCommandId = randomUUID();
    const res = await request(app.getHttpServer())
      .put(`/api/v1/tournament-ops/tournaments/${httpIds.tournamentA}/fixtures/${httpIds.fixtureA}/lineup/${awaySideAId}`)
      .set(withUser(httpIds.fieldOperatorA))
      // Every command mutation route requires Idempotency-Key === body.clientCommandId
      // (game-contract.ts's assertGameCommandContext -- a missing header normalizes to '' and
      // always mismatches). The director save test above sets this; this test must too.
      .set('idempotency-key', clientCommandId)
      .send({
        expectedVersion: 0,
        clientCommandId,
        participants: Array.from({ length: 7 }, (_, index) => ({
          displayNameSnapshot: `FO HTTP Player ${index + 1}`,
          ...(index === 0 ? { position: 'GK' } : {}),
          started: true,
        })),
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
