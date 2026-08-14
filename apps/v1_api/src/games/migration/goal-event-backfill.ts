import { Prisma, PrismaClient, V1GameEventType, V1GameSideKey, V1GameSourceType, V1GameState } from '@prisma/client';
import { canonicalGameCommandPayloadHash } from '../games.service';

/**
 * Operational backfill for the "public goal list is always empty for
 * backfilled matches" bug: the 21 tournament results Task 10
 * (`game-result-backfill.ts`) imported from `v1_tournament_fixture_results`
 * carry their goals only inside `V1GameResultRevision.score.goals[]` (a
 * frozen JSON snapshot) — no `V1GameEvent` rows were ever written for them,
 * because `createImportedGame()` deliberately only writes the Game + sides +
 * result revision (see that file's own header). `PublicTournamentRecordsService`
 * reads goals exclusively from `V1GameEvent` (`buildEvents()`, `loadScorers()`),
 * so every one of these matches renders an empty goal list even though the
 * score itself is correct.
 *
 * This module reads `score.goals[]` off each backfilled game's OFFICIAL
 * revision and writes the missing `V1GameEvent` GOAL rows — nothing else. It
 * never touches a game's score, sides, or lineup, and it never invents data
 * a goal doesn't actually carry (see "no fabrication" notes below).
 *
 * ## Idempotency
 * A game is a candidate for this backfill only while it currently has ZERO
 * `V1GameEvent` rows of type GOAL (`events: { none: { type: 'GOAL' } }` in
 * the candidate query below — the exact same "count the missing relation in
 * SQL" idiom `fixture-game-backfill.ts` already uses for its period/policy
 * backfill). The first successful `apply` run inserts GOAL events for a
 * game, which permanently removes that game from the candidate set for
 * every future run — so a second `apply` call finds zero candidates among
 * the games this run already touched and reports the same counts, and a
 * game that already has real, live-recorded GOAL events (never a backfill
 * candidate at all, since it already has >=1 GOAL event before this module
 * ever runs) is left untouched for the same reason. This single WHERE
 * condition is deliberately what decides BOTH "already backfilled" and
 * "has real live events" — there is no separate marker distinguishing the
 * two, because from this module's perspective they require the identical
 * response (do nothing).
 *
 * ## Participant matching — no fabrication
 * The 21 backfilled games have ZERO `V1GameParticipant` rows: `createImportedGame()`
 * never creates any (confirmed by reading it), and `fixture-game-backfill.ts`'s
 * participant-creating path (`createScheduledGame()`) only ever runs for
 * fixtures that had NO Game row yet — a completed, already-backfilled fixture
 * never reaches it. So for every goal with `playerId !== null` (a legacy
 * scorer who WAS a registered player), there is currently no real
 * `V1GameParticipant` this backfill could honestly point `participantId` at.
 * Inventing one, or borrowing `V1TournamentPlayer.id` in its place (a
 * different entity's id, meaningless as a `V1GameParticipant` reference to
 * every downstream reader), would be exactly the fabrication the task
 * forbids — so these goals are quarantined (`PARTICIPANT_UNRESOLVED`), not
 * inserted. Restoring their identity link is a separate, larger effort
 * (synthesizing lineups/participants for historical games) explicitly out of
 * this module's scope.
 *
 * Goals with `playerId === null`, by contrast, were never claiming a
 * traceable identity in the first place — the schema's own comment on
 * `V1TournamentFixtureGoal.playerName` says as much ("비회원/대타 등 명단에
 * 없는 득점자를 위해 이름은 항상 필수"). Recording these as a GOAL event with
 * `participantId: null` is not a loss of information relative to the
 * source — it is a faithful transcription of it — and the domain layer
 * already has a first-class concept for exactly this
 * (`validateGameResultInvariants()`'s `missingScorer`/`scorerPolicy`, see
 * `game-invariants.ts`). These are inserted.
 *
 * A goal missing its `minute` is quarantined too (`MINUTE_MISSING`):
 * `V1GameEvent.clockMs` is a required, non-null column, and writing `0`
 * for an unknown minute would assert "scored in the first minute", a false,
 * specific claim — not an honest placeholder.
 *
 * ## period / clockMs
 * The legacy table only ever recorded a single match-minute per goal, never
 * a half/period. No derivation from minute -> period exists anywhere in this
 * codebase (confirmed by reading the whole `games/` and `migration/` trees),
 * and inventing a 45-minutes-per-half split would assume a fixed period
 * length that this platform's own `V1CompetitionConfigVersion.periods` does
 * not universally guarantee. Every backfilled GOAL event is therefore
 * written with `period: 1` — a placeholder, not a claim about which half the
 * goal happened in. This is safe specifically because no public read path
 * consumes `period` for a GOAL event's display: `match-detail-content.tsx`
 * only ever renders `formatClock(event.clockMs)`, and
 * `format.ts#formatGoalMinute()` computes the displayed minute as
 * `clockMs / 60_000` directly, with no period offset — so `clockMs` (set to
 * `goal.minute * 60_000`, the one number this migration DOES know precisely)
 * is the only field that reaches the screen, and it reproduces the legacy
 * minute exactly.
 *
 * ## occurredAt
 * The legacy source never recorded a wall-clock instant for a goal, only a
 * match-minute. Mirrors `game-result-backfill.ts`'s own precedent for this
 * exact situation (it stamps `createdAt`/`submittedAt`/`officialAt` all with
 * the one timestamp it actually has, `result.recordedAt`): every backfilled
 * GOAL event's `occurredAt` is the game's own `createdAt` (== the fixture
 * result's `recordedAt`, per `createImportedGame()`) — a real, honest
 * timestamp already on the row, not a fabricated per-goal instant.
 *
 * ## sequence / V1Game.lastSequence
 * Inserted events consume `game.lastSequence + 1, +2, ...` in `score.goals[]`
 * order (skipping quarantined goals — they never reserve a sequence number),
 * and `V1Game.lastSequence` is bumped to the last sequence actually written,
 * inside the SAME transaction as the inserts — exactly the invariant the
 * live `appendEvent()` path maintains, so nothing downstream that reads
 * `lastSequence` (gap detection, polling) can observe skew.
 */

export type GoalEventBackfillQuarantineReason =
  | 'CORRUPT_SCORE'
  | 'MINUTE_MISSING'
  | 'PARTICIPANT_UNRESOLVED'
  | 'SIDE_MISSING';

export type GoalEventBackfillQuarantine = {
  gameId: string;
  // -1 marks a whole-score failure (the JSON itself doesn't parse as a valid
  // ScoreSnapshot) that isn't attributable to any single goal; every other
  // value is the goal's index within `score.goals[]`.
  goalIndex: number;
  reason: GoalEventBackfillQuarantineReason;
};

export type GoalEventBackfillCounts = {
  gamesEligible: number;
  gamesWithEventsCreated: number;
  eventsCreated: number;
  quarantined: number;
};

export type GoalEventBackfillResult = {
  counts: GoalEventBackfillCounts;
  quarantine: GoalEventBackfillQuarantine[];
};

type LegacyGoal = {
  team: 'home' | 'away';
  playerId: string | null;
  playerName: string;
  minute: number | null;
};

// Structural input for the pure planning step below — deliberately plain
// data (no Prisma types), so `planGameGoalEvents()` is unit-testable without
// a database.
export type GameGoalCandidate = {
  gameId: string;
  lastSequence: number;
  createdAt: Date;
  goals: readonly LegacyGoal[];
  sides: ReadonlyArray<{ id: string; sideKey: V1GameSideKey }>;
  participants: ReadonlyArray<{ id: string; sideId: string; displayNameSnapshot: string }>;
};

export type GoalEventInsert = {
  gameId: string;
  sequence: number;
  clientEventId: string;
  payloadHash: string;
  sideId: string;
  participantId: string | null;
  period: number;
  clockMs: number;
  occurredAt: Date;
  actorUserId: string;
  payload: { source: 'GOAL_BACKFILL_V1'; legacyPlayerName: string };
};

const ACTOR_SYSTEM_ID = 'SYSTEM:GOAL_EVENT_BACKFILL';
const CLIENT_EVENT_ID_PREFIX = 'GOAL_BACKFILL';
// See the "period / clockMs" section of the header doc for why this is
// always 1, and why that's safe.
const BACKFILL_PERIOD = 1;

function sideKeyFor(team: 'home' | 'away'): V1GameSideKey {
  return team === 'home' ? V1GameSideKey.HOME : V1GameSideKey.AWAY;
}

/**
 * Pure decision layer: given one game's already-extracted goal list, sides,
 * and (usually empty, see header doc) participants, decides exactly which
 * `V1GameEvent` rows to insert and which goals to quarantine instead. No I/O.
 */
export function planGameGoalEvents(candidate: GameGoalCandidate): {
  toInsert: GoalEventInsert[];
  quarantine: GoalEventBackfillQuarantine[];
} {
  const sideByKey = new Map(candidate.sides.map((side) => [side.sideKey, side] as const));
  const quarantine: GoalEventBackfillQuarantine[] = [];
  const toInsert: GoalEventInsert[] = [];
  let sequence = candidate.lastSequence;

  candidate.goals.forEach((goal, goalIndex) => {
    const side = sideByKey.get(sideKeyFor(goal.team));
    if (side === undefined) {
      // Defensive: every backfilled fixture-sourced game is created with
      // both HOME and AWAY sides (see game-result-backfill.ts's
      // createImportedGame() and isValidFixture()'s requirement that both
      // registrations exist), so this should be unreachable through the
      // normal candidate path — kept as a real, tested guard rather than a
      // silent `continue` so a future change that relaxes that guarantee
      // fails loudly (as a quarantine entry, not a wrong-side event) instead
      // of writing a GOAL event on the wrong side of the scoreboard.
      quarantine.push({ gameId: candidate.gameId, goalIndex, reason: 'SIDE_MISSING' });
      return;
    }
    if (goal.minute === null) {
      quarantine.push({ gameId: candidate.gameId, goalIndex, reason: 'MINUTE_MISSING' });
      return;
    }

    let participantId: string | null = null;
    if (goal.playerId !== null) {
      const matches = candidate.participants.filter(
        (participant) =>
          participant.sideId === side.id &&
          participant.displayNameSnapshot.trim() === goal.playerName.trim(),
      );
      if (matches.length !== 1) {
        // Zero matches (the overwhelmingly common case today, see header
        // doc) or an ambiguous multi-match are both "can't safely resolve
        // this identity" — neither should silently degrade to a nameless
        // event when the source explicitly claimed a real scorer.
        quarantine.push({ gameId: candidate.gameId, goalIndex, reason: 'PARTICIPANT_UNRESOLVED' });
        return;
      }
      participantId = matches[0].id;
    }

    sequence += 1;
    const clockMs = goal.minute * 60_000;
    const payload = { source: 'GOAL_BACKFILL_V1' as const, legacyPlayerName: goal.playerName };
    const payloadHash = canonicalGameCommandPayloadHash({
      type: V1GameEventType.GOAL,
      sideId: side.id,
      participantId,
      period: BACKFILL_PERIOD,
      clockMs,
      occurredAt: candidate.createdAt.toISOString(),
      payload,
    });
    toInsert.push({
      gameId: candidate.gameId,
      sequence,
      clientEventId: `${CLIENT_EVENT_ID_PREFIX}:${candidate.gameId}:${goalIndex}`,
      payloadHash,
      sideId: side.id,
      participantId,
      period: BACKFILL_PERIOD,
      clockMs,
      occurredAt: candidate.createdAt,
      actorUserId: ACTOR_SYSTEM_ID,
      payload,
    });
  });

  return { toInsert, quarantine };
}

type ParsedScore = { kind: 'goals'; goals: LegacyGoal[] } | { kind: 'skip' } | { kind: 'corrupt' };

// Runtime guard over the persisted `V1GameResultRevision.score` JSONB
// column, mirroring game-result-backfill.ts's own validatePersistedScore()/
// isValidScoreShape() defensiveness (that column has no DB-level shape
// constraint). `kind: 'skip'` is NOT an error: a `TEAM_MATCH_COMPLETION_ONLY`
// provenance always carries `goals: []` by construction (this module never
// sees that provenance in practice, since its candidate query is scoped to
// `sourceType: TOURNAMENT_FIXTURE`, but the check stays so a corrupted
// `sourceType`/`score.provenance` pairing degrades to "nothing to do"
// instead of silently mis-parsing).
function parseScoreForGoals(value: Prisma.JsonValue): ParsedScore {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { kind: 'corrupt' };
  const record = value as Record<string, unknown>;
  if (record.provenance !== 'TOURNAMENT_FIXTURE_RESULT') return { kind: 'skip' };
  if (!Array.isArray(record.goals)) return { kind: 'corrupt' };

  const goals: LegacyGoal[] = [];
  for (const raw of record.goals) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'corrupt' };
    const g = raw as Record<string, unknown>;
    if (g.team !== 'home' && g.team !== 'away') return { kind: 'corrupt' };
    if (typeof g.playerName !== 'string' || g.playerName.trim().length === 0) return { kind: 'corrupt' };
    if (g.playerId !== null && typeof g.playerId !== 'string') return { kind: 'corrupt' };
    if (
      g.minute !== null &&
      !(typeof g.minute === 'number' && Number.isSafeInteger(g.minute) && g.minute >= 0)
    ) {
      return { kind: 'corrupt' };
    }
    goals.push({
      team: g.team,
      playerId: (g.playerId as string | null | undefined) ?? null,
      playerName: g.playerName,
      minute: (g.minute as number | null | undefined) ?? null,
    });
  }
  return { kind: 'goals', goals };
}

// Structural subset of PrismaClient — satisfied by both PrismaClient itself
// (dry-run) and a Prisma.TransactionClient (inside the apply transaction),
// mirroring fixture-game-backfill.ts's MigrationReadClient split.
type MigrationReadClient = Pick<PrismaClient, 'v1Game'>;

type CollectedCandidates = {
  gamesEligible: number;
  plans: Map<string, GoalEventInsert[]>;
  quarantine: GoalEventBackfillQuarantine[];
};

/**
 * Single source of truth for what needs doing, read (never written) by both
 * the dry-run path and the first step of the apply transaction — so the two
 * can never report different counts for the same database state (same
 * convention as fixture-game-backfill.ts's collectCandidates()).
 */
async function collectCandidates(client: MigrationReadClient): Promise<CollectedCandidates> {
  const games = await client.v1Game.findMany({
    where: {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      state: V1GameState.ENDED,
      currentOfficialRevisionId: { not: null },
      // The idempotency + "don't touch live games" gate — see the header
      // doc's "Idempotency" section for why one condition covers both.
      events: { none: { type: V1GameEventType.GOAL } },
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      lastSequence: true,
      createdAt: true,
      currentOfficialRevision: { select: { score: true } },
      sides: { select: { id: true, sideKey: true } },
      participants: { select: { id: true, sideId: true, displayNameSnapshot: true } },
    },
  });

  const quarantine: GoalEventBackfillQuarantine[] = [];
  const plans = new Map<string, GoalEventInsert[]>();

  for (const game of games) {
    const score = game.currentOfficialRevision?.score;
    // The WHERE clause above already asserts `currentOfficialRevisionId: {
    // not: null }`, so this relation always resolves in practice — Prisma's
    // generated type still marks it nullable (it can't express that FK
    // constraint at the type level), so this stays a defensive skip rather
    // than a non-null assertion.
    if (score === undefined) continue;
    const parsed = parseScoreForGoals(score);
    if (parsed.kind === 'skip') continue;
    if (parsed.kind === 'corrupt') {
      quarantine.push({ gameId: game.id, goalIndex: -1, reason: 'CORRUPT_SCORE' });
      continue;
    }
    if (parsed.goals.length === 0) continue;

    const { toInsert, quarantine: goalQuarantine } = planGameGoalEvents({
      gameId: game.id,
      lastSequence: game.lastSequence,
      createdAt: game.createdAt,
      goals: parsed.goals,
      sides: game.sides,
      participants: game.participants,
    });
    quarantine.push(...goalQuarantine);
    if (toInsert.length > 0) {
      plans.set(game.id, toInsert);
    }
  }

  return { gamesEligible: games.length, plans, quarantine };
}

function toResult(collected: CollectedCandidates): GoalEventBackfillResult {
  let eventsCreated = 0;
  for (const events of collected.plans.values()) eventsCreated += events.length;
  return {
    counts: {
      gamesEligible: collected.gamesEligible,
      gamesWithEventsCreated: collected.plans.size,
      eventsCreated,
      quarantined: collected.quarantine.length,
    },
    quarantine: collected.quarantine,
  };
}

const SERIALIZABLE_RETRY_LIMIT = 3;

export async function runGoalEventBackfill(
  prisma: PrismaClient,
  input: { mode: 'dry-run' | 'apply' },
): Promise<GoalEventBackfillResult> {
  if (input.mode === 'dry-run') {
    return toResult(await collectCandidates(prisma));
  }

  return withSerializableRetry(prisma, async (tx) => {
    const collected = await collectCandidates(tx);
    for (const [gameId, events] of collected.plans) {
      for (const event of events) {
        await tx.v1GameEvent.create({
          data: {
            gameId: event.gameId,
            sequence: event.sequence,
            clientEventId: event.clientEventId,
            payloadHash: event.payloadHash,
            type: V1GameEventType.GOAL,
            sideId: event.sideId,
            participantId: event.participantId,
            period: event.period,
            clockMs: event.clockMs,
            occurredAt: event.occurredAt,
            actorUserId: event.actorUserId,
            payload: event.payload,
          },
        });
      }
      const lastSequence = events[events.length - 1].sequence;
      await tx.v1Game.update({ where: { id: gameId }, data: { lastSequence } });
    }
    return toResult(collected);
  });
}

async function withSerializableRetry<T>(
  prisma: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableTransactionConflict(error) || attempt === SERIALIZABLE_RETRY_LIMIT) {
        throw error;
      }
    }
  }
  throw new Error('Serializable goal-event backfill retry limit was exhausted');
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}
