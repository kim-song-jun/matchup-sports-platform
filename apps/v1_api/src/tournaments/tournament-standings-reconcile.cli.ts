/**
 * Post-deploy / on-demand CLI that reconciles a tournament's per-group
 * standings (`V1TournamentStanding`, one row per registration per group)
 * against its integrated overall standings (`V1TournamentOverallStanding`,
 * one row per registration for the whole tournament).
 *
 * Group standings are the single source of truth (§7.3 of the design
 * writeup) — `recalculateAndUpsertOverallStandings()` is always called in
 * the same transaction as the group recalculation
 * (`tournament-bracket.service.ts:recalculateStandings`,
 * `GameResultStandingsProjectionService`), so in steady state the two
 * should never drift. This CLI exists as a defence-in-depth audit tool for
 * whenever that invariant is suspected broken (e.g. after a manual DB
 * repair, a partial migration, or a bug in one of those call sites).
 *
 * Usage:
 *
 *   DATABASE_URL=<target> pnpm exec ts-node --transpile-only \
 *     src/tournaments/tournament-standings-reconcile.cli.ts \
 *     --tournament-id <id> [--fix]
 *
 * Without `--fix`: read-only audit. Prints every mismatch as a table and
 * exits 1 if any mismatch was found (0 if clean).
 *
 * With `--fix`: re-derives the overall standings from the current group
 * standings/fixtures via `recalculateAndUpsertOverallStandings` (the same
 * path `recalculateStandings()` uses) and overwrites
 * `V1TournamentOverallStanding` with the recomputed truth. Group standings
 * are never touched by `--fix` — they are the source of truth, not a target
 * of repair. Exits 0 on success.
 */
import { PrismaService } from '../prisma/prisma.service';
import { validateCompetitionConfig } from './competition-config/competition-config';
import { recalculateAndUpsertOverallStandings } from './tournament-overall-standings';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';

export interface StandingTotals {
  registrationId: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface StandingMismatch {
  registrationId: string;
  field: 'points' | 'wins' | 'draws' | 'losses' | 'goalsFor' | 'goalsAgainst' | 'missing' | 'orphan';
  groupValue: number | null;
  overallValue: number | null;
}

const COMPARED_FIELDS = ['points', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst'] as const;

/**
 * 조별 순위를 registrationId 단위로 합산한 값과 통합 순위 저장값을 대조한다.
 * 조별이 단일 진실 원천이므로 불일치 시 통합만 재계산한다.
 */
export function findStandingsMismatches(
  groupTotals: readonly StandingTotals[],
  overallRows: readonly StandingTotals[],
): StandingMismatch[] {
  const summed = new Map<string, StandingTotals>();
  for (const row of groupTotals) {
    const current = summed.get(row.registrationId);
    if (!current) {
      summed.set(row.registrationId, { ...row });
      continue;
    }
    for (const field of COMPARED_FIELDS) current[field] += row[field];
  }

  const overallByReg = new Map(overallRows.map((row) => [row.registrationId, row]));
  const mismatches: StandingMismatch[] = [];

  for (const [registrationId, expected] of summed) {
    const actual = overallByReg.get(registrationId);
    if (!actual) {
      mismatches.push({ registrationId, field: 'missing', groupValue: expected.points, overallValue: null });
      continue;
    }
    for (const field of COMPARED_FIELDS) {
      if (expected[field] !== actual[field]) {
        mismatches.push({ registrationId, field, groupValue: expected[field], overallValue: actual[field] });
      }
    }
  }

  for (const [registrationId, actual] of overallByReg) {
    if (!summed.has(registrationId)) {
      mismatches.push({ registrationId, field: 'orphan', groupValue: null, overallValue: actual.points });
    }
  }

  return mismatches;
}

function parseArgs(argv: readonly string[]): { tournamentId: string; fix: boolean } {
  let tournamentId: string | undefined;
  let fix = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tournament-id') {
      tournamentId = argv[i + 1];
      i += 1;
    } else if (arg === '--fix') {
      fix = true;
    }
  }
  if (!tournamentId) {
    throw new Error('--tournament-id <id> is required');
  }
  return { tournamentId, fix };
}

function printMismatchTable(mismatches: readonly StandingMismatch[]): void {
  if (mismatches.length === 0) {
    process.stdout.write('조별↔통합 순위 대조 결과: 불일치 없음\n');
    return;
  }
  process.stdout.write(`조별↔통합 순위 대조 결과: 불일치 ${mismatches.length}건\n`);
  process.stdout.write('registrationId\tfield\tgroupValue\toverallValue\n');
  for (const mismatch of mismatches) {
    process.stdout.write(
      `${mismatch.registrationId}\t${mismatch.field}\t${mismatch.groupValue}\t${mismatch.overallValue}\n`,
    );
  }
}

async function main(): Promise<void> {
  const { tournamentId, fix } = parseArgs(process.argv.slice(2));

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const tournament = await findTournamentOnSurface(prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      include: { competitionConfig: true },
    });
    if (!tournament) {
      throw new Error(`Tournament not found: ${tournamentId}`);
    }
    if (!tournament.competitionConfigVersionId) {
      throw new Error(`Tournament has no active competition config version: ${tournamentId}`);
    }
    const config = validateCompetitionConfig(tournament.competitionConfig);
    const competitionConfigVersionId = tournament.competitionConfigVersionId;

    const groups = await prisma.v1TournamentGroup.findMany({
      where: { tournamentId, phase: 'group' },
      include: {
        groupTeams: { orderBy: { registrationId: 'asc' } },
        fixtures: {
          where: { status: 'completed' },
          include: {
            game: { select: { currentOfficialRevision: { select: { state: true, score: true } } } },
            result: {
              select: { homeScore: true, awayScore: true, hasPenalty: true, homePenaltyScore: true, awayPenaltyScore: true },
            },
          },
        },
      },
    });

    const groupStandings = await prisma.v1TournamentStanding.findMany({
      where: { group: { tournamentId, phase: 'group' } },
      select: {
        registrationId: true,
        points: true,
        wins: true,
        draws: true,
        losses: true,
        goalsFor: true,
        goalsAgainst: true,
      },
    });
    const overallStandings = await prisma.v1TournamentOverallStanding.findMany({
      where: { tournamentId },
      select: {
        registrationId: true,
        points: true,
        wins: true,
        draws: true,
        losses: true,
        goalsFor: true,
        goalsAgainst: true,
      },
    });

    const mismatches = findStandingsMismatches(groupStandings, overallStandings);
    printMismatchTable(mismatches);

    if (!fix) {
      process.exitCode = mismatches.length > 0 ? 1 : 0;
      return;
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await recalculateAndUpsertOverallStandings(
        tx,
        { tournamentId, configVersionId: competitionConfigVersionId, config, groups },
        now,
      );
    });
    process.stdout.write(`통합 순위를 재계산해 저장했어요 (recalculatedAt=${now.toISOString()})\n`);
    process.exitCode = 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
