import { type Prisma, V1CompetitionKind, type V1TournamentRegistrationStatus } from '@prisma/client';

/**
 * 참가 신청의 **정원 상한**을 돌려준다. `null` 이면 상한이 없다 — 검사를 건너뛴다.
 *
 * 정규 대회의 정원은 `teamCount`, 정규 리그의 선택적 정원은 `maxTeams`다.
 * 리그 저장 행의 `teamCount`는 과거 기본값 8이며 운영자가 정한 상한이 아니다.
 * `maxPlayers`는 팀당 선수 명단 정원이라 여기서 읽지 않는다.
 * 기존 리그와 생략한 요청은 `maxTeams=null`인 무제한 동작을 유지한다.
 */
export function capacityLimitOf(competition: {
  kind: V1CompetitionKind | null;
  teamCount: number;
  maxTeams?: number | null;
}): number | null {
  if (competition.kind === V1CompetitionKind.regular_league) return competition.maxTeams ?? null;
  // `kind: null` 은 R1 이전의 옛 대회다 — 대회 쪽에 붙는다(`tournament-surface-lookup.ts`
  // 의 같은 규칙). 옛 대회의 정원이 조용히 풀리면 안 된다.
  return competition.teamCount;
}

/** `capacityLimitOf` 가 `null` 이 아니고 이미 찼는지. 상한이 없으면 항상 `false`. */
export function isCapacityFull(
  competition: { kind: V1CompetitionKind | null; teamCount: number; maxTeams?: number | null },
  reservedCount: number,
): boolean {
  const limit = capacityLimitOf(competition);
  return limit !== null && reservedCount >= limit;
}

const PENDING_CAPACITY_STATUSES: readonly V1TournamentRegistrationStatus[] = [
  'awaiting_payment', 'payment_checking', 'paid',
];
/** 출처와 무관한 예약 점유. waitlisted·cancel_requested는 자리를 점유하지 않는다. */
export const CAPACITY_HOLD_STATUSES: readonly V1TournamentRegistrationStatus[] = [...PENDING_CAPACITY_STATUSES, 'confirmed'];

/** 호출자는 같은 tournament 행을 잠근 뒤 읽고 상태를 바꿔야 마지막 자리가 직렬화된다. */
export function countCapacityReservations(
  db: Pick<Prisma.TransactionClient, 'v1TournamentRegistration'>,
  tournamentId: string,
  excludedRegistrationId?: string,
): Promise<number> {
  return db.v1TournamentRegistration.count({ where: {
    tournamentId, status: { in: [...CAPACITY_HOLD_STATUSES] },
    ...(excludedRegistrationId === undefined ? {} : { id: { not: excludedRegistrationId } }),
  } });
}

/** 공개·관리 상세가 같은 결제/확인 대기 점유를 보여 준다. 출처는 제한하지 않는다. */
export function countPendingCapacityReservations(
  db: Pick<Prisma.TransactionClient, 'v1TournamentRegistration'>,
  tournamentId: string,
): Promise<number> {
  return db.v1TournamentRegistration.count({ where: { tournamentId, status: { in: [...PENDING_CAPACITY_STATUSES] } } });
}
