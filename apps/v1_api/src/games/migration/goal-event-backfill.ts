import { Prisma, PrismaClient, V1GameEventType, V1GameSideKey, V1GameSourceType, V1GameState } from '@prisma/client';
import { canonicalGameCommandPayloadHash } from '../games.service';
import { GOAL_BACKFILL_EVENT_SOURCE } from '../../tournaments/tournament-fixture-official-result';

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
 * ## Idempotency — per goal, not per game
 * Every event this module writes carries a deterministic `clientEventId`,
 * `GOAL_BACKFILL:<gameId>:<goalIndex>`, where `goalIndex` is the goal's
 * position in the frozen `score.goals[]` array. The candidate query reads
 * back the ones already present for each game and `planGameGoalEvents()`
 * skips exactly those goals, so a rerun fills only the holes and re-inserts
 * nothing. `V1GameEvent`'s `@@unique([gameId, clientEventId])`
 * (`v1_game_events_game_client_event_key`) is the database-level backstop
 * for that same rule.
 *
 * This replaced an earlier GAME-level gate (`events: { none: { type: 'GOAL'
 * } }` in the candidate WHERE clause), which dropped a game from the
 * candidate set the instant it held any GOAL event at all. That made a
 * partial backfill permanent: a single run can insert some of a game's goals
 * and quarantine others (see below), and under the game-level gate those
 * quarantined goals could never be retried afterwards — not even once the
 * cause was resolved — because the game itself was gone from every future
 * run. Skipping per goal has no such trapdoor, and it also keeps REPORTING
 * the goals that still have no home on each run, instead of letting them
 * vanish from the operational quarantine report just because a sibling goal
 * in the same game succeeded.
 *
 * ### The live-game guards, after that change
 * The game-level gate was also, incidentally, what kept this module away from
 * genuinely live-officiated games (they already hold GOAL events). It was
 * replaced deliberately rather than simply dropped, so three checks stand
 * between this backfill and a live game's event stream:
 *
 * 1. `state: ENDED` — a game still being officiated is never a candidate at
 *    all. (This is the one that makes "live" in the strict, in-progress sense
 *    unreachable; the other two are about games that have since ended.)
 * 2. `currentOfficialRevision.createdBySystemActor = 'GAME_BACKFILL'` — the
 *    direct replacement for the removed gate, and the reason this query still
 *    reads ~21 rows instead of every tournament game ever ended. The WHERE
 *    clause carries the evidence that only Task 10's importer writes it.
 * 3. `parseScoreForGoals()`'s `score.provenance !== 'TOURNAMENT_FIXTURE_RESULT'
 *    -> { kind: 'skip' }`. A game ended through the live `end` command gets
 *    its OFFICIAL revision from `GamesService.deriveTournamentRevision()`,
 *    which writes the flat `{ home, away, penalties? }` score with no
 *    `provenance` key at all — the nested, `provenance`-carrying shape was
 *    only ever written by Task 10's one-time importer
 *    (`game-result-backfill.ts`, since removed from the tree along with the
 *    rest of that migration's implementation).
 *
 * 2 and 3 are independent, and the integration spec pins each on its own
 * fixture (a live-ended game with the flat score; a game carrying the legacy
 * provenance on an operator-authored revision). Do not drop either on the
 * grounds that the other covers it — reasoning of exactly that shape is what
 * left the original gate doing safety work nobody had written down.
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
 * ## A goal with no recorded minute
 * `V1GameEvent.clockMs` is a required, non-null column, so a goal whose
 * legacy `minute` is null has to land on `clockMs: 0` — and `0` alone would
 * assert "scored in the opening minute", a specific claim the source never
 * made. It is written anyway, with the unknown-ness carried as data:
 * `payload.minuteKnown: false`. Read paths key off that marker and surface
 * the minute as `null` ("not recorded"), never as `0`
 * (`deriveTournamentFixtureOfficialGoals()` in
 * `tournaments/tournament-fixture-official-result.ts`, and `buildEvents()`/
 * `loadScorers()` in `games/public-records/public-tournament-records.service.ts`).
 * Because the marker is part of the hashed payload, a genuine minute-0 goal
 * and an unknown-minute goal are also distinguishable to anything hashing
 * the event, rather than collapsing onto one `clockMs: 0` row.
 *
 * Those read paths require `payload.source` to be this module's own
 * `GOAL_BACKFILL_EVENT_SOURCE` before they honour `minuteKnown`, and that is
 * not ceremony: `V1GameEvent.payload` is a free-form object that
 * `AppendGameEventDto` only checks with `@IsObject()`, so a recording client
 * can put any key it likes in there. Keyed on `minuteKnown` alone, a live
 * 71-minute goal whose payload happened to carry that key would have its
 * time erased from the public bracket, timeline and schedule card.
 *
 * These goals used to be quarantined (`MINUTE_MISSING`) on the same "don't
 * fabricate a minute" reasoning, but quarantining is not neutral: combined
 * with the old game-level gate it erased the goal from the event lineage
 * permanently, so the reader saw a game whose goal list silently disagreed
 * with its own score. Recording the goal while recording that its minute is
 * unknown loses nothing the source had.
 *
 * `minuteKnown` is deliberately NOT stamped as `true` on goals whose minute
 * IS known. Idempotency is keyed on `clientEventId`, so rows an earlier run
 * wrote are never rewritten — and every goal an earlier run could have
 * written had a known minute (minute-less ones were quarantined then). A
 * redundant `minuteKnown: true` would therefore leave the same fact recorded
 * two different ways depending on which run happened to write the row.
 * Omitting it keeps the field strictly additive: absent means "known", and
 * it appears only on rows that previously could not exist at all.
 *
 * ## period / clockMs
 * The legacy table only ever recorded a single match-minute per goal, never
 * a half/period. No derivation from minute -> period exists anywhere in this
 * codebase (confirmed by reading the whole `games/` and `migration/` trees),
 * and inventing a 45-minutes-per-half split would assume a fixed period
 * length that this platform's own `V1CompetitionConfigVersion.periods` does
 * not universally guarantee. `V1GameEvent.period` is a non-null column, so
 * every backfilled GOAL event is written with `period: 1` — storage, not a
 * claim about which half the goal happened in.
 *
 * That placeholder must NOT reach a screen, because `period` very much is
 * consumed for a GOAL event's display, in two places:
 *   - `match-detail-content.tsx` groups the timeline into `periodLabel()`
 *     headings, so `period: 1` renders as a literal "전반" heading; and
 *   - `schedule-content.tsx` splits the scorer summary into 전반/후반 rows on
 *     `scorer.period === 1`.
 * Left raw, a legacy 71' goal would be published as "전반 71:00" — a claim
 * about the half that the source never made and that is, for a 71st-minute
 * goal, almost certainly wrong. So the read paths suppress it exactly the way
 * they suppress an unknown minute: `isPeriodUnknown()`
 * (tournaments/tournament-fixture-official-result.ts) recognises this
 * module's `payload.source` and maps `period` to `null`, which both surfaces
 * already have an honest rendering for ("기타" / a separate row). Unlike the
 * minute marker this needs no per-row flag — the source had no period for ANY
 * of these goals — which also means it applies retroactively to rows an
 * earlier run already wrote.
 *
 * `clockMs` is the field that carries real information: for every goal whose
 * legacy minute was recorded it is `goal.minute * 60_000` and reproduces that
 * minute exactly (`format.ts#formatGoalMinute()` divides straight back out,
 * with no period offset). For the minute-less goals it is `0` and the read
 * paths suppress it entirely, per the section above — the screen shows no
 * minute rather than a wrong one.
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
 * Within one run, inserted events consume `game.lastSequence + 1, +2, ...` in
 * `score.goals[]` order (skipping quarantined goals — they never reserve a
 * sequence number), and `V1Game.lastSequence` is bumped to the last sequence
 * actually written, inside the SAME transaction as the inserts — exactly the
 * invariant the live `appendEvent()` path maintains, so nothing downstream
 * that reads `lastSequence` (gap detection, polling) can observe skew.
 *
 * Across runs it does NOT line up with `score.goals[]` order, and that is
 * inherent to per-goal idempotency: if a first run filled goal 1 and a later
 * one fills goals 0 and 2, the sequences read (goal 1, goal 0, goal 2). This
 * is not a defect being tolerated — `sequence` is defined as the order the
 * server RECEIVED events, never as match chronology, which is why every
 * public read path orders by `(period, clockMs, sequence)` and treats
 * `sequence` as a tiebreak only (see the ordering comment in
 * `public-tournament-records.service.ts#buildEvents`, written after an alpha
 * incident caused by sequence-ordering a timeline). The one reader that does
 * order purely by `sequence`, `GamesService.getVisibility()`, is an operator
 * audit view of receive order, and receive order is exactly what it shows.
 */

export type GoalEventBackfillQuarantineReason =
  | 'CORRUPT_SCORE'
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
  /**
   * `clientEventId`s this game already holds for goals a previous run
   * inserted (see the header doc's "Idempotency" section). A required field
   * rather than an optional argument on purpose: a caller that forgot to
   * supply it would silently plan duplicate inserts for every already
   * backfilled goal, and the type system is the cheapest place to make that
   * impossible.
   */
  alreadyInsertedClientEventIds: ReadonlySet<string>;
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
  // `source` is what every read path keys its "this row came from the
  // backfill" rules off (`isPeriodUnknown()`/`isMinuteUnknown()` in
  // tournaments/tournament-fixture-official-result.ts) — hence the shared
  // constant rather than a second copy of the literal. `minuteKnown` is
  // present only (and always) when the legacy minute was missing; see the
  // header doc's "A goal with no recorded minute" for why it is never
  // written as `true`.
  payload: { source: typeof GOAL_BACKFILL_EVENT_SOURCE; legacyPlayerName: string; minuteKnown?: false };
};

const ACTOR_SYSTEM_ID = 'SYSTEM:GOAL_EVENT_BACKFILL';
const CLIENT_EVENT_ID_PREFIX = 'GOAL_BACKFILL';
// See the "period / clockMs" section of the header doc for why this is
// always 1, and why that's safe.
const BACKFILL_PERIOD = 1;

function sideKeyFor(team: 'home' | 'away'): V1GameSideKey {
  return team === 'home' ? V1GameSideKey.HOME : V1GameSideKey.AWAY;
}

function goalClientEventId(gameId: string, goalIndex: number): string {
  return `${CLIENT_EVENT_ID_PREFIX}:${gameId}:${goalIndex}`;
}

/**
 * Pure decision layer: given one game's already-extracted goal list, sides,
 * (usually empty, see header doc) participants, and the set of goals a
 * previous run already inserted, decides exactly which `V1GameEvent` rows to
 * insert and which goals to quarantine instead. No I/O.
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
    // `goalIndex` stays anchored to the goal's position in the frozen
    // `score.goals[]` array — that is what an earlier run built its
    // `clientEventId` from, so filtering the list before enumerating it
    // would shift every id and defeat the skip below.
    const clientEventId = goalClientEventId(candidate.gameId, goalIndex);
    if (candidate.alreadyInsertedClientEventIds.has(clientEventId)) {
      // Settled by an earlier run: no insert, and deliberately no quarantine
      // entry either. A goal that made it in needs no operator attention, and
      // re-reporting it every run would grow the quarantine report without
      // bound while misrepresenting stable data as unresolved.
      return;
    }

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
    // A missing minute parks the event at 0 (the column is non-null) and says
    // so in the payload; see the header doc for why the marker rides along
    // instead of the goal being dropped, and why it is omitted when the
    // minute IS known rather than written as `true`.
    const clockMs = goal.minute === null ? 0 : goal.minute * 60_000;
    const payload = {
      source: GOAL_BACKFILL_EVENT_SOURCE,
      legacyPlayerName: goal.playerName,
      ...(goal.minute === null ? { minuteKnown: false as const } : {}),
    };
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
      clientEventId,
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
// constraint). `kind: 'skip'` is NOT an error: it is the third of the three
// live-game guards (header doc, "The live-game guards, after that change") —
// a live-ended game's revision is the flat `{ home, away }` shape with no
// `provenance` key, so it skips here and is never planned against, whether or
// not it also slipped past the query's `createdBySystemActor` filter. A
// `TEAM_MATCH_COMPLETION_ONLY` provenance (always `goals: []` by
// construction, and never reachable while the candidate query is scoped to
// `sourceType: TOURNAMENT_FIXTURE`) degrades through the same branch, so a
// corrupted `sourceType`/`score.provenance` pairing means "nothing to do"
// instead of a silent mis-parse.
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
      // Deliberately NO `events: { none: { type: 'GOAL' } }` here: that
      // game-level gate made partial backfills permanent (header doc,
      // "Idempotency"). Idempotency is now decided per goal, from the
      // `clientEventId`s selected below.
      //
      // What the removed gate ALSO did, incidentally, was keep the query away
      // from live-officiated games (they hold GOAL events). This filter is its
      // deliberate replacement, and it is a far more direct statement of the
      // same intent: Task 10's importer stamped every revision it wrote with
      // `createdBySystemActor = 'GAME_BACKFILL'`
      // (`IMPORTED_REVISION_SYSTEM_ACTOR` in the since-deleted
      // `game-result-backfill.ts`, readable at `a6d41f68^`), and nothing else
      // in this codebase writes that actor onto a tournament game's official
      // revision — a live `end` command's revision is authored by the operator
      // (`createdByActorType: 'USER'`). So this narrows the candidate set back
      // to "games whose current official result IS one of Task 10's imports"
      // at the database level, instead of loading every ended tournament game
      // ever played (with its sides, participants and events) into memory —
      // and, in apply mode, into a SERIALIZABLE transaction's read set.
      currentOfficialRevision: { is: { createdBySystemActor: 'GAME_BACKFILL' } },
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      lastSequence: true,
      createdAt: true,
      currentOfficialRevision: { select: { score: true } },
      sides: { select: { id: true, sideKey: true } },
      participants: { select: { id: true, sideId: true, displayNameSnapshot: true } },
      // Only this module's own rows: the deterministic prefix keeps the read
      // narrow (a live game's hundreds of events never load) and makes the
      // set exactly "goals a previous run of this backfill already wrote".
      events: {
        where: { clientEventId: { startsWith: `${CLIENT_EVENT_ID_PREFIX}:` } },
        select: { clientEventId: true },
      },
    },
  });

  const quarantine: GoalEventBackfillQuarantine[] = [];
  const plans = new Map<string, GoalEventInsert[]>();
  // "Rows this backfill claims": games that passed BOTH gates — the query's
  // `createdBySystemActor` filter and `parseScoreForGoals()`. Counted here
  // rather than as `games.length` because a `skip` (a score shape this module
  // has no business touching) is not a claim.
  //
  // A CORRUPT_SCORE game IS counted: it is one of Task 10's own rows, this
  // module simply cannot read it, and it needs an operator. Note also what
  // this number is NOT: it does not shrink as work gets done (a fully
  // backfilled game stays claimed, since the goal-level skip happens further
  // in). The "is there work left" signal is `eventsCreated` + `quarantined`
  // both being 0 on a dry run — the CLI's own header points at this file for
  // exactly this kind of question.
  let gamesEligible = 0;

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
    gamesEligible += 1;
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
      alreadyInsertedClientEventIds: new Set(game.events.map((event) => event.clientEventId)),
    });
    quarantine.push(...goalQuarantine);
    if (toInsert.length > 0) {
      plans.set(game.id, toInsert);
    }
  }

  return { gamesEligible, plans, quarantine };
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
