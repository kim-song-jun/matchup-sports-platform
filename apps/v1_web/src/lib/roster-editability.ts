/**
 * 명단을 **지금 고칠 수 있는가** 를 판정하는 규칙.
 *
 * **왜 별도 모듈인가** — 이 규칙을 쓰는 화면이 둘이다(팀장 명단 화면 · 내 신청 카드).
 * 처음엔 명단 화면 파일에서 직접 import 했는데, 그 파일은 훅을 여럿 쓰는 큰 클라이언트
 * 컴포넌트라 **판정 함수 두 개를 쓰려고 화면 하나가 통째로 다른 번들에 딸려 온다.**
 * 라우트끼리 묶이고 순환 import 위험도 생긴다(Copilot 리뷰 지적).
 *
 * 규칙 자체가 갈리면 **배지는 "수정 가능" 인데 눌러 들어가면 못 고치는** 상태가 난다 —
 * 실제로 그랬다(#4 후속). 두 화면이 이 모듈 하나만 본다.
 */

/**
 * 서버 `isRosterMutableTournament`(`apps/v1_api/.../roster-cleanup.ts`)와 같은 규칙 — open·closed·in_progress,
 * 그리고 **정규 리그는 초안(draft)도**(리그는 초안에서 신청이 확정되고 명단도 그때 받는다, Task 170).
 * 감사 finding #1(2026-08): 화면이 대회 status 를 안 봐서 완료·취소된 대회에서도
 * '수정 가능' 이 떠 있다가 서버 409(`TOURNAMENT_ROSTER_NOT_MUTABLE`)로 실패했다.
 * 서버 규칙이 바뀌면 이 함수도 함께 고친다.
 */
const ROSTER_MUTABLE_TOURNAMENT_STATUSES = new Set(['open', 'closed', 'in_progress']);

/** 대회가 아직 로딩 중이면(undefined) 막지 않는다 — 기존 낙관적 렌더링과 동일. */
export function isTournamentRosterMutable(
  tournament: { status?: string | null; kind?: string | null } | null | undefined,
): boolean {
  if (!tournament?.status) return true;
  if (ROSTER_MUTABLE_TOURNAMENT_STATUSES.has(tournament.status)) return true;
  return tournament.kind === 'regular_league' && tournament.status === 'draft';
}

/**
 * 명단을 못 고치는 이유를 사실대로 말한다 — 아직 공개 전인 대회를 "종료·취소"로 안내하지 않는다.
 * 정규 리그(`kind === 'regular_league'`)는 "대회" 대신 "리그"라고 부른다.
 *
 * 리그는 모든 경기 결과가 확정되면 시즌 종료일 전에도 서버가 `completed` 로 자동 전이한다.
 * 시즌이 남았는데 그냥 "종료"라고만 하면 진행 중으로 읽히므로, 그 경우에만 이유를 말한다.
 */
export function tournamentRosterClosedMessage(
  status: string | null | undefined,
  kind?: string | null,
  seasonEndAt?: string | null,
  nowMs: number = Date.now(),
): string {
  const isLeague = kind === 'regular_league';
  if (isLeague && status === 'completed' && seasonEndAt && nowMs < new Date(seasonEndAt).getTime()) {
    return '모든 경기 결과가 확정돼 리그가 종료 처리됐어요. 더 이상 선수 명단을 수정할 수 없어요.';
  }
  const subject = isLeague ? '리그' : '대회';
  return status === 'completed' || status === 'cancelled'
    ? `${subject}가 종료되었거나 취소돼 더 이상 선수 명단을 수정할 수 없어요.`
    : `${subject}가 아직 공개되지 않아 선수 명단을 수정할 수 없어요.`;
}

export type RosterDeadlineState = {
  /** 명단 제출 마감이 지나 예외 없이는 편집이 막힌 상태 */
  blocked: boolean;
  /** 마감은 지났지만 어드민이 예외를 허용해 편집 가능한 상태 */
  overridden: boolean;
};

/**
 * 명단 제출 마감 상태.
 *
 * - 마감일이 없으면 항상 편집 가능.
 * - 마감일이 지났고 어드민 예외(override)가 없으면 편집 차단.
 * - 마감일이 지났어도 어드민 예외가 있으면 편집 가능(`overridden` 으로 안내만 표시).
 */
export function getRosterDeadlineState(
  rosterDeadlineAt: string | null | undefined,
  overrideAt: string | null | undefined,
  now: Date = new Date(),
): RosterDeadlineState {
  if (!rosterDeadlineAt) return { blocked: false, overridden: false };
  const deadline = new Date(rosterDeadlineAt);
  if (Number.isNaN(deadline.getTime())) return { blocked: false, overridden: false };
  const isPast = now.getTime() > deadline.getTime();
  if (!isPast) return { blocked: false, overridden: false };
  return overrideAt ? { blocked: false, overridden: true } : { blocked: true, overridden: false };
}

/** 명단을 못 고치는 이유 하나. null 이면 막힌 데가 없다. */
export type RosterEditBlockReason = 'closed' | 'locked' | 'cancelled' | 'deadline' | null;

/** 막힌 사유 하나 — 종료 > 잠금 > 취소 > 제출 마감(서버 assertRosterMutable 과 같은 순서). */
export function rosterEditBlockReason(flags: {
  isTournamentRosterClosed: boolean;
  isRosterLocked: boolean;
  isRosterEditBlockedByStatus: boolean;
  isRosterDeadlineBlocked: boolean;
}): RosterEditBlockReason {
  if (flags.isTournamentRosterClosed) return 'closed';
  if (flags.isRosterLocked) return 'locked';
  if (flags.isRosterEditBlockedByStatus) return 'cancelled';
  if (flags.isRosterDeadlineBlocked) return 'deadline';
  return null;
}

/** 명단 화면과 대회·리그 상세 "우리 팀 참가" 카드가 같은 배지를 단다. */
export const ROSTER_BLOCK_BADGE_LABEL: Record<NonNullable<RosterEditBlockReason>, string> = {
  closed: '수정 불가',
  cancelled: '수정 불가',
  locked: '명단 마감',
  deadline: '제출 마감',
};

/**
 * 신청 하나의 명단이 지금 막혔는지 — 명단 화면이 따로 세는 네 조건을 한 번에 본다.
 * 팀장·매니저인지는 묻지 않는다(그건 보는 사람의 문제라 호출하는 화면이 따로 판정한다).
 */
export function registrationRosterBlockReason(
  competition: NonNullable<Parameters<typeof isTournamentRosterMutable>[0]> & { rosterDeadlineAt: string | null },
  registration: { status: string; rosterLockedAt: string | null; rosterDeadlineOverrideAt: string | null },
  now: Date = new Date(),
): RosterEditBlockReason {
  return rosterEditBlockReason({
    isTournamentRosterClosed: !isTournamentRosterMutable(competition),
    isRosterLocked: Boolean(registration.rosterLockedAt),
    isRosterEditBlockedByStatus: registration.status === 'cancel_requested' || registration.status === 'cancelled',
    isRosterDeadlineBlocked: getRosterDeadlineState(competition.rosterDeadlineAt, registration.rosterDeadlineOverrideAt, now)
      .blocked,
  });
}
