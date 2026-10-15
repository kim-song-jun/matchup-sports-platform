/**
 * 대회 신규·재신청 가능 여부를 한 곳에서 판정한다.
 *
 * 기존에는 각 화면이 제각각 판정했다 — 팀별 신청 허브는 `confirmedCount + pendingPaymentCount
 * < teamCount`만 봤고(마감 시각 누락), 참가 신청 위저드는 정원·마감을 아예 보지 않아서
 * 사용자가 약관까지 다 채운 뒤 제출 순간에야 서버 409(`TOURNAMENT_CAPACITY_FULL` /
 * `REGISTRATION_DEADLINE_PASSED`)를 만났다. 서버는 `awaiting_payment · payment_checking ·
 * paid · confirmed`를 모두 정원 점유로 세므로(`tournament-registrations.service.ts`),
 * 입금대기 팀이 정원을 채운 대회는 "5 / 8"처럼 여유가 있어 보여도 실제로는 신청을 받을 수 없다.
 * 그 간극이 "왜 신청이 안 받아지냐"의 원인이었다.
 * 정규 리그는 fixture 생성 뒤에도 미래 registrationDeadlineAt까지 신청할 수 있다.
 * 참가팀 정원은 별도 maxTeams로 판정하며 null·미설정은 무제한이다.
 */

export type TournamentRegistrationBlockReason =
  | 'not_open'
  | 'deadline_passed'
  | 'capacity_full';

export type TournamentCapacityInput = {
  status: string;
  /** 참가팀 정원. 팀당 선수 정원(maxPlayers)이나 대진 템플릿 팀 수와 별개다. */
  maxTeams?: number | null;
  confirmedCount: number;
  pendingPaymentCount?: number | null;
  registrationDeadlineAt?: string | null;
} & (
  | { kind: 'regular_league'; teamCount?: number }
  | { kind?: 'regular_league' | 'regular_tournament' | null; teamCount: number }
);

export type TournamentCapacity = {
  /** null은 무제한이다. 정규 대회는 기존 teamCount를 사용한다. */
  teamCount: number | null;
  confirmedCount: number;
  pendingPaymentCount: number;
  /** 확정 + 입금대기 계열. 리그는 정원 초과 이력도 실제 점유 수로 유지한다. */
  reservedCount: number;
  remainingCount: number | null;
  isFull: boolean;
};

export function resolveTournamentCapacity(tournament: TournamentCapacityInput): TournamentCapacity {
  const teamCount = tournament.kind === 'regular_league'
    ? tournament.maxTeams ?? null
    : Math.max(0, tournament.teamCount);
  const confirmedCount = Math.max(0, tournament.confirmedCount);
  const pendingPaymentCount = Math.max(0, tournament.pendingPaymentCount ?? 0);
  const occupiedCount = confirmedCount + pendingPaymentCount;
  const reservedCount = tournament.kind === 'regular_league' || teamCount === null
    ? occupiedCount
    : Math.min(teamCount, occupiedCount);
  return {
    teamCount,
    confirmedCount,
    pendingPaymentCount,
    reservedCount,
    remainingCount: teamCount === null ? null : Math.max(0, teamCount - reservedCount),
    // 서버와 같은 부등식(reservedCount >= teamCount)을 쓴다 — `teamCount > 0` 가드를 두면
    // 정원이 0인 대회를 프론트만 "신청 가능"으로 판정해 서버 409와 어긋난다.
    isFull: teamCount !== null && occupiedCount >= teamCount,
  };
}

/**
 * 새 신청(취소 후 재신청 포함)을 막는 이유. 막을 이유가 없으면 null.
 * 일반 대회는 서버가 거절하는 순서와 같게 상태 → 마감 → 정원을 검사한다. 정규 리그는
 * 종료 상태와 마감에 이어 선택적 참가팀 정원을 검사한다.
 */
export function resolveTournamentRegistrationBlock(
  tournament: TournamentCapacityInput,
  now: Date = new Date(),
): TournamentRegistrationBlockReason | null {
  if (tournament.kind === 'regular_league') {
    // The API keeps league registration open while a future deadline exists, even
    // after fixture generation changes the mirror status to in_progress. Leagues
    // reserve places independently of the registration time/status window.
    if (tournament.status === 'completed' || tournament.status === 'cancelled') return 'not_open';
    if (!tournament.registrationDeadlineAt) return 'not_open';
    const deadline = new Date(tournament.registrationDeadlineAt).getTime();
    if (!Number.isFinite(deadline)) return 'not_open';
    if (deadline < now.getTime()) return 'deadline_passed';
    return resolveTournamentCapacity(tournament).isFull ? 'capacity_full' : null;
  }
  if (tournament.status !== 'open') return 'not_open';
  if (tournament.registrationDeadlineAt) {
    const deadline = new Date(tournament.registrationDeadlineAt).getTime();
    if (Number.isFinite(deadline) && deadline < now.getTime()) return 'deadline_passed';
  }
  if (resolveTournamentCapacity(tournament).isFull) return 'capacity_full';
  return null;
}

export function canStartTournamentRegistration(
  tournament: TournamentCapacityInput,
  now: Date = new Date(),
): boolean {
  return resolveTournamentRegistrationBlock(tournament, now) === null;
}

/**
 * 정원을 쥔 채 기다리는 팀을 뭐라고 부를지. **한 곳에서만 정한다.**
 *
 * 무료 대회에서 기다리는 것은 입금이 아니라 운영자 확인이다. 이 낱말이 화면마다 하드코딩돼
 * 있어서 한 군데를 고쳐도 목록 카드·진행바 `aria-label`·모바일 정원 카드에는 옛 문구가
 * 그대로 남았다(2026-09-04 Copilot 리뷰). **특히 `aria-label`** — 스크린리더 사용자에게는
 * 화면에서 고친 문구가 아니라 그쪽이 들린다.
 */
export function pendingCapacityLabel(isFreeEntry: boolean): string {
  return isFreeEntry ? '확인대기' : '입금대기';
}

/**
 * "확정 5팀 · 입금대기 3팀 / 총 8팀" — 세 화면이 같은 낱말을 쓰게 한다.
 *
 * **무료 대회에서는 "입금대기" 가 틀린 말이다.** 낼 돈이 없으니 기다리는 것은 입금이 아니라
 * 운영자 확인이다. 서버 필드 이름(`pendingPaymentCount`)이 그대로 화면 낱말이 돼 있었고,
 * 2026-09-04 alpha 실측에서 참가비 0원 대회의 요약줄이 "입금대기 1팀" 으로 떴다.
 */
export function describeTournamentCapacity(
  capacity: TournamentCapacity,
  isFreeEntry = false,
): string {
  const parts = [`확정 ${capacity.confirmedCount}팀`];
  if (capacity.pendingPaymentCount > 0) {
    parts.push(`${pendingCapacityLabel(isFreeEntry)} ${capacity.pendingPaymentCount}팀`);
  }
  return capacity.teamCount === null
    ? `${parts.join(' · ')} / 참가팀 정원 무제한`
    : `${parts.join(' · ')} / 총 ${capacity.teamCount}팀`;
}

/** 사용자에게 보여줄 차단 이유. 정원 마감은 입금대기가 정원을 쥐고 있다는 사실까지 알려준다. */
export function describeTournamentRegistrationBlock(
  reason: TournamentRegistrationBlockReason,
  capacity: TournamentCapacity,
  isFreeEntry = false,
): string {
  if (reason === 'not_open') return '지금은 참가 신청을 받지 않아요.';
  if (reason === 'deadline_passed') return '신청이 마감돼서 새로 신청할 수 없어요.';
  const waiting = pendingCapacityLabel(isFreeEntry);
  return capacity.pendingPaymentCount > 0
    ? `정원이 가득 찼어요 — ${waiting} ${capacity.pendingPaymentCount}팀이 자리를 잡고 있어요. (${describeTournamentCapacity(capacity, isFreeEntry)})`
    : `정원이 가득 차서 새로 신청할 수 없어요. (${describeTournamentCapacity(capacity, isFreeEntry)})`;
}
