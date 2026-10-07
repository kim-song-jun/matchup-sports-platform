import type { Prisma, V1TournamentRegistrationStatus } from '@prisma/client';

/**
 * 팀이 직접 낸 '활성 신청' — 참가비 변경 사유 필수 판정과 어드민 상세의 신청 팀 수가 같이 쓴다.
 * `draft`(금액 스냅샷 없음)·`cancelled`(끝난 신청)는 제외한다.
 */
export const LEAGUE_ACTIVE_REGISTRATION_STATUSES: readonly V1TournamentRegistrationStatus[] = [
  'submitted',
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
  'cancel_requested',
];

/**
 * 운영자가 넣은 로스터 팀(`seeded`·`promoted`)은 입금이 없어 제외한다. `entrySource` 는
 * nullable 이고 null 은 default(applied) 이전 행 — 팀이 직접 신청한 것이므로 포함한다.
 */
export function leagueActiveRegistrationWhere(leagueId: string): Prisma.V1TournamentRegistrationWhereInput {
  return {
    tournamentId: leagueId,
    status: { in: [...LEAGUE_ACTIVE_REGISTRATION_STATUSES] },
    OR: [{ entrySource: 'applied' }, { entrySource: null }],
  };
}

export function countLeagueActiveRegistrations(
  client: Pick<Prisma.TransactionClient, 'v1TournamentRegistration'>,
  leagueId: string,
): Promise<number> {
  return client.v1TournamentRegistration.count({ where: leagueActiveRegistrationWhere(leagueId) });
}
