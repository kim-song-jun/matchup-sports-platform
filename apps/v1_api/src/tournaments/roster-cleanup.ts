import { Prisma, V1TournamentStatus } from '@prisma/client';

// 팀을 벗어나는 모든 경로에서 대회 로스터를 함께 정리하기 위한 공용 헬퍼.
//
// 2026-08-03 프로덕션 사고: 회원 탈퇴(`withdrawal_pending`)를 신청하고 팀에서도 제거된
// 사용자가 **대회 로스터에는 활성 상태로 남아** 12명 정원 중 한 자리를 계속 차지했다.
// 팀은 남은 자리가 1개뿐이라 선수 두 명을 추가하지 못했고, 화면에서는 원인이 보이지
// 않았다(정원 초과는 서버가 막지만, 애초에 왜 자리가 없는지는 드러나지 않는다).
//
// 팀을 벗어나는 경로는 세 개이고 **셋 다** 로스터를 건드리지 않았다.
//   - ProfileService.withdrawalRequest  (회원 탈퇴)
//   - TeamsService.removeMembership     (추방)          ← 위 사고의 실제 경로
//   - TeamsService.leaveTeam            (자진 팀 탈퇴)
//
// Prisma 의 `onDelete` 로는 막을 수 없다. 이 도메인의 "삭제"는 전부 행 삭제가 아니라
// 상태 컬럼 업데이트라서 cascade 가 발동하지 않는다. 그래서 애플리케이션 레벨에서
// 명시적으로 정리한다.

// 정리 대상이 되는 대회 상태. **완료된 대회는 제외한다** — 수상 내역·리뷰·기록이
// 로스터를 참조하므로, 지난 대회에서 이름을 지우면 과거 기록이 깨진다. 아직 치르지
// 않았거나 진행 중인 대회에서만 자리를 비운다.
export const ROSTER_CLEANUP_TOURNAMENT_STATUSES = ['open', 'closed', 'in_progress'] as const;

/**
 * 명단을 바꿔도 되는 대회 상태. 위 cleanup 집합과 **같은 이유로 같은 값**이다 — 완료·취소된
 * 대회의 명단을 건드리면 수상 내역·리뷰·기록이 가리키는 대상이 달라진다. 탈퇴 정리가 완료
 * 대회를 건너뛰는데 정작 추가·제거는 열려 있으면 그 보호가 반쪽짜리가 된다.
 *
 * `draft` 는 제외해도 안전하다 — 신청 생성이 `status !== 'open'` 을 막으므로(2026-08-04 확인,
 * tournament-registrations.service.ts:103) draft 대회에는 신청 자체가 존재할 수 없다.
 */
export const ROSTER_MUTABLE_TOURNAMENT_STATUSES = ['open', 'closed', 'in_progress'] as const;

/** 위 집합에 속하는지. 리터럴 배열의 `includes` 는 인자 타입을 좁혀 버리므로 헬퍼로 감싼다. */
export function isRosterMutableTournamentStatus(status: V1TournamentStatus): boolean {
  return (ROSTER_MUTABLE_TOURNAMENT_STATUSES as readonly string[]).includes(status);
}

export type RosterCleanupOptions = {
  /** 특정 팀의 로스터만 정리한다. 생략하면 사용자의 모든 팀이 대상(회원 탈퇴). */
  teamId?: string;
  /** 같은 트랜잭션 안의 다른 기록과 시각을 맞추고 싶을 때 사용. */
  at?: Date;
};

/**
 * 사용자를 진행 중·예정 대회의 로스터에서 제거한다(`removedAt` 설정).
 *
 * 반환값은 실제로 제거된 로스터 항목 수 — 호출부가 로그에 남길 수 있도록 돌려준다.
 * 이미 제거된 항목은 건드리지 않으므로 같은 트랜잭션을 재실행해도 안전하다.
 */
export async function removeUserFromActiveRosters(
  tx: Prisma.TransactionClient,
  userId: string,
  options: RosterCleanupOptions = {},
): Promise<number> {
  // updateMany 는 관계 필터를 받지 못한다. 대상을 먼저 골라 id 로 갱신한다.
  const targets = await tx.v1TournamentPlayer.findMany({
    where: {
      userId,
      removedAt: null,
      registration: {
        ...(options.teamId ? { teamId: options.teamId } : {}),
        tournament: {
          status: { in: [...ROSTER_CLEANUP_TOURNAMENT_STATUSES] },
          deletedAt: null,
        },
      },
    },
    select: { id: true },
  });

  if (targets.length === 0) {
    return 0;
  }

  await tx.v1TournamentPlayer.updateMany({
    where: { id: { in: targets.map((target) => target.id) } },
    data: { removedAt: options.at ?? new Date() },
  });

  return targets.length;
}
