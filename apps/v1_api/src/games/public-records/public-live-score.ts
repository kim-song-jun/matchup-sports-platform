import type { V1GameEventType } from '@prisma/client';
import type { GameScore } from '../games.types';

/**
 * Lane 1 (관전자 라이브 스코어), 2026-08 -- root-cause fix.
 *
 * Before this file: `PublicTournamentRecordsService` only ever read
 * `game.currentOfficialRevision.score`, and for a `TOURNAMENT_FIXTURE` game
 * that revision is created exactly once, by `GamesService.deriveTournamentRevision`,
 * the instant the game transitions to `ENDED` (`games.service.ts`). So while a
 * tournament fixture was genuinely `LIVE` -- goals already recorded by the
 * operator, `V1GameEvent` rows already in the database -- every public read
 * (`GET /tournaments/:id/schedule`, `GET /tournaments/:id/matches/:fixtureId`)
 * returned `score: null` and rendered "- : -", even though the operations
 * console showed the real score the entire time (it reads its own captured
 * event list directly, never `currentOfficialRevision`). This silently broke
 * D-06's own frozen contract ("`live` exposes policy-eligible lineup/score/
 * events", `docs/api/domains/games.md`) for the one state --live play-- a
 * spectator most wants the score for.
 *
 * `tallyLiveScore` closes that gap by tallying unreversed `GOAL` events into a
 * running scoreline, for use ONLY while the fixture has no official revision
 * yet (i.e. is still genuinely in progress). It deliberately mirrors
 * `GamesService.scoreFromEvents` (private, `games.service.ts`) algorithm-for-
 * algorithm rather than importing it: that method is private to a large,
 * actively-worked-on write-side service, and this lane's read path only ever
 * needs the pure tally, never any of that service's command/transaction
 * machinery. Both independently exclude an event whose `id` appears as some
 * other event's `reversesEventId` (a corrected/undone goal) from the count,
 * so a goal recorded then reversed mid-match never inflates the live score
 * shown here -- and never disagrees with the official score
 * `deriveTournamentRevision` computes from the exact same rule once the game
 * ends.
 */
export function tallyLiveScore(
  events: readonly {
    readonly id: string;
    readonly type: V1GameEventType;
    readonly sideId: string | null;
    readonly reversesEventId: string | null;
  }[],
  sideKeyById: ReadonlyMap<string, 'HOME' | 'AWAY'>,
): GameScore {
  const reversed = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
  );
  let home = 0;
  let away = 0;
  for (const event of events) {
    if (event.type !== 'GOAL' || event.sideId === null || reversed.has(event.id)) continue;
    // HOME 이 아닌 것을 전부 AWAY 로 몰면, sideId 가 맵에 없는 경우(다른 경기의 side
    // id 가 섞이거나 side 행이 지워진 이상 데이터)까지 원정팀 골로 잘못 집계된다 —
    // 관전자에게 보이는 숫자라 조용히 틀리면 안 된다. 아는 두 값만 센다.
    const sideKey = sideKeyById.get(event.sideId);
    if (sideKey === 'HOME') {
      home += 1;
    } else if (sideKey === 'AWAY') {
      away += 1;
    }
  }
  return { home, away };
}
