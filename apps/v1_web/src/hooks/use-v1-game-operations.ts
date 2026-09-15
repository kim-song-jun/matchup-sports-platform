import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { retryTransientFailure, v1Get, v1Patch, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  FixtureLineupResponse,
  GameCommandName,
  GameCommandRequest,
  GameDetail,
  GameEventsBackfill,
  GameLineup,
  GameMutationResult,
  GameRevisionMutationResult,
} from '@/types/game-operations';

/**
 * Task 21 — REST reads/commands for the live tournament operations console.
 * `POST /games/:gameId/commands/:command` (start/pause/resume/end/end-period/
 * start-period/revert-period — 이슈 #375) and the
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
 * 명단 검인(체크인) 토글. 1차 대회 회고 "명단 검인 과정에서 오지 않거나, 하지 않은
 * 사람들에 대한 확인이 어려움".
 *
 * 라인업 저장/제출과 달리 `expectedVersion`·idempotency 헤더를 보내지 않는다 —
 * 서버도 이 경로를 라인업 revision 과 분리해 두었다(GamesService.setParticipantArrival).
 * 킥오프 직전 여러 명을 연달아 누르는 조작이라 버전 커맨드로 만들면 두 번째 사람부터
 * 곧바로 409 가 난다.
 *
 * 콘솔이 읽는 목록(fixtureLineup)과 팀매치 경량 콘솔이 읽는 목록(gameOperationsLineup)
 * 둘 다 무효화한다 — 같은 참가자를 서로 다른 두 경로가 보여주므로 한쪽만 갱신하면
 * 화면에 따라 체크 상태가 엇갈린다.
 */
export function useV1SetParticipantArrival(
  gameId: string | null,
  scope: { tournamentId: string; fixtureId: string } | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { participantId: string; arrived: boolean }) =>
      v1Patch<{ id: string; sideId: string; arrivedAt: string | null }>(
        `/games/${gameId}/participants/${vars.participantId}/arrival`,
        { arrived: vars.arrived },
      ),
    onSuccess: () => {
      if (gameId) queryClient.invalidateQueries({ queryKey: v1Keys.gameOperationsLineup(gameId) });
      if (scope) {
        queryClient.invalidateQueries({
          queryKey: v1Keys.fixtureLineup(scope.tournamentId, scope.fixtureId),
        });
      }
    },
  });
}

/**
 * T3 추가 — 양쪽 사이드 라이브 라인업. 대회 콘솔이 쓰는 useV1FixtureLineup과
 * 달리 tournamentId/fixtureId가 필요 없다(gameId만으로 조회, GamesService.
 * listOperationsLineups). 팀매치 경량 콘솔(Task 10)이 소비한다.
 */
export function useV1GameOperationsLineup(gameId: string | null) {
  return useQuery({
    queryKey: v1Keys.gameOperationsLineup(gameId ?? ''),
    queryFn: () => v1Get<GameLineup[]>(`/games/${gameId}/operations-lineup`),
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
