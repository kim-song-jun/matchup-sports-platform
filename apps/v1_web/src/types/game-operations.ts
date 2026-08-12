/**
 * Task 21 — types for the live tournament operations console.
 *
 * These mirror the frozen REST/realtime contract in
 * `.omo/plans/teameet-team-tournament-operations-v1.md` ("Frozen REST and
 * idempotency contract" / "Frozen realtime contract") and the shipped
 * `apps/v1_api/src/games/**` DTOs/service responses (Task 18/20). Kept as a
 * dedicated domain file (not folded into `types/api.ts`) because this is a
 * large, self-contained surface.
 */

export type GameSourceType = 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';
export type GameState = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED';
export type GameSideKey = 'HOME' | 'AWAY';
/** 이슈 #375 — `HALFTIME`: 현재 피리어드는 `ENDED`로 닫혔지만 다음
 * 피리어드는 아직 `LIVE`로 열리지 않은 하프타임 구간(`end-period`가 다음
 * 피리어드 행에 쓰는 값, `start-period`가 `LIVE`로 옮긴다). */
export type GamePeriodState = 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'ENDED';
export type GameLineupState = 'DRAFT' | 'SUBMITTED' | 'LOCKED';

/**
 * The October minimum event set is GOAL/CARD/FOUL; SUBSTITUTION and the
 * PERIOD_START/PERIOD_END/PAUSE/RESUME lifecycle markers are recorded by
 * explicit operator commands (see T1-0's `next_period` command and the
 * live console's period start/end buttons), not auto-emitted by the
 * backend. FOUL is a first-class `V1GameEventType` value (Task T1-3) —
 * it is no longer disguised as a `CORRECTION` event with
 * `payload.kind === 'FOUL'`. `CORRECTION` is reserved exclusively for
 * `GamesService.reverseEvent()`'s real reversal/undo path, which always
 * sets `reversesEventId`.
 */
export type GameEventType =
  | 'GOAL'
  | 'CARD'
  | 'FOUL'
  | 'SUBSTITUTION'
  | 'PERIOD_START'
  | 'PERIOD_END'
  | 'PAUSE'
  | 'RESUME'
  | 'CORRECTION';

/** `payload.card` is the established backend convention (see
 * `apps/v1_api/src/games/games.service.ts`'s `deriveTournamentRevision()` /
 * result-invariant mapping) — not `cardType`. */
export type GameCardColor = 'YELLOW' | 'RED';

export type GameActorRole =
  | 'team_manager'
  | 'team_owner'
  | 'opponent_manager'
  | 'platform_ops'
  | 'tournament_director'
  | 'field_operator'
  | 'support_readonly';

export interface GameSide {
  id: string;
  gameId: string;
  sideKey: GameSideKey;
  teamId: string | null;
  displayNameSnapshot: string;
  createdAt: string;
  updatedAt: string;
}

export interface GamePeriod {
  id: string;
  gameId: string;
  number: number;
  state: GamePeriodState;
  startedAt: string | null;
  endedAt: string | null;
  /** 이 피리어드가 지금까지 완료된 모든 일시정지 구간에서 쓴 누적 ms
   * (`resume`이 여러 번 접히며 쌓인다). 경과 시간 계산은 항상
   * `elapsedMatchMs()`(`@/lib/game-operations-clock`)를 거친다 — 화면 표시와
   * `freezeCapture()`가 각자 계산하면 반드시 어긋난다. */
  pausedTotalMs: number;
  /** 지금 열려 있는 일시정지 구간의 시작 시각, 일시정지 중이 아니면 null. */
  pausedAt: string | null;
}

export interface GameLineupParticipant {
  id: string;
  gameId: string;
  sideId: string;
  lineupId: string;
  displayNameSnapshot: string;
  jerseyNumber: number | null;
  position: string | null;
  /** 피치 배치 좌표, 0~100 퍼센트(자기 진영 기준: y=0 골라인, y=100 하프라인). 둘 다 있거나 둘 다 없다. */
  positionX: number | null;
  positionY: number | null;
  /** 선발(true)/후보(false). 새로고침 시 후보 상태가 소실되던 결함을 고치는 컬럼(2026-08). */
  started: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `GET .../lineup` response row — Task 21 added the `participants` array
 * (see `docs/api/domains/games.md`'s Task 21 addition note). */
export interface GameLineup {
  id: string;
  gameId: string;
  sideId: string;
  revision: number;
  state: GameLineupState;
  version: number;
  submittedAt: string | null;
  supersedesId: string | null;
  /** 포메이션 프리셋 라벨("4-4-2" 등), null이면 자유 배치. */
  formation: string | null;
  createdAt: string;
  updatedAt: string;
  participants: GameLineupParticipant[];
}

/** `GET /tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup`
 * response — Task 21 changed this from a bare `GameLineup[]` to `{gameId,
 * lineups}` so a caller can resolve the fixture's `gameId` before any
 * lineup has ever been saved (see `docs/api/domains/tournament-operations.
 * md`'s Task 21 note). */
export interface FixtureLineupResponse {
  gameId: string;
  lineups: GameLineup[];
}

/** `lineup.substitutions`/`lineup.maxSubstitutions` from the game's pinned
 * competition config (`apps/v1_api/.../competition-config.types.ts`),
 * resolved server-side — the console decides whether to surface the rolling
 * quick-substitution mode from `mode`, never from a hardcoded sport name. */
export interface GameSubstitutionPolicy {
  mode: 'limited' | 'rolling';
  maxSubstitutions: number | null;
}

/** One configured period's `{durationMinutes, extraTime}`, index-aligned with
 * `GameDetail.periods` (array index `i` ↔ `GamePeriod.number === i + 1`) —
 * see `parsePeriodDurations` (`apps/v1_api/.../competition-config.parse.ts`)
 * for why the alignment is safe and why a malformed/legacy entry is `null`
 * rather than a guessed number. Added for the alpha "452′" clock-overrun
 * incident (2026-08): the operator console uses this to ask for
 * confirmation before submitting an event whose captured clock runs far
 * past its period's configured length (`isClockSuspicious`,
 * `lib/game-operations-clock.ts`). `null` overall means the pinned config
 * couldn't be read (or predates this field) — the console must skip the
 * check rather than fabricate a duration.
 */
export type GamePeriodDuration = { durationMinutes: number; extraTime: boolean } | null;

export interface GameDetail {
  id: string;
  sourceType: GameSourceType;
  state: GameState;
  version: number;
  lastSequence: number;
  competitionConfigVersionId: string;
  currentOfficialRevisionId: string | null;
  sides: GameSide[];
  periods: GamePeriod[];
  periodDurations: readonly GamePeriodDuration[] | null;
  lineups: GameLineup[];
  actorRole: GameActorRole;
  substitutionPolicy: GameSubstitutionPolicy;
}

export interface GameEventRecord {
  id: string;
  gameId: string;
  sequence: number;
  clientEventId: string;
  payloadHash: string;
  type: GameEventType;
  sideId: string | null;
  participantId: string | null;
  assistParticipantId: string | null;
  period: number;
  clockMs: number;
  occurredAt: string;
  receivedAt: string;
  actorUserId: string;
  reversesEventId: string | null;
  payload: Record<string, unknown>;
}

export interface GameEventGap {
  expectedSequence: number;
  availableFrom: number;
}

export interface GameEventsBackfill {
  events: GameEventRecord[];
  lastSequence: number;
  gap: GameEventGap | null;
}

/**
 * 이슈 #375 — 구 `next-period`(전반 종료를 누르면 곧장 후반까지 시작시켜
 * 되돌릴 수 없던 fused 커맨드)를 `end-period`(현재 피리어드만 종료 →
 * 하프타임)와 `start-period`(하프타임 → 다음 피리어드 시작)로 쪼갰고,
 * `revert-period`(하프타임 되돌리기)를 새로 추가했다. `next-period`는
 * 백엔드가 배포 호환용으로 당분간만 계속 받는 값이라(`GameCommandName.
 * next_period`의 @deprecated 문서, apps/v1_api) 이 프런트 타입에서는
 * 아예 제거한다 — 새로 빌드되는 콘솔은 이 값을 절대 보내지 않는다.
 */
export type GameCommandName = 'start' | 'pause' | 'resume' | 'end' | 'end-period' | 'start-period' | 'revert-period';

export interface GameCommandRequest {
  expectedVersion: number;
  clientCommandId: string;
  takeoverToken: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface GameMutationResult {
  gameId: string;
  state: GameState;
  version: number;
  durableCommandId: string;
  replayed: boolean;
}

export interface GameRevisionMutationResult extends GameMutationResult {
  revisionId: string;
  revision: number;
  revisionState: string;
}

/** The event payload actually appended (REST `POST .../events` /
 * WS `game.event.append`) — matches `AppendGameEventDto`. */
export interface GameEventAppendInput {
  expectedVersion: number;
  clientEventId: string;
  takeoverToken: string;
  type: GameEventType;
  sideId?: string;
  participantId?: string;
  assistParticipantId?: string | null;
  period: number;
  clockMs: number;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface GameEventAppendResult extends GameMutationResult {
  clientEventId: string;
  sequence: number;
}

export interface GameTakeoverGrant {
  gameId: string;
  takeoverToken: string;
  version: number;
  lastSequence: number;
  expiresAt: string;
}
