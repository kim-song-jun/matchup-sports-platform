'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';
import {
  assertQueueable,
  canAppendWhileSyncing,
  deserializeQueueState,
  EMPTY_QUEUE_STATE,
  gameOperationsQueueReducer,
  gameSyncReducer,
  hydrateAfterReload,
  INITIAL_SYNC_STATE,
  INITIAL_TAKEOVER_STATE,
  isTakeoverHeld,
  nextQueuedItem,
  serializeQueueState,
  takeoverReducer,
  type GameOperationsQueueState,
  type GameSyncState,
  type QueuedGameEvent,
  type TakeoverState,
} from '@/lib/game-operations-queue';
import { canonicalGameEventPayloadHash } from '@/lib/game-operations-hash';
import {
  isClockDrifted,
  medianOffsetMs,
  pushClockSample,
  serverAlignedNowMs,
  type ClockPingPong,
} from '@/lib/game-operations-clock';
import { getV1GameOperationsSocket, setGameOperationsAuthorizationSubjectVersion } from '@/lib/v1-game-operations-socket';
import { randomUuid } from '@/lib/uuid';
import { reportClientError } from '@/lib/client-error-reporter';
import { v1Keys } from '@/lib/query-keys';
import type { V1MyTournamentStaffResponse } from '@/types/api';
import { myAssignmentVersion } from '@/hooks/use-v1-my-staff-assignments';
import type {
  AssignGoalAssistResult,
  GameEventRecord,
  GameEventType,
  GameState,
  GameTakeoverGrant,
} from '@/types/game-operations';

/**
 * `game.takeover.request` / `game.takeover.renew` 의 ack 응답.
 *
 * 서버(RealtimeGateway)는 `{ status: 'granted', ...GameTakeoverGrant }` 를 보낸다 —
 * 토큰 필드 이름은 `takeoverToken` 이다. 예전에는 이 콜백 인자를
 * `{ status: string; token?: string; ... }` 라는 인라인 리터럴로 적어 두었는데,
 * ack 콜백은 socket.io 쪽에서 타입이 강제되지 않으므로 tsc 가 이 불일치를 잡지 못했다.
 * 그 결과 서버가 granted 를 줘도 `result.token` 이 undefined 라 항상 denied 로 떨어졌고,
 * 화면에는 "이 경기를 운영할 권한이 없어요" 가 떴다(대회 디렉터가 경기를 운영하지 못함).
 * 공유 타입에서 파생시켜 필드가 다시 갈라지면 컴파일이 깨지게 한다.
 */
type GameTakeoverAck =
  | ({ status: 'granted' } & GameTakeoverGrant)
  | { status: 'denied'; code?: string };

const CLOCK_PING_INTERVAL_MS = 15_000;
/**
 * 서버 토큰 TTL(`GAME_TAKEOVER_TOKEN_TTL_MS` = 90초, `game-takeover.service.ts`)
 * 보다 충분히 짧게 잡아, 갱신이 몇 번 실패해도(네트워크 끊김 등) 만료 전에
 * 회복할 여지를 남긴다. 예전 주석은 "30초 최소 갱신 간격을 서버가 강제한다"고
 * 적혀 있었는데 그런 코드는 서버에 존재하지 않는다 — `GameTakeoverService.renew`
 * 에는 스로틀이 없다. 실재하지 않는 제약을 근거로 남겨 두면 다음 사람이 이 값을
 * 못 건드린다.
 */
const TAKEOVER_RENEW_INTERVAL_MS = 20_000;
const TAKEOVER_EXPIRY_CHECK_INTERVAL_MS = 2_000;
/**
 * UX audit item 1 (CRITICAL, 2026-08): `socket.emit(event, payload, ackHandler)`
 * has no built-in timeout — if the socket disconnects (or the server hangs)
 * after the emit but before the ack, `ackHandler` may simply never fire.
 * Before this constant existed, that meant the queue item sat in `sending`
 * forever: `nextQueuedItem()` only ever re-sends `queued` items, so a
 * mid-flight event an operator captured (a goal, a card) could look
 * permanently "전송 중" with no retry button and no way to tell whether it
 * actually landed — recoverable only by a full page reload (which
 * `hydrateAfterReload` resets `sending` → `queued` for). This timeout is the
 * in-session escape hatch: if no ack arrives within this window, the item is
 * force-FAILed with a retryable error code, which surfaces the existing
 * `QueueStatusPanel` retry affordance instead of a silent, permanent stall.
 */
export const SEND_ACK_TIMEOUT_MS = 10_000;
/**
 * `game.subscribe`도 같은 위험을 진다 — 게이트웨이의 `subscribeToGame`은
 * `ForbiddenException`만 `{ status: 'denied' }`로 ack하고 나머지(게임 조회 실패,
 * 일시적 Prisma 오류 등)는 그대로 rethrow하는데, NestJS WS 예외 경로는 `exception`
 * 이벤트만 쏘고 **ack 콜백을 부르지 않는다**. 소켓은 끊기지 않으므로 `disconnect`
 * 리셋도 발화하지 않는다. 아래 재진입 가드가 그대로 래치되면 이후 갭 복구·재구독이
 * 전부 무음 no-op이 되어 콘솔이 새로고침 전까지 아무 것도 기록하지 못한다 —
 * 이 픽스가 없애려던 증상 그 자체다. 그래서 send 경로(`SEND_ACK_TIMEOUT_MS`)와
 * 같은 방식의 탈출구를 둔다.
 */
export const SUBSCRIBE_ACK_TIMEOUT_MS = 10_000;

const QUEUE_PERSIST_FAILED_MESSAGE =
  '이 기기에 기록을 임시 저장하지 못했어요. 지금 기록은 계속 전송되지만, 새로고침하면 아직 전송되지 않은 기록이 사라질 수 있어요.';

/**
 * 전체 이력 스냅숏 안의 첫 시퀀스 구멍. 서버
 * `GamesService.listEvents`(`afterSequence`=0)의 갭 계산과 **같은 규칙**이다 —
 * 1부터 시작해 연속인지만 보고, 꼬리(마지막 이벤트와 `lastSequence` 사이)는 갭으로
 * 치지 않는다(그 구간은 아직 커밋 중인 이벤트일 수 있다). 두 곳이 갈라지면 서버가
 * 보고한 갭과 클라이언트 판정이 어긋나므로 규칙을 바꿀 땐 반드시 함께 바꾼다.
 */
function firstSequenceHole(
  events: readonly GameEventRecord[],
): { expectedSequence: number; availableFrom: number } | null {
  let expected = 1;
  for (const event of events) {
    if (event.sequence > expected) {
      return { expectedSequence: expected, availableFrom: event.sequence };
    }
    expected = event.sequence + 1;
  }
  return null;
}

function queueStorageKey(gameId: string): string {
  return `teameet.v1.gameOps.queue.${gameId}`;
}

function loadPersistedQueue(gameId: string): GameOperationsQueueState {
  if (typeof window === 'undefined') return EMPTY_QUEUE_STATE;
  const raw = window.localStorage.getItem(queueStorageKey(gameId));
  return hydrateAfterReload(deserializeQueueState(raw).items);
}

/**
 * 큐를 localStorage에 박제한다. 실패(대부분 `QuotaExceededError`, 사파리
 * 프라이빗 모드에서는 setItem 자체가 던진다)를 삼키지 않고 호출자에게 알린다 —
 * 예전에는 try/catch가 아예 없어서 이 예외가 **렌더 중 effect에서 그대로 튀어
 * 올라 콘솔 컴포넌트 트리 전체가 언마운트**됐다(경기 도중 화면이 통째로
 * 사라진다). 그렇다고 조용히 삼키면 안 된다: 저장에 실패했다는 건 "새로고침하면
 * 아직 못 보낸 기록이 사라진다"는 뜻이라 운영자가 반드시 알아야 한다. 그래서
 * 여기서는 실패 여부만 돌려주고, 사용자 통지·원격 리포트는 호출한 effect가 한다.
 */
function persistQueue(gameId: string, state: GameOperationsQueueState): boolean {
  if (typeof window === 'undefined') return true;
  try {
    // 확정(acked)된 항목은 저장하지 않는다. 저장의 목적은 오직 "새로고침/탭
    // 종료 뒤 아직 못 끝낸 전송을 다시 시도하는 것"이고(`hydrateAfterReload`의
    // 문서 주석), 확정된 이벤트는 서버 스냅숏(`liveEvents` → RecordedEventList)이
    // 다시 알려준다 — 저장해 둘 이유가 없다. 예전에는 acked까지 그대로 박제해
    // gameId별 키가 그 경기의 전체 이벤트 크기로 부풀었고, 키는 지워지는 일이
    // 없으니 이 기기에서 운영한 경기 수만큼 무한 누적됐다(위 catch가 잡는
    // QuotaExceeded의 실제 원인). 화면(`QueueStatusPanel`)에는 세션 동안 acked
    // 항목이 "기록 완료"로 계속 보인다 — 메모리 큐는 그대로 두고 저장분만
    // 줄인다.
    const durable: GameOperationsQueueState = {
      items: state.items.filter((item) => item.status !== 'acked'),
    };
    window.localStorage.setItem(queueStorageKey(gameId), serializeQueueState(durable));
    return true;
  } catch (error) {
    reportClientError({
      message: error instanceof Error ? error.message : '경기 기록 큐를 저장하지 못했어요.',
      level: 'warn',
      context: { flow: 'v1-game-operations-console', event: 'persistQueue', gameId },
    });
    return false;
  }
}

/** Resolves the CURRENT actor's own tournament-staff assignment version, so
 * the socket handshake can present a value the gateway's `game.subscribe`
 * staleness gate will actually recognize as fresh (see that handler's own
 * doc comment in `RealtimeGateway`). `null` (no row found) is correct and
 * expected for a `platform_ops` admin-bypass actor -- the gateway only
 * enforces this check `when principal.assignmentVersion !== null`.
 *
 * 출처가 `GET /tournament-ops/tournaments/:id/staff`(대회 전역 목록)였는데, 그 라우트는
 * **필드 담당자에게 항상 403**이다(배정에 fixture/field 스코프가 붙어 대회 전역 read가
 * 거부된다). 그래서 정작 현장에서 콘솔을 쓰는 역할만 자기 배정 버전을 못 읽고 0을 제시해,
 * 버전이 0이 아닌 배정이면 소켓 구독·takeover가 STAFF_SCOPE_DENIED로 막혔다. 본인 스코프로
 * 닫힌 `GET /me/tournament-staff`로 바꾼다 — 모든 역할이 같은 경로로 자기 버전을
 * 읽고, 어드민 우회(platform_ops)는 배정 행이 없어 종전대로 null이 된다. */
function useMyTournamentStaffAssignmentVersion(tournamentId: string | null, myUserId: string | undefined) {
  return useQuery({
    queryKey: v1Keys.myTournamentOpsAssignments(),
    queryFn: () => v1Get<V1MyTournamentStaffResponse>('/me/tournament-staff'),
    // 팀매치(tournamentId===null)는 스태프 배정 개념이 없다 — 쿼리 자체를 스킵하고
    // 아래 효과가 항상 0을 기록/전송하게 둔다(그래도 self-consistency 체크는 통과한다).
    enabled: Boolean(tournamentId) && Boolean(myUserId),
    staleTime: 15_000,
    // 한 대회에 배정이 여러 건이면 가장 높은 버전을 쓴다 — 게이트는 "제시값이 서버보다
    // 낮으면 거부"라 최댓값이 안전하다. 배정이 없으면 0(게이트 미적용).
    select: (data) => (tournamentId === null ? 0 : myAssignmentVersion(data, tournamentId)),
  });
}

export type GameOperationsConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface SubmitEventInput {
  readonly type: GameEventType;
  readonly sideId?: string;
  readonly participantId?: string;
  readonly assistParticipantId?: string | null;
  readonly period: number;
  readonly clockMs: number;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface UseV1GameOperationsConsoleOptions {
  // T3 추가: 팀매치는 tournamentId/스태프 배정 개념이 없다 — null이면 아래
  // useMyTournamentStaffAssignmentVersion 쿼리가 스킵되고 버전은 항상 0으로
  // 고정된다(팀매치는 배정 handshake가 필요 없어 언제나 self-consistent하다).
  readonly tournamentId: string | null;
  readonly gameId: string | null;
  readonly myUserId: string | undefined;
  /**
   * 페이지가 REST로 미리 읽어온(`useV1Game`) `gameDetail.data.lastSequence`.
   * **이 값은 소켓 최초 구독의 `afterSequence`로 쓰이면 안 된다** — 이전엔
   * 그렇게 썼고, 그게 alpha 실사고(2026-08)의 원인이었다: 서버에 이미
   * 기록된 이벤트가 있어도(예: 5건) 클라이언트는 그 이벤트를 한 번도 받은
   * 적이 없는데 "거기까지는 이미 안다"고 서버에 알리는 셈이라 서버가 빈
   * 배열을 돌려줬다("아직 기록된 이벤트가 없어요"로 보임, 스코어도 0:0
   * 고정). **모든** `game.subscribe`는 최초 구독이든 재연결/갭 복구든 항상
   * `afterSequence: 0`으로 전체 이력을 받는다(아래 소켓 라이프사이클 effect의
   * `resyncFromServer` 참고). 이 값이 실제로 쓰이는 곳은 두 군데뿐이다:
   * (1) `sync.lastSequence`를 서버가 알고 있는 최신값으로 올려 두는 것
   * (이미 받은 이벤트보다 앞설 때만 반영한다), (2) `requestTakeover`가 서버에
   * 보내는 `lastSequence` 필드(참고용 — 서버가 게이팅에 쓰지 않는다,
   * `GamesService.requestTakeover`).
   *
   * 이 값은 브로드캐스트 중복 판정 기준으로는 **절대** 쓰이지 않는다 — 그 기준은
   * 이벤트 본문을 실제로 받은 시퀀스(`receivedSequenceRef`)다. 숫자를 아는 것과
   * 본문을 받은 것은 다르다.
   */
  readonly initialLastSequence: number;
}

export interface UseV1GameOperationsConsoleResult {
  readonly connectionStatus: GameOperationsConnectionStatus;
  readonly sync: GameSyncState;
  readonly takeover: TakeoverState;
  readonly queue: GameOperationsQueueState;
  readonly clockOffsetMs: number;
  readonly liveEvents: readonly GameEventRecord[];
  readonly gameSnapshot: { readonly version: number; readonly state: GameState } | null;
  readonly bannerMessage: string | null;
  submitEvent(input: SubmitEventInput): Promise<void>;
  retryFailedEvent(clientEventId: string): void;
  requestTakeover(): void;
  /** T3 추가 — 큐를 거치지 않는 온라인 전용 되돌리기(D-10과 같은 이유로 절대
   * 오프라인 큐에 들어가지 않는다). 골/카드/교체 등 일반 이벤트를 되돌릴 때 쓰인다
   * — 어시스트 부착·해제는 더 이상 이 경로를 타지 않는다(아래 assignAssist 참고,
   * 이슈 #376). */
  reverseEvent(input: { eventId: string; reason: string }): Promise<void>;
  /**
   * 이슈 #376 — 이미 기록된 GOAL 이벤트의 assistParticipantId를 원자적으로
   * 채우거나(참가자 id) 지우는(null) 커맨드. `reverseEvent`와 같은 이유로 큐를
   * 거치지 않는 온라인 전용 REST 호출이다(D-10). 예전 `attachAssist`가 하던
   * "reverseEvent로 되돌리고 새 GOAL을 submitEvent로 재제출"하는 2단계 흐름을
   * 완전히 대체한다 — 그 흐름은 두 번째 호출이 첫 번째 호출의 버전 갱신을 아직
   * 반영하지 못한 stale expectedVersion을 큐에 넣어 구조적으로 실패할 수 있었다
   * (GamesService.assignGoalAssist의 문서 주석 참고).
   */
  assignAssist(input: { eventId: string; assistParticipantId: string | null }): Promise<void>;
  /**
   * UX 감사 — `start`/`pause`/`resume`/`end`/`end-period`/`start-period`/
   * `revert-period` 커맨드는 항상 REST로만
   * 처리되고(D-10) 성공해도 게이트웨이가 아무 것도 브로드캐스트하지 않는다
   * (`RealtimeGateway`에 커맨드 성공 emit이 없다 — 이벤트 append만
   * `game.event.committed`를 쏜다). 그래서 명령이 성공해도 `gameSnapshot`은
   * 다음 이벤트 커밋이나 재구독 전까지 그대로였다: alpha 실측(2026-08)에서
   * "재개 완료 · 167ms" 피드백은 떴는데 화면은 계속 "일시 중지"로 남았고
   * 새로고침해야 풀렸다 — `gameState = ops.gameSnapshot?.state ??
   * gameDetail.data?.state`가 gameSnapshot을 우선하므로 REST
   * `gameDetail.refetch()`가 최신 state를 받아와도 화면엔 반영되지 않았다.
   * 호출부는 커맨드 REST 응답(`{ state, version }`)을 받은 즉시 이걸 불러
   * gameSnapshot을 그 자리에서 갱신해야 한다.
   */
  applyCommandResult(result: { state: GameState; version: number }): void;
}

/**
 * Task 21 — the integration hook wiring the pure queue/clock/token reducers
 * (`lib/game-operations-queue.ts`, `lib/game-operations-clock.ts`) to the
 * `/game-operations` socket and durable localStorage persistence. This hook
 * itself is intentionally NOT the target of the QA scenario's Vitest
 * coverage (reload/duplicate-ack/gap/revoke/expiry-reacquire/end-validation)
 * -- those are asserted directly against the pure reducers it calls, which
 * is what makes them assertable without a real socket/browser.
 */
export function useV1GameOperationsConsole(
  options: UseV1GameOperationsConsoleOptions,
): UseV1GameOperationsConsoleResult {
  const { tournamentId, gameId, myUserId, initialLastSequence } = options;
  const queryClient = useQueryClient();

  const [connectionStatus, setConnectionStatus] = useState<GameOperationsConnectionStatus>('connecting');
  const [sync, dispatchSync] = useReducer(gameSyncReducer, INITIAL_SYNC_STATE);
  const [takeover, dispatchTakeover] = useReducer(takeoverReducer, INITIAL_TAKEOVER_STATE);
  const [queue, dispatchQueue] = useReducer(gameOperationsQueueReducer, EMPTY_QUEUE_STATE);
  const [gameSnapshot, setGameSnapshot] = useState<{ version: number; state: GameState } | null>(null);
  const [liveEvents, setLiveEvents] = useState<readonly GameEventRecord[]>([]);
  const [clockSamples, setClockSamples] = useState<readonly ClockPingPong[]>([]);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const clockOffsetMs = useMemo(() => medianOffsetMs(clockSamples), [clockSamples]);

  const myAssignment = useMyTournamentStaffAssignmentVersion(tournamentId, myUserId);
  const clientInstanceIdRef = useRef<string | null>(null);
  // 언마운트 후 SEND_ACK_TIMEOUT_MS 타이머가 뒤늦게 발화해 dispatch하는 것을
  // 막는다 — 화면을 떠난 뒤의 상태 갱신은 의미가 없다.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Queue: hydrate once per gameId, persist on every change ───────────────
  useEffect(() => {
    if (!gameId) return;
    dispatchQueue({ type: 'HYDRATE', items: loadPersistedQueue(gameId).items });
  }, [gameId]);

  // 저장 실패 배너는 **상태가 바뀌는 순간에만** 세우고 지운다. 이 effect의 deps는
  // `[gameId, queue]`라 큐가 바뀔 때마다 다시 도는데, 저장이 계속 실패하는 기기에서
  // 매번 setBannerMessage를 부르면 단일 배너 슬롯(`operate-console.tsx`)을 큐 변경마다
  // 덮어써 '운영 권한이 해제됐어요' 같은 더 급한 공지가 화면에서 사라진다. 반대로
  // 저장이 다시 성공했을 때 지우지 않으면 이미 해소된 경고가 경기 내내 남는다.
  const persistFailedRef = useRef(false);
  useEffect(() => {
    if (!gameId) return;
    if (persistQueue(gameId, queue)) {
      if (!persistFailedRef.current) return;
      persistFailedRef.current = false;
      // 다른 사유로 바뀐 배너까지 지우지 않는다 — 내가 세운 문구일 때만 걷는다.
      setBannerMessage((current) => (current === QUEUE_PERSIST_FAILED_MESSAGE ? null : current));
      return;
    }
    if (persistFailedRef.current) return;
    persistFailedRef.current = true;
    // 저장 실패는 곧 "새로고침하면 아직 못 보낸 기록이 사라진다"는 뜻이다 —
    // 전송 자체는 메모리 큐로 계속되므로 지금 기록을 막지는 않지만, 운영자가
    // 이 사실을 모른 채 새로고침하는 일은 막아야 한다.
    setBannerMessage(QUEUE_PERSIST_FAILED_MESSAGE);
  }, [gameId, queue]);

  // 서버가 확정한 이벤트 시퀀스 중 이 클라이언트가 **본문까지 실제로 받은** 마지막
  // 값. 예전에는 `sync.lastSequence`를 그대로 미러링했는데, 그 값은 REST로 읽어온
  // `initialLastSequence`(아래 effect)로도 올라간다 — 즉 "숫자만 아는" 시퀀스까지
  // 포함됐다. 그래서 REST가 소켓보다 앞서면(`providers.tsx`의
  // `refetchOnWindowFocus: true`로 창 포커스 복귀마다 재발화) 뒤늦게 도착한 그
  // 이벤트의 브로드캐스트가 `onCommitted`에서 "이미 아는 중복"으로 조용히 버려져
  // 화면에 영영 나타나지 않았다. 이 ref는 스냅숏 백필과 브로드캐스트 append —
  // 이벤트 본문이 실제로 손에 들어온 순간 — 에서만 올라간다.
  const receivedSequenceRef = useRef(0);

  useEffect(() => {
    // REST가 알려준 시퀀스는 **이미 받은 이벤트보다 앞설 때만** 반영한다. 뒤처진
    // REST 읽기가 소켓이 이미 확인한 시퀀스를 되돌리면, 그 뒤 도착하는 정상
    // 브로드캐스트가 비연속으로 보여 불필요한 전체 리싱크를 유발한다.
    if (initialLastSequence <= receivedSequenceRef.current) return;
    dispatchSync({ type: 'SNAPSHOT', lastSequence: initialLastSequence });
  }, [initialLastSequence]);

  // `reverseEvent` (T3, REST-only, no offline queue — see that function's own
  // comment) has no realtime broadcast counterpart: `GamesService.
  // reverseEvent` writes the CORRECTION row over REST and nothing emits
  // `game.event.committed` for it (unlike WS-submitted GOAL/CARD/FOUL/
  // SUBSTITUTION appends). Left alone, the operator's own `liveEvents` —
  // and therefore the scoreboard, which derives purely from it — would only
  // pick up a reversal on the next full reload. This ref lets `reverseEvent`
  // (defined outside the gameId-effect below) trigger a full resync of
  // `liveEvents` from the SAME authoritative source a fresh page load uses,
  // set inside that effect and cleared on its cleanup so a call after
  // unmount/gameId-change is a safe no-op.
  const resyncEventsRef = useRef<(() => void) | null>(null);

  // ── Handshake authorization-subject version ────────────────────────────────
  useEffect(() => {
    setGameOperationsAuthorizationSubjectVersion(myAssignment.data ?? 0);
  }, [myAssignment.data]);

  // ── Socket lifecycle: connect, subscribe, listen ───────────────────────────
  useEffect(() => {
    if (!gameId) return undefined;

    const socket = getV1GameOperationsSocket();
    let cancelled = false;
    // 새 경기의 구독을 시작하는 지점이다 — 이전 경기에서 올려 둔 시퀀스를 그대로
    // 들고 가면, 이벤트가 적은 경기로 옮겼을 때 그 경기의 초기 시퀀스가
    // "이미 아는 값"으로 보여 아래 중복 판정이 정상 브로드캐스트를 버린다.
    receivedSequenceRef.current = 0;

    type SubscribeAck = {
      status: string;
      snapshot?: { version: number; state: GameState; lastSequence: number; events: readonly GameEventRecord[] };
    };

    // This effect intentionally depends only on `[gameId]` (resubscribing on
    // every sync/queue change would thrash the connection), so every handler
    // below reads the LATEST received sequence through `receivedSequenceRef`
    // instead of closing over the `sync` state value from whichever render
    // created this effect — a stale closure here would judge contiguity
    // against a sequence far behind reality after the first snapshot.
    const applySnapshot = (snapshot: { version: number; state: GameState; lastSequence: number; events: readonly GameEventRecord[] }) => {
      // 뒤늦게 도착한 **오래된** 스냅숏은 버린다. 재연결과 갭 복구가 겹쳐 구독이 두 번
      // 나가면 서버는 각각 push(`game.snapshot`)와 ack으로 같은 스냅숏을 돌려주므로 한
      // 라운드에 최대 4번이 배달되고, 그 사이 `onCommitted`가 append한 최신 이벤트가
      // 있을 수 있다. 순서 보장이 없으므로 단조성을 여기서 직접 지킨다 — 이게 없으면
      // liveEvents가 과거로 되감기고(그 골이 화면에서 사라진다) `gameSnapshot.version`도
      // 함께 내려가 다음 append가 VERSION_CONFLICT로 튄다.
      if (snapshot.lastSequence < receivedSequenceRef.current) return;
      setGameSnapshot({ version: snapshot.version, state: snapshot.state });
      setLiveEvents(snapshot.events);
      // 스냅숏은 언제나 전체 이력이므로(아래 `resyncFromServer` 참고) 여기서
      // 받은 `lastSequence`까지는 이벤트 본문을 실제로 손에 넣은 것이다.
      receivedSequenceRef.current = snapshot.lastSequence;
      // 동기 상태는 **이 스냅숏 자체**로 판정한다. 서버도 같은 구독 응답에서
      // `game.gap`을 따로 쏘지만(`realtime.gateway.ts`), 그건 같은 스냅숏을 실어 오는
      // ack과 순서 경쟁을 한다 — 나중에 도착한 쪽이 상태를 결정하면 갭이 조용히
      // 풀린다. 스냅숏이 언제나 전체 이력이 된 지금은 클라이언트가 완결성을 직접
      // 판정할 수 있고, 판정 방식은 서버 `GamesService.listEvents`의 갭 계산
      // (afterSequence=0)과 동일하다.
      const hole = firstSequenceHole(snapshot.events);
      if (hole !== null) {
        dispatchSync({ type: 'GAP', expectedSequence: hole.expectedSequence, availableFrom: hole.availableFrom });
        return;
      }
      dispatchSync({ type: 'BACKFILLED', lastSequence: snapshot.lastSequence });
    };

    /**
     * 구독은 **언제나 전체 이력**(`afterSequence: 0`)을 받아온다 — 최초 구독도,
     * 재연결/갭 복구도, REST-only 커맨드 뒤의 강제 재동기화도 전부 같은 경로다.
     *
     * 예전에는 재연결/갭 복구만 "내가 아는 마지막 시퀀스 이후"를 요청하는 별도
     * 경로(`resubscribeFromLastKnownSequence`)를 탔는데, 서버
     * `GamesService.listEvents`는 `sequence > afterSequence`인 **델타만** 주고
     * 클라이언트 `applySnapshot`은 `setLiveEvents(...)`로 **통째 교체**한다 —
     * 즉 재연결 1회마다 이벤트 목록이 통째로 비워졌다(소켓은 모듈 싱글턴이고
     * socket.io v4 기본값이 무한 재연결이라, 콘솔을 오래 켜 두면 반드시 발생).
     * 그러면 `liveEvents`에서만 파생되는 헤더 스코어·누적 파울·교체 잔여·"지금
     * 피치 위"가 전부 무너지고, 그 상태에서 교체를 기록하면 서버가
     * `SUBSTITUTION_OUT_NOT_ON_PITCH` / `SUBSTITUTION_IN_ALREADY_ON_PITCH`로
     * 거부하는데 두 코드 모두 NON_RETRYABLE이라 '다시 시도' 버튼조차 없다
     * (= 새로고침 말고는 복구 수단이 없었다).
     *
     * 전체 전송이 무해한 근거: `listEvents`는 페이징이 없지만 대회 경기 하나의
     * 이벤트는 골/카드/파울/교체 합쳐 수십 건 규모다. 수천 건 단위가 되면
     * 서버에 페이징이 필요하고, 그때는 여기도 함께 바뀌어야 한다.
     *
     * 게이트웨이 `game.subscribe`는 payload에 `afterSequence`가 반드시 있어야
     * 하므로(`realtime.gateway.ts`의 parse 가드) 필드는 그대로 보내되 값은 항상
     * 0이다.
     */
    // 재진입 가드 — connect / game.gap / 비연속 committed 세 트리거가 겹쳐
    // 도착할 수 있고(재연결 직후 밀린 브로드캐스트가 한꺼번에 들어오는 경우가
    // 전형적이다), 이제 매 구독이 전체 이력을 실어 오므로 중복 발사는 그냥
    // 낭비가 아니라 위험하다: 늦게 도착한 오래된 스냅숏이 최신 스냅숏을 덮어써
    // `liveEvents`를 과거로 되돌릴 수 있다. 응답이 올 때까지 추가 emit을 막되,
    // 그 사이 들어온 요청은 버리지 않고 한 번으로 합쳐 뒤이어 재발사한다 —
    // `reverseEvent`/`assignAssist`의 "되돌린 결과를 즉시 반영한다" 계약이
    // 조용히 깨지면 안 되기 때문이다.
    let resyncInFlight = false;
    let resyncCoalesced = false;
    let resyncTimeoutId: ReturnType<typeof setTimeout> | null = null;
    // 시도마다 번호를 붙여 "늦게 도착한 이전 시도의 ack"을 식별한다. 타임아웃
    // 탈출구가 다음 시도를 이미 재발사한 뒤 옛 ack이 도착하면, 그 ack이
    // `releaseResyncGuard()`를 불러 **최신 시도의** 타임아웃을 지우고 가드까지
    // 풀어버린다 — 그때부터 구독이 중첩 발사되고(가드 무력화) 그 중첩 시도의
    // ack이 다시 다음 타임아웃을 지우는 연쇄가 된다. 자기 시도가 여전히 최신일
    // 때만 가드를 건드리게 해서 이 연쇄를 끊는다.
    let resyncAttemptId = 0;
    const releaseResyncGuard = () => {
      if (resyncTimeoutId !== null) {
        clearTimeout(resyncTimeoutId);
        resyncTimeoutId = null;
      }
      resyncInFlight = false;
    };
    const resyncFromServer = () => {
      if (resyncInFlight) {
        resyncCoalesced = true;
        return;
      }
      resyncInFlight = true;
      const attemptId = ++resyncAttemptId;
      // ack이 끝내 오지 않아도 가드가 영구 래치되지 않게 하는 탈출구
      // (`SUBSCRIBE_ACK_TIMEOUT_MS` 주석 참고). 합쳐 둔 요청이 있으면 그때 한 번
      // 재발사한다 — 없으면 가드만 풀고 다음 트리거를 기다린다(재시도 폭주 방지).
      resyncTimeoutId = setTimeout(() => {
        resyncTimeoutId = null;
        resyncInFlight = false;
        if (cancelled || !resyncCoalesced) return;
        resyncCoalesced = false;
        resyncFromServer();
      }, SUBSCRIBE_ACK_TIMEOUT_MS);
      socket.emit(
        'game.subscribe',
        { gameId, afterSequence: 0 },
        (result: SubscribeAck) => {
          // 이미 다음 시도가 나갔다면 이 ack은 낡았다 — 가드도 스냅숏도 건드리지
          // 않고 버린다. 최신 시도가 더 새로운 스냅숏을 가져오고, 서버가 함께
          // push하는 `game.snapshot`은 `onSnapshot`의 단조성 가드가 거른다.
          if (attemptId !== resyncAttemptId) return;
          releaseResyncGuard();
          if (cancelled) return;
          if (result.status === 'subscribed' && result.snapshot) {
            applySnapshot(result.snapshot);
          } else if (result.status === 'denied') {
            setBannerMessage('운영 권한이 없어 이 경기를 조회할 수 없어요. 새로고침 후 다시 시도해주세요.');
          }
          if (resyncCoalesced) {
            resyncCoalesced = false;
            resyncFromServer();
          }
        },
      );
    };
    resyncEventsRef.current = resyncFromServer;

    const onConnect = () => {
      setConnectionStatus('connected');
      resyncFromServer();
    };
    const onDisconnect = () => {
      setConnectionStatus('disconnected');
      // ack가 영영 오지 않는 경우(끊긴 소켓)에도 가드가 래치되지 않게 푼다 —
      // 다음 connect가 반드시 다시 구독할 수 있어야 한다.
      releaseResyncGuard();
      resyncCoalesced = false;
    };
    const onSnapshot = (snapshot: { version: number; state: GameState; lastSequence: number; events: readonly GameEventRecord[] }) => {
      if (cancelled) return;
      // 서버는 구독 처리 중 이 이벤트도 함께 쏘고(`subscribeToGame`,
      // realtime.gateway.ts) 그 응답을 ack 콜백으로도 돌려준다 — 둘 다 같은
      // 전체 스냅숏이라 어느 쪽이 먼저 와도 결과가 같다.
      applySnapshot(snapshot);
    };
    // 서버가 보고한 갭에 대해 **같은 갭이면 재구독을 한 번만** 시도한다.
    // `game.gap`은 오직 `game.subscribe` 응답의 일부로만 발행되는데
    // (`realtime.gateway.ts`의 유일한 emit 지점), 이제 모든 구독이 전체 이력을
    // 실어 오므로 같은 요청을 다시 보내면 서버는 **같은 결과를 그대로 돌려준다** —
    // 조건 없이 재구독하면 갭 → 재구독 → 갭 … 으로 끝나지 않는다(경기 하나가
    // 서버 트랜잭션을 무한히 두들기고, 그 콘솔은 갭이 안 풀려 끝까지 사용 불가).
    // 한 번은 시도한다: 서버 스냅숏 읽기 자체가 순간적으로 어긋났을 가능성을
    // 배제하지는 않되, 같은 갭이 다시 오면 그건 서버 이벤트 테이블의 실제 구멍이라
    // 클라이언트가 할 수 있는 일이 없으므로 프리즈를 유지한다(불완전한 타임라인
    // 위에 새 이벤트를 커밋시키지 않는다).
    let resyncedGapSignature: string | null = null;
    const onGap = (gap: { expectedSequence: number; availableFrom: number }) => {
      if (cancelled) return;
      dispatchSync({ type: 'GAP', expectedSequence: gap.expectedSequence, availableFrom: gap.availableFrom });
      const signature = `${gap.expectedSequence}:${gap.availableFrom}`;
      if (resyncedGapSignature === signature) return;
      resyncedGapSignature = signature;
      resyncFromServer();
    };
    const onCommitted = (committed: { gameId: string; sequence: number; version: number; event: GameEventRecord }) => {
      if (cancelled || committed.gameId !== gameId) return;
      setGameSnapshot((current) => (current ? { ...current, version: committed.version } : current));
      if (committed.sequence === receivedSequenceRef.current + 1) {
        // Contiguous. The gateway emits `game.event.committed` to the
        // sender's OWN socket too (not only the room broadcast, which
        // explicitly excludes the sender) — so this fires for every
        // committed event on this game, self-sent or from another
        // operator, exactly once each. This is the single place liveEvents
        // is appended; the ack handler in `sendQueuedItem` only updates
        // queue/sync/version state for this device's own sends.
        receivedSequenceRef.current = committed.sequence;
        // `BACKFILLED`가 아니라 `EVENT_ARRIVED`인 이유는 그 액션의 주석 참고 —
        // 이 브로드캐스트는 꼬리에 한 건을 붙일 뿐 이미 난 구멍을 채우지 않는다.
        // (스냅숏 자체에 구멍이 있으면 `applySnapshot`이 GAP을 걸어 두는데,
        // 거기서 `receivedSequenceRef`는 이미 `snapshot.lastSequence`까지 올라가
        // 있으므로 그 다음 이벤트는 여기서 "연속"으로 판정된다.)
        dispatchSync({ type: 'EVENT_ARRIVED', lastSequence: committed.sequence });
        setLiveEvents((current) => [...current, committed.event]);
      } else if (committed.sequence > receivedSequenceRef.current + 1) {
        // Non-contiguous broadcast: something between the last event we
        // actually received and this one was missed — recover exactly like an
        // explicit `game.gap`, via a full re-subscribe/backfill rather
        // than silently appending a event list with a hole in it.
        dispatchSync({ type: 'GAP', expectedSequence: receivedSequenceRef.current + 1, availableFrom: committed.sequence });
        resyncFromServer();
      }
      // committed.sequence <= receivedSequenceRef.current: 이 본문을 이미 받은
      // 중복/역순 브로드캐스트라 무시한다. 비교 기준이 `sync.lastSequence`가
      // 아니라 "본문을 받은 시퀀스"라는 점이 핵심이다 — REST가 먼저 알려준
      // 숫자로 이 기준을 올려 버리면, 정작 그 이벤트의 브로드캐스트가 중복으로
      // 취급돼 화면에서 영영 사라진다(receivedSequenceRef 선언부 주석 참고).
    };
    // 백로그 결함 수정(realtime-takeover-and-eviction-protocol): 서버의
    // `evictUserFromScopedGameRooms`는 **대회 단위**로 축출한다 — 이 사용자가
    // 같은 대회에서 배정을 둘 이상(예: 필드 A·B 담당) 갖고 있으면, 그중 하나
    // (필드 A)만 해제돼도 서버가 그 대회의 구독 중인 게임 전부에
    // `game.permission.revoked`를 보낸다. 이건 실수가 아니라 명세이자 스펙으로
    // 박제된 동작이다(realtime.gateway.task8-protocol.spec.ts) — 그래서 이
    // 소켓 프로토콜 자체를 배정 단위로 좁히는 대신, 이 통지를 곧바로 "영구
    // 박탈"로 취급하지 않고 **재검증 트리거**로 다룬다: 이 게임 자체를 다시
    // 구독해 본다. 서버 `subscribeToGame`은 구독마다 이 특정 fixture/field에
    // 대한 스태프 스코프를 처음부터 다시 검사하므로(해제된 배정과 무관하게),
    // 해제된 게 다른 배정(필드 A)이고 이 게임(필드 B)을 지키는 배정이 여전히
    // 유효하면 재구독이 그대로 통과해 room 재가입 + 최신 스냅숏 적용까지
    // 한 번에 끝난다 — 배너 한 번 깜빡이지 않고 조용히 복구된다(진짜 오탐이던
    // 경우). 재구독마저 거부되면 그때 비로소 실제로 이 게임에 대한 접근이
    // 없다는 뜻이므로 기존과 같이 revoked로 전환한다 — 어떤 경로로도 지금보다
    // 나빠지지 않는다(재검증 실패 시의 동작은 이 픽스 이전과 동일하다).
    const onPermissionRevoked = () => {
      if (cancelled) return;
      socket.emit(
        'game.subscribe',
        { gameId, afterSequence: 0 },
        (result: SubscribeAck) => {
          if (cancelled) return;
          if (result.status === 'subscribed' && result.snapshot) {
            applySnapshot(result.snapshot);
            return;
          }
          dispatchTakeover({ type: 'REVOKED', assignmentVersion: -1 });
          // 서버 리스(GameTakeoverService)는 이 축출 경로에서 전혀 바뀌지
          // 않는다 — revoke()는 여기서 호출되지 않으므로 아무도 실제로
          // 인수하지 않았다. "다른 운영자가 담당하고 있어요"는 재검증까지
          // 실패한 이 상태에서도 근거 없는 단정이라, 실제로 확인된 사실(재검증
          // 실패)만 말한다.
          setBannerMessage('이 경기의 운영 권한을 다시 확인하지 못했어요. 새로고침 후 다시 시도해주세요.');
        },
      );
    };
    const onGameError = (error: { code: string; clientEventId?: string }) => {
      if (cancelled) return;
      if (error.clientEventId) {
        dispatchQueue({
          type: 'FAIL',
          clientEventId: error.clientEventId,
          error: { code: error.code, message: gameOperationsErrorMessage(error.code) },
        });
      } else {
        setBannerMessage(gameOperationsErrorMessage(error.code));
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game.snapshot', onSnapshot);
    socket.on('game.gap', onGap);
    socket.on('game.event.committed', onCommitted);
    socket.on('game.permission.revoked', onPermissionRevoked);
    socket.on('game.error', onGameError);

    if (socket.connected) onConnect();

    return () => {
      cancelled = true;
      releaseResyncGuard();
      if (resyncEventsRef.current === resyncFromServer) resyncEventsRef.current = null;
      socket.emit('game.unsubscribe', { gameId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game.snapshot', onSnapshot);
      socket.off('game.gap', onGap);
      socket.off('game.event.committed', onCommitted);
      socket.off('game.permission.revoked', onPermissionRevoked);
      socket.off('game.error', onGameError);
    };
  }, [gameId]);

  // ── Clock sync ping/pong ────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId) return undefined;
    const socket = getV1GameOperationsSocket();
    const ping = () => {
      const clientSentAt = Date.now();
      socket.emit(
        'game.time.ping',
        { clientSentAt },
        (pong: { clientSentAt: number; serverReceivedAt: number; serverSentAt: number }) => {
          const clientReceivedAt = Date.now();
          setClockSamples((current) =>
            pushClockSample(current, {
              clientSentAt: pong.clientSentAt,
              serverReceivedAt: pong.serverReceivedAt,
              serverSentAt: pong.serverSentAt,
              clientReceivedAt,
            }),
          );
        },
      );
    };
    ping();
    const interval = setInterval(ping, CLOCK_PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [gameId]);

  // ── Takeover: request once, renew on a timer, expire on a timer ────────────
  const requestTakeover = useCallback(() => {
    if (!gameId || (myAssignment.data === undefined && myAssignment.isLoading)) return;
    const socket = getV1GameOperationsSocket();
    clientInstanceIdRef.current = clientInstanceIdRef.current ?? randomUuid();
    dispatchTakeover({ type: 'REQUEST' });
    socket.emit(
      'game.takeover.request',
      {
        gameId,
        authorizationSubjectVersion: myAssignment.data ?? 0,
        clientInstanceId: clientInstanceIdRef.current,
        lastSequence: sync.lastSequence,
      },
      (result: GameTakeoverAck) => {
        // 서버가 코드를 주지 않은 경우까지 STAFF_SCOPE_DENIED 로 뭉뚱그리면 안 된다.
        // 운영자가 실제 원인이 아니라 권한 요청이라는 엉뚱한 경로로 가기 때문이다.
        // 서버가 명시한 거부만 그 코드로 남기고, 나머지는 원인 미상으로 구분한다.
        if (result.status !== 'granted') {
          dispatchTakeover({ type: 'DENIED', code: result.code ?? 'TAKEOVER_UNAVAILABLE' });
          return;
        }
        if (!result.takeoverToken || !result.expiresAt) {
          dispatchTakeover({ type: 'DENIED', code: 'TAKEOVER_UNAVAILABLE' });
          return;
        }
        dispatchTakeover({
          type: 'GRANTED',
          token: result.takeoverToken,
          expiresAtMs: new Date(result.expiresAt).getTime(),
          assignmentVersion: myAssignment.data ?? 0,
        });
      },
    );
  }, [gameId, myAssignment.data, myAssignment.isLoading, sync.lastSequence]);

  useEffect(() => {
    if (takeover.status === 'none') requestTakeover();
  }, [takeover.status, requestTakeover]);

  useEffect(() => {
    if (takeover.status !== 'held') return undefined;
    const interval = setInterval(() => {
      const socket = getV1GameOperationsSocket();
      if (!clientInstanceIdRef.current) return;
      socket.emit(
        'game.takeover.renew',
        { gameId, takeoverToken: takeover.token, clientInstanceId: clientInstanceIdRef.current },
        (result: GameTakeoverAck) => {
          if (result.status !== 'granted') {
            dispatchTakeover({ type: 'DENIED', code: result.code ?? 'TAKEOVER_TOKEN_EXPIRED' });
            return;
          }
          if (!result.takeoverToken || !result.expiresAt) {
            dispatchTakeover({ type: 'DENIED', code: 'TAKEOVER_TOKEN_EXPIRED' });
            return;
          }
          dispatchTakeover({
            type: 'GRANTED',
            token: result.takeoverToken,
            expiresAtMs: new Date(result.expiresAt).getTime(),
            assignmentVersion: takeover.assignmentVersion,
          });
        },
      );
    }, TAKEOVER_RENEW_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeover.status, gameId]);

  useEffect(() => {
    const interval = setInterval(() => {
      dispatchTakeover({ type: 'CHECK_EXPIRY', nowMs: Date.now() });
    }, TAKEOVER_EXPIRY_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // UX 감사 — 주기적 renew(위 effect)가 실패하면 'denied'로 떨어지는데,
  // renew가 실패하는 흔한 이유는 (진짜 권한 상실이 아니라) 토큰 자체가
  // 서버에서 만료돼 renew 창을 놓친 경우다. 배너 문구
  // (`gameOperationsErrorMessage('TAKEOVER_TOKEN_EXPIRED')`)는 이미
  // "다시 가져오는 중이에요"라고 말하지만, 이전엔 자동 재요청 effect가
  // `status === 'expired'`(자연 만료, `CHECK_EXPIRY`)만 지켜봐서 실제로는
  // 아무것도 다시 가져오지 않았다 — alpha 실측(2026-08): 배너가 뜬 채 8초를
  // 기다려도 회복되지 않고 새로고침해야 풀렸다.
  //
  // 백로그 결함 수정(realtime-takeover-and-eviction-protocol): 그 회귀 픽스가
  // `TAKEOVER_TOKEN_EXPIRED`(renew 실패는 PERMISSION_DENIED가 아닌 한 전부 이
  // 코드로 왔다)를 전부 자동 재요청 대상으로 삼으면서, 정당하게 다른 콘솔이
  // 넘겨받은 경우("다른 운영자가 방금 이 경기를 가져감" — 예: 같은 fixture를
  // 담당자 두 명이 동시에 열었거나, 한 사람이 탭 두 개를 열었을 때)까지 같이
  // 잡아 버렸다. 그 경우 서버는 grant()가 무조건 덮어쓰기라 상대의 재요청도
  // 항상 성공하므로, 여기서 무조건 재요청하면 두 콘솔이 20초 renew 주기로
  // 서로 토큰을 영원히 뺏는다. 서버(`RealtimeGateway.renewGameTakeover`)는
  // 이제 그 둘을 구분해서 보낸다 — 자연 만료는 여전히 `TAKEOVER_TOKEN_EXPIRED`
  // (재요청 안전, 아래에서 그대로 자동 재획득), 다른 콘솔에 뺏긴 경우는
  // `TAKEOVER_SUPERSEDED`(자동 재요청 금지 — 상대도 정당한 보유자이므로 여기서
  // 다시 뺏으면 핑퐁이 재현된다. 새로고침 전까지는 이 상태로 남는다. 상대가
  // 놓으면 — 탭을 닫거나 자기 토큰이 자연 만료되면 — 그 시점부터는 이 세션도
  // 다시 정상적으로 요청·보유할 수 있지만, 자동으로 되찾으러 가지는 않는다).
  const deniedCode = takeover.status === 'denied' ? takeover.code : null;
  useEffect(() => {
    if (takeover.status === 'expired' || (takeover.status === 'denied' && deniedCode === 'TAKEOVER_TOKEN_EXPIRED')) {
      requestTakeover();
    }
  }, [takeover.status, deniedCode, requestTakeover]);

  // ── Event send / durable-queue flush ────────────────────────────────────────
  const sendQueuedItem = useCallback(
    (item: QueuedGameEvent) => {
      if (!gameId || !isTakeoverHeld(takeover) || !canAppendWhileSyncing(sync)) return;
      if (Date.now() >= takeover.expiresAtMs) return; // CHECK_EXPIRY's poll will flip status to 'expired' shortly; do not send meanwhile.
      const socket = getV1GameOperationsSocket();
      dispatchQueue({ type: 'MARK_SENDING', clientEventId: item.clientEventId });
      // `attempts > 0` means this item already failed once and is being
      // resent via `retryFailedEvent`/the RETRY action — the backend already
      // has a dedicated rebase path for exactly this (`game.event.retry` →
      // `GamesService.retryEvent`), which re-validates against the CURRENT
      // game version instead of the stale `item.expectedVersion` captured at
      // enqueue time and skips the live clock-drift check (the event's
      // `occurredAt` is immutable/hash-pinned and legitimately historical by
      // now). Before this branch, EVERY retry re-emitted `game.event.append`
      // with the original stale `expectedVersion` — which is structurally
      // guaranteed to fail again with the exact same VERSION_CONFLICT /
      // OFFLINE_EVENT_REBASE_CONFLICT it failed with the first time, since
      // nothing ever advanced the version the retry presented.
      //
      // A SECOND, independent reason to take the retry path even on the
      // very first attempt (`attempts === 0`): the item was captured while
      // offline (or while the operator was mid-selection) and its frozen
      // `occurredAt` is now more than `CLOCK_DRIFT_TOLERANCE_MS` stale.
      // `game.event.append`'s server-side `assertClockNotDrifted()`
      // (games.service.ts) rejects that with `422 CLOCK_DRIFT` — deterministically,
      // on every reconnect-triggered flush, since the queue only ever holds
      // this back while offline and then sends it as the first thing on
      // reconnect. `game.event.retry` intentionally has NO such check (its
      // own comment: "a retry is historical by design and is legitimately
      // allowed to arrive minutes after occurredAt (offline recovery)") —
      // that is exactly this item's situation even though it has never
      // actually been retried yet. Routing it there directly avoids a
      // guaranteed-to-fail round trip (with a misleading "device clock is
      // off" banner) that would otherwise require the operator to manually
      // tap "다시 시도" once per queued item before it can ever succeed.
      const isRetry =
        item.attempts > 0 ||
        isClockDrifted(item.event.occurredAt, serverAlignedNowMs(Date.now(), clockOffsetMs));
      // 이 emit의 ack가 SEND_ACK_TIMEOUT_MS 안에 오지 않으면(소켓이 응답 없이
      // 끊기면 콜백 자체가 영영 안 온다) 'sending'에 갇히지 않도록 FAIL로
      // 전환한다. ackHandler가 먼저 불리면 이 타이머는 취소된다 — 반대로
      // 타이머가 먼저 발화한 뒤 ack가 뒤늦게 와도 ACK 리듀서는 'failed'
      // 상태를 정상적으로 덮어쓰므로 늦은 성공 응답도 버려지지 않는다.
      const ackTimeoutId = setTimeout(() => {
        if (!isMountedRef.current) return;
        dispatchQueue({
          type: 'FAIL',
          clientEventId: item.clientEventId,
          error: { code: 'SEND_TIMEOUT', message: gameOperationsErrorMessage('SEND_TIMEOUT') },
        });
      }, SEND_ACK_TIMEOUT_MS);
      const ackHandler = (result: { status: string; sequence?: number; version?: number; code?: string }) => {
        clearTimeout(ackTimeoutId);
        if (result.status === 'ack' && result.sequence !== undefined && result.version !== undefined) {
          dispatchQueue({
            type: 'ACK',
            clientEventId: item.clientEventId,
            sequence: result.sequence,
            version: result.version,
          });
          // Advances local sync state for THIS device's own committed event.
          // `receivedSequenceRef`는 **일부러 건드리지 않는다**: 게이트웨이는
          // 같은 커밋을 보낸 소켓에도 `game.event.committed`를 쏘므로
          // (`acknowledgeGameEvent`의 `client.emit`), 그 본문을 받아 append하는
          // 쪽은 `onCommitted`다. 여기서 미리 올리면 뒤이어 도착한 자기 이벤트가
          // "이미 아는 중복"으로 버려져 자기가 기록한 이벤트가 화면에서 사라진다.
          // `BACKFILLED`가 아니라 `EVENT_ARRIVED`인 이유는 그 액션의 주석 참고 —
          // ack은 빠진 구간의 이벤트 본문을 하나도 실어 오지 않으므로 갭 프리즈를 풀 수 없다.
          dispatchSync({ type: 'EVENT_ARRIVED', lastSequence: result.sequence });
          setGameSnapshot((current) => (current ? { ...current, version: result.version! } : current));
          void queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
        } else {
          dispatchQueue({
            type: 'FAIL',
            clientEventId: item.clientEventId,
            error: { code: result.code ?? 'INTERNAL_ERROR', message: gameOperationsErrorMessage(result.code ?? 'INTERNAL_ERROR') },
          });
        }
      };
      if (isRetry) {
        socket.emit(
          'game.event.retry',
          {
            gameId,
            // Rebase onto the freshest version this device knows about
            // rather than the (by definition, already-rejected) version the
            // item was originally enqueued with.
            rebasedExpectedVersion: gameSnapshot?.version ?? item.expectedVersion,
            clientEventId: item.clientEventId,
            takeoverToken: takeover.token,
            payloadHash: item.payloadHash,
            event: item.event,
          },
          ackHandler,
        );
      } else {
        socket.emit(
          'game.event.append',
          {
            gameId,
            expectedVersion: item.expectedVersion,
            clientEventId: item.clientEventId,
            takeoverToken: takeover.token,
            payloadHash: item.payloadHash,
            event: item.event,
          },
          ackHandler,
        );
      }
    },
    [gameId, takeover, sync, queryClient, gameSnapshot, clockOffsetMs],
  );

  useEffect(() => {
    if (
      connectionStatus !== 'connected' ||
      !isTakeoverHeld(takeover) ||
      Date.now() >= takeover.expiresAtMs ||
      !canAppendWhileSyncing(sync)
    ) {
      return;
    }
    const next = nextQueuedItem(queue);
    if (next) sendQueuedItem(next);
  }, [connectionStatus, takeover, sync, queue, sendQueuedItem]);

  const submitEvent = useCallback(
    async (input: SubmitEventInput) => {
      if (!gameSnapshot) return;
      // D-10 (frozen decision table): this is the ONLY thing that may ever
      // enter the durable offline queue. Asserting it here — even though
      // every current caller already only constructs an append_event —
      // means a future change that tries to route start/pause/resume/end/
      // officialize through this same path fails loudly instead of quietly
      // queuing a command that must always be online-acknowledged.
      assertQueueable('append_event');
      const clientEventId = randomUuid();
      const payloadHash = await canonicalGameEventPayloadHash({
        type: input.type,
        sideId: input.sideId,
        participantId: input.participantId,
        assistParticipantId: input.assistParticipantId,
        period: input.period,
        clockMs: input.clockMs,
        occurredAt: input.occurredAt,
        payload: input.payload,
      });
      const item: QueuedGameEvent = {
        clientEventId,
        gameId: gameId ?? '',
        expectedVersion: gameSnapshot.version,
        event: {
          type: input.type,
          sideId: input.sideId,
          participantId: input.participantId,
          assistParticipantId: input.assistParticipantId,
          period: input.period,
          clockMs: input.clockMs,
          occurredAt: input.occurredAt,
          payload: input.payload,
        },
        payloadHash,
        status: 'queued',
        queuedAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
        ackedSequence: null,
        ackedVersion: null,
      };
      dispatchQueue({ type: 'ENQUEUE', item });
    },
    [gameId, gameSnapshot],
  );

  const retryFailedEvent = useCallback(
    async (clientEventId: string) => {
      // alpha 실사고(2026-08) 구제: `medianOffsetMs()`를 고치기 전에 이미
      // 캡처된 항목은 `event.clockMs`가 소수(.5 등)일 수 있다 — 그대로
      // 재전송하면 서버 `parseGameEvent`(`Number.isSafeInteger` 요구)에
      // 똑같이 막혀 "다시 시도"가 영원히 무의미한 루프가 된다. 여기서만
      // 1ms 미만으로 반올림해 보정한다(이벤트가 실제로 벌어진 시각 자체는
      // 절대 바꾸지 않는다 — occurredAt은 그대로 둔다). 서버는 payloadHash를
      // event 내용으로 재계산해 대조하므로(`GamesService.retryEvent`) clockMs만
      // 고치고 hash를 그대로 두면 `OFFLINE_EVENT_REBASE_CONFLICT`로 또 실패한다
      // — 그래서 항상 짝지어 다시 계산한다.
      const item = queue.items.find((candidate) => candidate.clientEventId === clientEventId);
      if (item && !Number.isSafeInteger(item.event.clockMs)) {
        const repairedEvent = { ...item.event, clockMs: Math.round(item.event.clockMs) };
        try {
          const repairedHash = await canonicalGameEventPayloadHash({
            type: repairedEvent.type as GameEventType,
            sideId: repairedEvent.sideId,
            participantId: repairedEvent.participantId,
            assistParticipantId: repairedEvent.assistParticipantId,
            period: repairedEvent.period,
            clockMs: repairedEvent.clockMs,
            occurredAt: repairedEvent.occurredAt,
            payload: repairedEvent.payload,
          });
          dispatchQueue({
            type: 'RETRY',
            clientEventId,
            repairedEvent: { event: repairedEvent, payloadHash: repairedHash },
          });
          return;
        } catch {
          // Web Crypto를 쓸 수 없는 극단적 환경 등 — 보정 없이 원래 값으로
          // 재시도한다(이 픽스 이전과 동일하게 동작, 새 결함을 만들지 않는다).
        }
      }
      dispatchQueue({ type: 'RETRY', clientEventId });
    },
    [queue.items],
  );

  // T3 추가 — 큐를 거치지 않는 온라인 전용 REST 호출. assertQueueable을 굳이
  // 부르지 않는다(큐에 절대 안 넣으니 필요 없다) — 대신 이 함수 자체가 "온라인일
  // 때만 호출 가능"을 문서화한다.
  const reverseEvent = useCallback(
    async (input: { eventId: string; reason: string }) => {
      if (!gameId || !gameSnapshot || !isTakeoverHeld(takeover)) {
        throw new Error('경기 운영 권한이 없어 되돌릴 수 없어요.');
      }
      const clientEventId = randomUuid();
      const result = await v1Post<{ gameId: string; state: GameState; version: number }>(
        `/games/${gameId}/events/${input.eventId}/reverse`,
        {
          expectedVersion: gameSnapshot.version,
          clientEventId,
          takeoverToken: takeover.token,
          reason: input.reason,
        },
        { headers: { 'Idempotency-Key': clientEventId } },
      );
      setGameSnapshot((current) => (current ? { ...current, version: result.version } : current));
      void queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
      // Root-cause fix (2026-08, requirement 3): a reversal has no realtime
      // broadcast counterpart (`GamesService.reverseEvent` is REST-only and
      // never emits `game.event.committed` — see `resyncEventsRef`'s doc
      // comment). Without this, `liveEvents` — and the scoreboard, which is
      // purely derived from it — would keep showing the just-reversed goal
      // until a full page reload. Force the same full resync a fresh mount
      // performs so the correction (and its `reversesEventId`) lands
      // immediately.
      resyncEventsRef.current?.();
    },
    [gameId, gameSnapshot, takeover, queryClient],
  );

  // 이슈 #376 — 큐를 거치지 않는 온라인 전용 REST 호출(reverseEvent와 동일한 이유,
  // 위 주석 참고). 하나의 커맨드로 assistParticipantId를 in-place로 갱신하므로
  // reverseEvent+submitEvent 2단계가 겪던 stale expectedVersion 레이스가 구조적으로
  // 사라진다 — 이 함수 하나가 gameSnapshot.version을 읽어 그대로 보내고, 응답의
  // 새 version으로 갱신할 때까지 다른 커맨드가 끼어들 여지가 없다.
  const assignAssist = useCallback(
    async (input: { eventId: string; assistParticipantId: string | null }) => {
      if (!gameId || !gameSnapshot || !isTakeoverHeld(takeover)) {
        throw new Error('경기 운영 권한이 없어 어시스트를 기록할 수 없어요.');
      }
      const clientEventId = randomUuid();
      const result = await v1Post<AssignGoalAssistResult>(
        `/games/${gameId}/events/${input.eventId}/assist`,
        {
          expectedVersion: gameSnapshot.version,
          clientEventId,
          takeoverToken: takeover.token,
          assistParticipantId: input.assistParticipantId,
        },
        { headers: { 'Idempotency-Key': clientEventId } },
      );
      setGameSnapshot((current) => (current ? { ...current, version: result.version } : current));
      void queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
      // reverseEvent와 동일한 이유(위 그 함수의 주석 참고) — 이 REST-only 커맨드도
      // 실시간 브로드캐스트 짝이 없다. liveEvents를 서버 스냅숏으로 강제 재동기화해
      // in-place로 갱신된 assistParticipantId가 새로고침 없이 즉시 반영되게 한다.
      resyncEventsRef.current?.();
    },
    [gameId, gameSnapshot, takeover, queryClient],
  );

  // UX 감사 — REST 커맨드(start/pause/resume/end/end-period/start-period/
  // revert-period) 성공 응답을
  // 그 자리에서 gameSnapshot에 반영한다. 자세한 이유는
  // `UseV1GameOperationsConsoleResult.applyCommandResult` 문서 참고.
  const applyCommandResult = useCallback((result: { state: GameState; version: number }) => {
    setGameSnapshot((current) =>
      current ? { ...current, state: result.state, version: result.version } : current,
    );
  }, []);

  return {
    connectionStatus,
    sync,
    takeover,
    queue,
    clockOffsetMs,
    liveEvents,
    gameSnapshot,
    bannerMessage,
    submitEvent,
    retryFailedEvent,
    requestTakeover,
    reverseEvent,
    assignAssist,
    applyCommandResult,
  };
}

export function gameOperationsErrorMessage(code: string): string {
  switch (code) {
    case 'TAKEOVER_TOKEN_EXPIRED':
      return '운영 권한 토큰이 만료됐어요. 다시 가져오는 중이에요.';
    // 백로그 결함 수정(realtime-takeover-and-eviction-protocol): renew 실패
    // 중 "다른 콘솔이 방금 이 경기를 가져감"만 이 코드로 온다(자연 만료는
    // 여전히 TAKEOVER_TOKEN_EXPIRED). 이 경우엔 자동 재요청하지 않으므로
    // (바로 위 effect 참고) 문구도 "다시 가져오는 중"이라고 하지 않는다 —
    // 실제로 아무것도 다시 시도하지 않는데 그렇게 말하면 운영자가 기다리기만
    // 하다 골을 놓친다.
    case 'TAKEOVER_SUPERSEDED':
      return '다른 화면에서 이 경기 운영 권한을 가져갔어요. 새로고침 후 다시 시도해주세요.';
    case 'STAFF_SCOPE_DENIED':
      return '이 경기를 운영할 권한이 없어요.';
    case 'TAKEOVER_UNAVAILABLE':
      // 서버가 거부 사유 코드를 주지 않은 경우만 여기로 온다. 연결 자체는 살아 있을 수
      // 있으므로(실제로 "실시간 연결됨" 상태에서 이 코드가 뜬 사례가 있었다) 원인을
      // 단정하지 않는다.
      return '경기 운영 권한을 가져오지 못했어요. 새로고침 후 다시 시도해 주세요.';
    case 'VERSION_CONFLICT':
      return '경기 상태가 변경되어 다시 시도해주세요.';
    case 'CLOCK_DRIFT':
      return '기기 시각이 서버와 많이 달라요. 시간을 확인해주세요.';
    // alpha 실사고(2026-08) 근본 원인: 옐로카드/파울 기록이 이 코드로 거부됐는데
    // 매핑이 없어 default("이벤트를 기록하지 못했어요")로 뭉개졌다. 실제 원인은
    // `medianOffsetMs()`가 소수(.5) offset을 반환해 `clockMs`가 정수가 아니게
    // 되고, 서버 `parseGameEvent`(`Number.isSafeInteger` 요구)가 거부한 것—
    // `game-operations-clock.ts`에서 고쳤다(새 캡처는 항상 정수). 다만 이 픽스
    // 이전에 이미 큐에 저장된 항목은 여전히 소수 clockMs를 갖고 있을 수 있어
    // NON_RETRYABLE로 두지 않는다 — `retryFailedEvent`가 재시도 시점에 정수로
    // 보정하고 payloadHash를 다시 계산해 함께 보내므로(아래 구현) 재시도가
    // 실제로 복구 경로가 된다.
    case 'VALIDATION_ERROR':
      return '이벤트 형식에 문제가 있어 기록하지 못했어요. 다시 시도해주세요.';
    // UX 감사 CRITICAL — 서버가 ack를 끝내 보내지 않아 'sending'에 고착되던
    // 상태를 클라이언트 타임아웃으로 감지한 경우에만 붙는 코드(서버가 던지는
    // 코드가 아니다). 네트워크가 끊겼거나 응답이 느린 경우가 대부분이라
    // 재시도로 풀릴 수 있다 — NON_RETRYABLE 목록에 없으므로 기본값대로
    // 재시도 가능으로 분류된다.
    case 'SEND_TIMEOUT':
      return '서버 응답을 받지 못했어요. 네트워크를 확인하고 다시 시도해주세요.';
    case 'OFFLINE_EVENT_REBASE_CONFLICT':
      return '오프라인 동안 기록한 이벤트를 다시 확인해주세요.';
    // T1-0 fix round 2: this event path goes through the Socket.IO gateway
    // (game.error), NOT extractErrorMessage -- the design doc assumed the
    // server message would show as-is, but it never reaches this console
    // without an explicit case here. Before this, all four fell to the
    // default "다시 시도해주세요", which is actively wrong for every one of
    // them: none of these are transient and retrying the exact same request
    // fails the exact same way every time until the operator does something
    // different (start the game, refresh, or end it).
    case 'PERIOD_NOT_STARTED':
      return '경기가 진행 중이 아니에요. 경기를 먼저 시작해 주세요.';
    case 'PERIOD_ALREADY_ENDED':
      return '이미 종료된 피리어드예요. 새로고침 후 다시 확인해주세요.';
    case 'NO_NEXT_PERIOD':
      return '마지막 피리어드예요. 경기를 종료해 주세요.';
    case 'EVENT_LATE':
      return '기록하려는 시점이 이미 지난 피리어드예요. 새로고침 후 다시 확인해주세요.';
    // 실측 사고(6건 시도 중 2건 실패) 사후조사에서 드러난 미매핑 코드 9개 — 서버는 이미
    // 이 코드들을 던질 수 있었는데(games.service.ts) 콘솔이 전부 default 로 뭉개
    // "다시 시도해주세요" 를 보여주고 있었다. 아래는 재시도로 풀리는지 여부에 따라
    // 문구를 나눴다 — `isRetryableGameOperationsErrorCode()` 의 판정과 반드시 짝을
    // 맞춰야 한다(둘이 갈라지면 "다시 시도해주세요" 인데 버튼이 없거나, 재시도해도
    // 안 되는데 버튼만 있는 모순이 생긴다).
    case 'TERMINAL_GAME_IMMUTABLE':
      return '이미 종료 처리된 경기라 더 이상 이벤트를 기록할 수 없어요.';
    case 'EVENT_INVALID':
      return '이벤트 정보가 올바르지 않아요. 새로고침 후 다시 기록해주세요.';
    case 'PARTICIPANT_SIDE_MISMATCH':
      return '선택한 선수가 해당 팀 소속이 아니에요. 새로고침 후 다시 기록해주세요.';
    case 'SCORER_REQUIRED':
      return '이 대회는 득점자를 반드시 선택해야 해요. 새로고침 후 다시 기록해주세요.';
    // 라이브 선수 교체(교체 액션 + 풋살 빠른 교체 모드) — 서버가 던질 수 있는
    // SUBSTITUTION 전용 코드. 화면단 필터가 애초에 무효한 대상을 보여주지
    // 않으므로 실제로는 동시성(다른 운영자가 먼저 기록)으로만 도달할 가능성이
    // 크지만, 그 경우에도 "다시 시도해주세요"는 오해를 준다 — 새로고침 후
    // 현재 피치 상태를 다시 확인하라고 안내한다.
    case 'SUBSTITUTION_INVALID':
      return '교체 정보가 올바르지 않아요. 새로고침 후 다시 기록해주세요.';
    case 'SUBSTITUTION_OUT_NOT_ON_PITCH':
      return '나가는 선수가 이미 피치를 떠났어요. 새로고침 후 다시 확인해주세요.';
    case 'SUBSTITUTION_IN_ALREADY_ON_PITCH':
      return '들어오는 선수가 이미 피치 위에 있어요. 새로고침 후 다시 확인해주세요.';
    case 'SUBSTITUTION_LIMIT_REACHED':
      return '이 대회의 교체 횟수를 모두 사용했어요.';
    case 'COMMAND_IDEMPOTENCY_KEY_MISMATCH':
    case 'IDEMPOTENCY_PAYLOAD_CONFLICT':
      return '같은 요청 번호로 다른 내용이 이미 처리됐어요. 새로고침 후 다시 기록해주세요.';
    case 'INVALID_ACTOR_SCOPE':
      return '이 작업을 수행할 권한이 없어요.';
    case 'COMMAND_CONCURRENCY_CONFLICT':
      return '다른 운영자가 동시에 처리하고 있어요. 잠시 후 다시 시도해주세요.';
    case 'INTERNAL_ERROR':
      // 사용자가 고칠 수 있는 게 없다 — 입력을 바꾸라고 하지 않는다. 재시도는 여전히
      // 유효한 선택지다(원인이 payload 가 아니라 일시적 서버 오류일 수 있으므로) — 그래서
      // isRetryableGameOperationsErrorCode 는 이 코드를 재시도 가능으로 둔다.
      return '일시적인 오류로 이벤트를 기록하지 못했어요. 다시 시도해도 계속되면 관리자에게 알려주세요.';
    default:
      // 위 어디에도 없는, 서버가 새로 추가했을 수 있는 코드 — "다시 시도해주세요" 를
      // 단정하지 않는다(그 코드가 재시도로 풀리는지 여기서는 알 수 없다).
      return '이벤트를 기록하지 못했어요.';
  }
}

/**
 * 코드별로 재시도(다시 보내기)가 의미 있는지 — `QueueStatusPanel` 이 이 값으로
 * "다시 시도" 버튼 자체를 숨긴다(비활성화가 아니라 숨김: 눌러도 매번 똑같이
 * 실패할 게 확실한 코드에서 버튼을 살려 두면 운영자가 실패 루프에 갇힌다).
 *
 * 재시도 가능 = "정확히 같은 이벤트를 다시 보내면, 조건이 바뀐 뒤엔 성공할 수 있다"
 * (버전 충돌 재베이스, 권한 토큰 재발급, 서버 일시 오류, 동시성 충돌, 아직 시작 안 한
 * 피리어드가 나중에 시작되는 경우 등). 재시도 불가능 = "같은 payload 는 조건이 무엇이든
 * 항상 같은 이유로 거부된다" — 이런 코드는 재전송이 아니라 다른 행동(새로고침, 다시
 * 캡처, 관리자 문의)이 필요하므로, 그 안내는 `gameOperationsErrorMessage` 문구 자체가
 * 이미 담고 있다.
 */
const NON_RETRYABLE_GAME_OPERATIONS_ERROR_CODES = new Set<string>([
  'STAFF_SCOPE_DENIED',
  'INVALID_ACTOR_SCOPE',
  'TERMINAL_GAME_IMMUTABLE',
  'PERIOD_ALREADY_ENDED',
  'NO_NEXT_PERIOD',
  'EVENT_LATE',
  'EVENT_INVALID',
  'PARTICIPANT_SIDE_MISMATCH',
  'SCORER_REQUIRED',
  'SUBSTITUTION_INVALID',
  'SUBSTITUTION_OUT_NOT_ON_PITCH',
  'SUBSTITUTION_IN_ALREADY_ON_PITCH',
  'SUBSTITUTION_LIMIT_REACHED',
  'COMMAND_IDEMPOTENCY_KEY_MISMATCH',
  'IDEMPOTENCY_PAYLOAD_CONFLICT',
]);

export function isRetryableGameOperationsErrorCode(code: string): boolean {
  return !NON_RETRYABLE_GAME_OPERATIONS_ERROR_CODES.has(code);
}
