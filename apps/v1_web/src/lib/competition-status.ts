import type { V1LeagueFixture } from '@/types/league-match';
import {
  ARRIVAL_PENDING_LABEL,
  GAME_STATE_MATCH_PHASE,
  LEAGUE_SUBJECT_LABEL,
  MATCH_SUBJECT_LABEL,
  competitionKindLabel,
  gameRosterReasonLabel,
  gameRosterStatusLabel,
  leagueSeasonStageLabel,
  leagueStateLabel,
  matchPhaseLabel,
  type CompetitionKindKey,
  type LeagueSeasonStage,
  type LeagueStateKey,
  type MatchPhase,
} from './v1-status-labels';

/**
 * 리그·경기·명단 상태 모델 (Task 180 G13 C안 "한 규칙, 한 칩").
 *
 * 화면마다 따로 정하던 상태 칩의 문구·톤·아이콘과 안내 노출 조건을 여기서만 계산한다.
 * 두 규칙이 모든 화면에 걸린다:
 * - 기본 상태는 칩이 없다(출전·매칭됨 같은 "원래 그런" 상태). 바뀐 것만 칩이 붙는다.
 * - 리그 상태와 경기 상태가 한 화면에 함께 나오면 칩 앞에 대상("리그 · ", "경기 · ")을 붙인다.
 * 문구는 `v1-status-labels.ts` 가 단일 소스다. 렌더는 `components/v1-ui/status-chip.tsx`.
 */

export type StatusChipTone = 'blue' | 'grey' | 'green' | 'orange' | 'red';
export type StatusChipIcon = 'clock' | 'hourglass' | 'live' | 'pause' | 'check' | 'cancel' | 'draft';

export interface StatusChipModel {
  readonly label: string;
  readonly tone: StatusChipTone;
  /** null 이면 글자만 — 색만으로 뜻을 전하지 않으므로 글자는 늘 있다. */
  readonly icon: StatusChipIcon | null;
}

const LEAGUE_STATE_CHIP: Record<LeagueStateKey, Omit<StatusChipModel, 'label'>> = {
  draft: { tone: 'grey', icon: 'draft' },
  active: { tone: 'blue', icon: 'live' },
  completed: { tone: 'green', icon: 'check' },
  on_hold: { tone: 'orange', icon: 'pause' },
};

export function leagueStateChip(state: LeagueStateKey, options: { withSubject?: boolean } = {}): StatusChipModel {
  const label = leagueStateLabel(state);
  return { ...LEAGUE_STATE_CHIP[state], label: options.withSubject ? `${LEAGUE_SUBJECT_LABEL} · ${label}` : label };
}

const MATCH_PHASE_CHIP: Record<MatchPhase, Omit<StatusChipModel, 'label'>> = {
  scheduled: { tone: 'grey', icon: 'clock' },
  awaiting_result: { tone: 'orange', icon: 'hourglass' },
  live: { tone: 'blue', icon: 'live' },
  paused: { tone: 'orange', icon: 'pause' },
  ended: { tone: 'grey', icon: 'check' },
  cancelled: { tone: 'red', icon: 'cancel' },
};

export function matchPhaseChip(
  phase: MatchPhase,
  options: { withSubject?: boolean; count?: number } = {},
): StatusChipModel {
  const base = matchPhaseLabel(phase);
  const counted = options.count === undefined ? base : `${base} ${options.count}`;
  return { ...MATCH_PHASE_CHIP[phase], label: options.withSubject ? `${MATCH_SUBJECT_LABEL} · ${counted}` : counted };
}

/** 운영 상태(GameState)로 읽는 경기 칩. 모르는 값은 칩 없이 둔다(영문 코드 노출 방지). */
export function gameStateChip(state: string): StatusChipModel | null {
  const phase = GAME_STATE_MATCH_PHASE[state];
  return phase === undefined ? null : matchPhaseChip(phase);
}

const COMPETITION_KIND_TONE: Record<CompetitionKindKey, StatusChipTone> = {
  TOURNAMENT: 'blue',
  LEAGUE: 'green',
  FRIENDLY: 'grey',
};

export function competitionKindChip(kind: CompetitionKindKey): StatusChipModel {
  return { label: competitionKindLabel(kind), tone: COMPETITION_KIND_TONE[kind], icon: null };
}

// ── 리그 대진 ────────────────────────────────────────────────────────────────

type LeagueFixturePhaseInput = Pick<
  V1LeagueFixture,
  'status' | 'startAt' | 'homeScore' | 'awayScore' | 'scoreHidden' | 'gameState'
>;

/**
 * 리그 대진 한 경기의 단계. 리그 대진은 status='matched' 로 만들어져 결과가 제출돼야 바뀌므로
 * 킥오프가 지났는데 결과가 없으면 '결과 대기'다(status 만 보면 '예정'으로 잘못 읽힌다).
 * 점수가 가려진 대진(`scoreHidden`)은 결과가 확정돼 있어 '종료'다.
 * 게임 상태가 있으면 킥오프 시각보다 먼저 본다 — 예정보다 일찍 시작·종료한 경기가 '예정'으로 남지 않게(W4-V13).
 */
export function leagueFixturePhase(fixture: LeagueFixturePhaseInput, nowMs: number = Date.now()): MatchPhase {
  if (fixture.status === 'cancelled' || fixture.gameState === 'CANCELLED') return 'cancelled';
  if (fixture.scoreHidden === true) return 'ended';
  if (typeof fixture.homeScore === 'number' && typeof fixture.awayScore === 'number') return 'ended';
  if (fixture.gameState === 'LIVE') return 'live';
  if (fixture.gameState === 'PAUSED') return 'paused';
  if (fixture.gameState === 'ENDED') return 'awaiting_result';
  if (fixture.status === 'completed' || new Date(fixture.startAt).getTime() <= nowMs) return 'awaiting_result';
  return 'scheduled';
}

/** 결과가 들어오기 전의 경기 단계 — 어드민 대진 표 '결과' 열이 결과 단계 대신 그린다. */
export type PreResultMatchPhase = Extract<MatchPhase, 'scheduled' | 'live' | 'paused' | 'cancelled'>;

export type LeagueFixtureResultCell =
  | { readonly kind: 'phase'; readonly phase: PreResultMatchPhase }
  | { readonly kind: 'result'; readonly stage: NonNullable<V1LeagueFixture['resultStage']> };

/**
 * 어드민 대진 표 '결과' 열. 결과가 아직 없는(not_entered) 경기는 `leagueFixturePhase` 의 단계를 그려
 * 진행 중·예정 경기가 '결과 미입력'으로 읽히지 않게 한다(W6-V4). 취소는 결과 단계보다 먼저다.
 */
export function leagueFixtureResultCell(
  fixture: LeagueFixturePhaseInput & Pick<V1LeagueFixture, 'resultStage'>,
  nowMs: number = Date.now(),
): LeagueFixtureResultCell {
  const phase = leagueFixturePhase(fixture, nowMs);
  const stage = fixture.resultStage ?? 'not_entered';
  if (phase === 'cancelled') return { kind: 'phase', phase };
  if (stage === 'not_entered' && (phase === 'scheduled' || phase === 'live' || phase === 'paused')) {
    return { kind: 'phase', phase };
  }
  return { kind: 'result', stage };
}

const PUBLIC_STATUS_GAME_STATE: Record<string, NonNullable<LeagueFixturePhaseInput['gameState']>> = {
  scheduled: 'SCHEDULED',
  live: 'LIVE',
  ended: 'ENDED',
  cancelled: 'CANCELLED',
};

/**
 * 공개 경기 기록(`/fixtures/:id/record`)의 `status` 를 대진에 덧씌운다. 기록은 진행 중일 때 10초마다
 * 새로 읽혀 대진 목록 응답보다 최신이라, 경기 상세는 이 값으로 단계를 정한다('live' 는 LIVE·PAUSED 둘 다).
 */
export function withPublicRecordGameState<T extends LeagueFixturePhaseInput>(fixture: T, recordStatus: string | undefined): T {
  const gameState = recordStatus === undefined ? undefined : PUBLIC_STATUS_GAME_STATE[recordStatus];
  return gameState === undefined ? fixture : { ...fixture, gameState };
}

export interface LeagueFixturePhaseCounts {
  readonly scheduled: number;
  readonly awaitingResult: number;
  readonly live: number;
  readonly ended: number;
}

/** 취소 대진은 순위 집계에서 빠지므로 세지 않는다. */
export function countLeagueFixturePhases(
  fixtures: readonly LeagueFixturePhaseInput[],
  nowMs: number = Date.now(),
): LeagueFixturePhaseCounts {
  const counts = { scheduled: 0, awaitingResult: 0, live: 0, ended: 0 };
  for (const fixture of fixtures) {
    const phase = leagueFixturePhase(fixture, nowMs);
    if (phase === 'scheduled') counts.scheduled += 1;
    else if (phase === 'awaiting_result') counts.awaitingResult += 1;
    else if (phase === 'live' || phase === 'paused') counts.live += 1;
    else if (phase === 'ended') counts.ended += 1;
  }
  return counts;
}

/** 순위표 자리의 집계 칩 — 예정·결과 대기·종료는 0 이어도 늘 싣고, 진행 중은 있을 때만. */
export function leagueFixtureCountChips(counts: LeagueFixturePhaseCounts): StatusChipModel[] {
  return [
    matchPhaseChip('scheduled', { count: counts.scheduled }),
    ...(counts.live > 0 ? [matchPhaseChip('live', { count: counts.live })] : []),
    matchPhaseChip('awaiting_result', { count: counts.awaitingResult }),
    matchPhaseChip('ended', { count: counts.ended }),
  ];
}

export function leagueSeasonStage(leagueState: LeagueStateKey, counts: LeagueFixturePhaseCounts): LeagueSeasonStage {
  if (leagueState === 'completed') return 'completed';
  if (counts.awaitingResult > 0) return 'awaiting_result';
  if (counts.ended === 0 && counts.live === 0) return 'preseason';
  return 'in_progress';
}

/**
 * 순위표 자리의 한 줄(옛 "확인 중" 상자와 동률 안내를 대신한다). 종료된 시즌은 "최종 순위"
 * 표기와 시즌 결산 카드가 이미 말하므로 줄이 없다.
 */
export function leagueSeasonStageLine(
  stage: LeagueSeasonStage,
  context: { counts: LeagueFixturePhaseCounts; nextStartLabel: string | null },
): { title: string; text: string | null } | null {
  const title = leagueSeasonStageLabel(stage);
  switch (stage) {
    case 'completed':
      return null;
    case 'preseason':
      return {
        title,
        text: context.nextStartLabel === null
          ? '첫 경기가 끝나면 순위가 생겨요'
          : `첫 경기 ${context.nextStartLabel}부터 순위가 생겨요`,
      };
    case 'awaiting_result':
      return { title, text: `킥오프가 지난 ${context.counts.awaitingResult}경기의 결과를 기다려요` };
    case 'in_progress':
      return { title, text: context.nextStartLabel === null ? null : `다음 경기 ${context.nextStartLabel}` };
  }
}

/** 한 팀이라도 치른 경기가 있어야 순위가 뜻을 갖는다 — 그 전엔 동점자 사전순 폴백일 뿐이라 참가 팀 목록을 보여 준다. */
export function leagueStandingsHaveResults(rows: readonly { played: number }[]): boolean {
  return rows.some((row) => row.played > 0);
}

// ── 경기 명단 ────────────────────────────────────────────────────────────────

export type GameRosterChipStatus = 'PARTICIPATING' | 'EXCLUDED' | 'UNAVAILABLE' | 'SUSPENDED' | 'NOT_IN_ROSTER';

const ROSTER_STATUS_TONE: Record<Exclude<GameRosterChipStatus, 'PARTICIPATING'>, StatusChipTone> = {
  EXCLUDED: 'grey',
  UNAVAILABLE: 'orange',
  SUSPENDED: 'red',
  NOT_IN_ROSTER: 'grey',
};

/** 선수 한 명의 이번 경기 상태 칩. 출전은 기본 상태라 칩이 없다. 빠짐·결장은 사유를 잇는다. */
export function gameRosterStatusChip(
  status: GameRosterChipStatus,
  detail: { reason?: string | null; remainingMatches?: number | null } = {},
): StatusChipModel | null {
  if (status === 'PARTICIPATING') return null;
  const statusLabel = gameRosterStatusLabel(status, detail.remainingMatches);
  const reasonLabel = status === 'EXCLUDED' || status === 'UNAVAILABLE' ? gameRosterReasonLabel(detail.reason) : null;
  return {
    label: reasonLabel === null ? statusLabel : `${statusLabel} · ${reasonLabel}`,
    tone: ROSTER_STATUS_TONE[status],
    icon: null,
  };
}

/** 명단을 바꿀 수 없는 사람에게만 누가 바꾸는지 알린다 — 바꿀 수 있는 사람에겐 필요 없는 문장이다. */
export function rosterPermissionHint(canManage: boolean): string | null {
  return canManage ? null : '팀장·매니저만 명단을 바꿀 수 있어요.';
}

/**
 * 경기 상세의 "내 기록 연결" 입구. 경기가 시작된 뒤, 이 경기 기록에 내 계정이 연결되지 않은
 * 사람에게만 — 명단에 없거나, 명단에는 있지만 계정 없이 기록되는 리그 폴백 팀원.
 */
export function shouldOfferRecordClaim(input: {
  gameState: string;
  viewerRow: { accountLinked: boolean } | undefined;
}): boolean {
  if (input.gameState === 'SCHEDULED' || input.gameState === 'CANCELLED') return false;
  return input.viewerRow?.accountLinked !== true;
}

// ── 도착 확인(검인) ──────────────────────────────────────────────────────────

export const ARRIVAL_PENDING_CHIP: StatusChipModel = { label: ARRIVAL_PENDING_LABEL, tone: 'orange', icon: null };

/**
 * 도착 확인을 한 명이라도 한 경기에서만 "도착 전"을 가른다 — 아무도 확인하지 않았다면
 * 전원이 도착 전이라 표시가 정보가 아니라 잡음이 된다.
 */
export function arrivalCheckInUsed(participants: readonly { arrivedAt: string | null }[]): boolean {
  return participants.some((participant) => participant.arrivedAt !== null);
}

export function splitByArrival<T extends { arrivedAt: string | null }>(
  participants: readonly T[],
): { arrived: T[]; pending: T[] } {
  return {
    arrived: participants.filter((participant) => participant.arrivedAt !== null),
    pending: participants.filter((participant) => participant.arrivedAt === null),
  };
}
