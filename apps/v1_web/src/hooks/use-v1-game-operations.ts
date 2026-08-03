import { useQuery } from '@tanstack/react-query';
import { retryTransientFailure, v1Get, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  FixtureLineupResponse,
  GameCommandName,
  GameCommandRequest,
  GameDetail,
  GameEventsBackfill,
  GameMutationResult,
  GameRevisionMutationResult,
} from '@/types/game-operations';

/**
 * Task 21 — REST reads/commands for the live tournament operations console.
 * `POST /games/:gameId/commands/:command` (start/pause/resume/end) and the
 * fixture-scoped lineup read are the only REST surfaces this console needs
 * beyond the `/game-operations` socket (event append itself goes through the
 * socket-first path in `use-v1-game-operations-console.ts`, falling back to
 * the durable local queue when offline).
 */

export function useV1FixtureLineup(tournamentId: string, fixtureId: string) {
  return useQuery({
    queryKey: v1Keys.fixtureLineup(tournamentId, fixtureId),
    queryFn: () =>
      v1Get<FixtureLineupResponse>(
        `/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/lineup`,
      ),
    enabled: Boolean(tournamentId) && Boolean(fixtureId),
    retry: retryTransientFailure,
  });
}

export function useV1Game(gameId: string | null) {
  return useQuery({
    queryKey: v1Keys.game(gameId ?? ''),
    queryFn: () => v1Get<GameDetail>(`/games/${gameId}`),
    enabled: Boolean(gameId),
    retry: retryTransientFailure,
  });
}

export function useV1GameEventsBackfill(gameId: string | null, afterSequence: number) {
  return useQuery({
    queryKey: [...v1Keys.gameEvents(gameId ?? ''), afterSequence] as const,
    queryFn: () =>
      v1Get<GameEventsBackfill>(`/games/${gameId}/events`, { afterSequence }),
    enabled: Boolean(gameId),
    retry: retryTransientFailure,
  });
}

/**
 * `start`/`pause`/`resume`/`end` — always REST, always online-only (D-10:
 * "start/pause/resume/end/officialize require online server
 * acknowledgement"). This function throws (rejects) exactly like any other
 * network failure when offline; the caller must NOT wrap this in the
 * offline queue (`assertQueueable()` in `lib/game-operations-queue.ts`
 * enforces that these command kinds can never even be constructed as a
 * queued item).
 */
export function postV1GameCommand(
  gameId: string,
  command: GameCommandName,
  body: GameCommandRequest,
): Promise<GameMutationResult | GameRevisionMutationResult> {
  return v1Post<GameMutationResult | GameRevisionMutationResult>(
    `/games/${gameId}/commands/${command}`,
    body,
    { headers: { 'Idempotency-Key': body.clientCommandId } },
  );
}
