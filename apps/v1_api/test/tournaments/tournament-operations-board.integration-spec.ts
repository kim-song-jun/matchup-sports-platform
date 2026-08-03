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
  staffAssignment: '78000000-0000-4000-8000-000000000060',
  boundaryStaffAssignment: '78000000-0000-4000-8000-000000000061',
} as const;

const PAGINATION_FIXTURE_COUNT = 100;

const prisma = new PrismaService();

/** Mirrors scripts/qa/verify-game-result-cutover.mjs's normalized/hashBody so this spec proves
 * the same byte-identity guarantee the CI cutover harness depends on. */
function normalized(value: unknown): unknown {
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

class StaticGameReadAuthority implements GameReadAuthorityPort {
  constructor(private readonly result: GameReadAuthorityResult) {}
  async resolve(): Promise<GameReadAuthorityResult> {
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

  it('surfaces the full warning set per fixture (split stable items.warnings / time-relative liveWarnings) and supports ?warning= filtering across both groups', async () => {
    const board = new TournamentOperationsBoardService(prisma, new DirectGameReadAuthorityService());
    const full = await board.list(ids.detailTournament, { limit: 50 });
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

    const missingScorerOnly = await board.list(ids.detailTournament, {
      limit: 50,
      warning: 'MISSING_SCORER',
    });
    expect(missingScorerOnly.items.map((item) => item.fixtureId)).toEqual([ids.overdueFixture]);

    // `?warning=` also matches on a time-relative code (RESULT_REVIEW_OVERDUE's sibling test
    // above already proves a stable-code filter; this proves the filter also reaches
    // liveWarnings-only codes, per the "filter must keep working across both groups" contract).
    const noStaffOnly = await board.list(ids.detailTournament, { limit: 50, warning: 'NO_STAFF_ASSIGNED' });
    expect(noStaffOnly.items.map((item) => item.fixtureId).sort()).toEqual(
      [ids.clearFixture, ids.overdueFixture].sort(),
    );
    // The filtered response's own liveWarnings array is filtered to the same fixture set, and
    // still reports the code under liveWarnings, never copied into the matched items' stable
    // warnings array.
    expect(noStaffOnly.liveWarnings.map((entry) => entry.fixtureId).sort()).toEqual(
      [ids.clearFixture, ids.overdueFixture].sort(),
    );
    for (const item of noStaffOnly.items) {
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

    const stableBody = ({ items, nextCursor, watermark }: Awaited<ReturnType<typeof board.list>>) => ({
      items,
      nextCursor,
      watermark,
    });
    expect(hashBody(stableBody(after))).toBe(hashBody(stableBody(before)));
    // Extra explicit check beyond the hash: no item anywhere gained/lost a stable warning either.
    expect(after.items).toEqual(before.items);

    // liveWarnings for boundaryFixture legitimately flips on both codes across the boundary.
    const liveBefore = before.liveWarnings.find((entry) => entry.fixtureId === ids.boundaryFixture);
    const liveAfter = after.liveWarnings.find((entry) => entry.fixtureId === ids.boundaryFixture);
    expect(liveBefore?.warnings.sort()).toEqual([]);
    expect(liveAfter?.warnings.sort()).toEqual(['LINEUP_NOT_SUBMITTED', 'NO_STAFF_ASSIGNED'].sort());
    expect(hashBody(before.liveWarnings)).not.toBe(hashBody(after.liveWarnings));
  });

  it('keeps the response body byte-identical across GAME_READ legacy/compare/new when the seam reports ok', async () => {
    const okBoard = new TournamentOperationsBoardService(
      prisma,
      new StaticGameReadAuthority({ outcome: 'ok' }),
    );

    await setGameReadFlag('legacy');
    const legacy = await okBoard.list(ids.detailTournament, { limit: 50 });

    await setGameReadFlag('compare');
    const compare = await okBoard.list(ids.detailTournament, { limit: 50 });

    await setGameReadFlag('new');
    const rolled = await okBoard.list(ids.detailTournament, { limit: 50 });

    expect(hashBody(compare)).toBe(hashBody(legacy));
    expect(hashBody(rolled)).toBe(hashBody(legacy));

    await setGameReadFlag('legacy');
  });

  it('fails closed with 409 GAME_RESULT_READ_MISMATCH under GAME_READ=compare when the seam reports a mismatch', async () => {
    const mismatchBoard = new TournamentOperationsBoardService(
      prisma,
      new StaticGameReadAuthority({
        outcome: 'mismatch',
        detail: { entity: `TOURNAMENT_FIXTURE:${ids.overdueFixture}`, revision: 'seed-revision', field: 'score.regulation.home' },
      }),
    );
    await setGameReadFlag('compare');

    let caught: unknown;
    try {
      await mismatchBoard.list(ids.detailTournament, { limit: 50 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getStatus()).toBe(409);
    expect((caught as ConflictException).getResponse()).toEqual(
      expect.objectContaining({ code: 'GAME_RESULT_READ_MISMATCH' }),
    );

    await setGameReadFlag('legacy');
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

  it('assigns and reassigns a fixture to a field without duplicating field rows, then clears it', async () => {
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

    const assigned = await fieldsService.assignFixtureField(
      fieldIds.director,
      fieldIds.tournament,
      fieldIds.fixture,
      { fieldId: courtA.id } as AssignTournamentFixtureFieldDto,
      { requestId: randomUUID() },
    );
    expect(assigned).toEqual({ fixtureId: fieldIds.fixture, tournamentId: fieldIds.tournament, fieldId: courtA.id });
    expect((await fieldsService.list(fieldIds.platformOps, fieldIds.tournament)).items).toHaveLength(beforeCount);

    const reassigned = await fieldsService.assignFixtureField(
      fieldIds.director,
      fieldIds.tournament,
      fieldIds.fixture,
      { fieldId: courtB.id } as AssignTournamentFixtureFieldDto,
      { requestId: randomUUID() },
    );
    expect(reassigned.fieldId).toBe(courtB.id);
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

    const cleared = await fieldsService.clearFixtureField(
      fieldIds.director,
      fieldIds.tournament,
      fieldIds.fixture,
      { requestId: randomUUID() },
    );
    expect(cleared).toEqual({ fixtureId: fieldIds.fixture, tournamentId: fieldIds.tournament, fieldId: null });
    expect((await fieldsService.list(fieldIds.platformOps, fieldIds.tournament)).items).toHaveLength(beforeCount);
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

  it('submits the lineup and idempotently replays the identical submit', async () => {
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

    const replay = await lineupService.submitLineup(
      authUser(lineupIds.director),
      lineupIds.tournament,
      lineupIds.fixture,
      lineupId,
      undefined,
      dto,
    );
    expect(replay).toEqual(expect.objectContaining({ lineupId, lineupState: 'SUBMITTED', replayed: true }));

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
