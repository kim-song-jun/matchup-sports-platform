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
 */

export type TournamentRegistrationBlockReason =
  | 'not_open'
  | 'deadline_passed'
  | 'capacity_full';

export type TournamentCapacityInput = {
  status: string;
  teamCount: number;
  confirmedCount: number;
  pendingPaymentCount?: number | null;
  registrationDeadlineAt?: string | null;
};

export type TournamentCapacity = {
  teamCount: number;
  confirmedCount: number;
  pendingPaymentCount: number;
  /** 정원을 점유한 팀 수 (확정 + 입금대기 계열). teamCount를 넘지 않게 clamp. */
  reservedCount: number;
  remainingCount: number;
  isFull: boolean;
};

export function resolveTournamentCapacity(tournament: TournamentCapacityInput): TournamentCapacity {
  const teamCount = Math.max(0, tournament.teamCount);
  const confirmedCount = Math.max(0, tournament.confirmedCount);
  const pendingPaymentCount = Math.max(0, tournament.pendingPaymentCount ?? 0);
  const reservedCount = Math.min(teamCount, confirmedCount + pendingPaymentCount);
  return {
    teamCount,
    confirmedCount,
    pendingPaymentCount,
    reservedCount,
    remainingCount: Math.max(0, teamCount - reservedCount),
    isFull: teamCount > 0 && confirmedCount + pendingPaymentCount >= teamCount,
  };
}

/**
 * 새 신청(취소 후 재신청 포함)을 막는 이유. 막을 이유가 없으면 null.
 * 서버가 거절하는 순서와 같게 검사한다 — 상태 → 마감 → 정원.
 */
export function resolveTournamentRegistrationBlock(
  tournament: TournamentCapacityInput,
  now: Date = new Date(),
): TournamentRegistrationBlockReason | null {
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

/** "확정 5팀 · 입금대기 3팀 / 총 8팀" — 세 화면이 같은 낱말을 쓰게 한다. */
export function describeTournamentCapacity(capacity: TournamentCapacity): string {
  const parts = [`확정 ${capacity.confirmedCount}팀`];
  if (capacity.pendingPaymentCount > 0) {
    parts.push(`입금대기 ${capacity.pendingPaymentCount}팀`);
  }
  return `${parts.join(' · ')} / 총 ${capacity.teamCount}팀`;
}

/** 사용자에게 보여줄 차단 이유. 정원 마감은 입금대기가 정원을 쥐고 있다는 사실까지 알려준다. */
export function describeTournamentRegistrationBlock(
  reason: TournamentRegistrationBlockReason,
  capacity: TournamentCapacity,
): string {
  if (reason === 'not_open') return '지금은 참가 신청을 받지 않아요.';
  if (reason === 'deadline_passed') return '신청이 마감돼서 새로 신청할 수 없어요.';
  return capacity.pendingPaymentCount > 0
    ? `정원이 가득 찼어요 — 입금대기 ${capacity.pendingPaymentCount}팀이 자리를 잡고 있어요. (${describeTournamentCapacity(capacity)})`
    : `정원이 가득 차서 새로 신청할 수 없어요. (${describeTournamentCapacity(capacity)})`;
}
