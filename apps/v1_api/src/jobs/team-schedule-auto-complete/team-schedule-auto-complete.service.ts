import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';

export const TEAM_SCHEDULE_AUTO_COMPLETE_SCAN_TYPE = 'TEAM_SCHEDULE_AUTO_COMPLETE_SCAN';

const SCAN_INTERVAL_MS = 10 * 60 * 1000;
/** 한 스캔에서 처리하는 최대 건수. 남은 건은 다음 스캔이 이어서 한다(워커 트랜잭션 시간 한도 안에 끝내려고). */
const SCAN_BATCH_SIZE = 100;
/** 종료 시각이 지나고 이만큼 더 기다린다 — 팀장이 직접 「완료 처리」하거나 취소할 여유. */
export const AUTO_COMPLETE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * 끝난 지 오래된 「예정」 훈련·모임을 알림 없이 「완료」로 바꾼다(2026-11-23 사용자 결정, A안).
 *
 * - 대상은 팀이 직접 만든 훈련·모임(`teamMatchId` 없음)뿐이다. 팀 매치·리그·대회 일정은 경기 결과가 상태를 정한다.
 * - 취소가 아니라 완료다 — 취소하면 팀원 전체에게 취소 알림이 나가고, 이미 진행된 일정을 취소로 남기게 된다.
 * - 직접 「완료 처리」할 때(`TeamSchedulesService.complete`)와 같이 열려 있는 용병 모집은 닫는다. 알림은 보내지 않는다.
 *
 * 라인업 리마인더·상대 없는 팀매치 취소와 같은 자기 예약 스캔이다 — 스캔이 끝날 때 다음 스캔을 outbox 행으로 예약한다.
 */
export class TeamScheduleAutoCompleteService {
  constructor(private readonly prisma: PrismaService) {}

  /** 다음 스캔 예약을 스캔과 다른 트랜잭션으로 먼저 커밋한다 — 스캔이 실패해도 체인이 끊기지 않는다. */
  readonly scanHandler: GameOperationHandler = async (_claim, tx) => {
    const now = new Date();
    await this.prisma.$transaction((scheduleTx) => scheduleNextScheduleAutoCompleteScan(scheduleTx, now));
    await completeEndedSchedules(tx, now);
  };
}

/** 완료로 바꾼 건수를 돌려준다. */
export async function completeEndedSchedules(tx: Prisma.TransactionClient, now: Date): Promise<number> {
  const candidates = await tx.v1TeamSchedule.findMany({
    where: {
      state: 'SCHEDULED',
      type: { in: ['TRAINING', 'EVENT'] },
      teamMatchId: null,
      endAt: { lte: new Date(now.getTime() - AUTO_COMPLETE_GRACE_MS) },
    },
    select: { id: true },
    orderBy: [{ endAt: 'asc' }, { id: 'asc' }],
    take: SCAN_BATCH_SIZE,
  });
  if (candidates.length === 0) return 0;
  const ids = candidates.map((candidate) => candidate.id);
  // 팀장이 같은 순간 직접 처리했을 수 있어 상태 조건을 한 번 더 건다(이미 바뀐 행은 건드리지 않는다).
  const { count } = await tx.v1TeamSchedule.updateMany({
    where: { id: { in: ids }, state: 'SCHEDULED' },
    data: { state: 'COMPLETED', version: { increment: 1 } },
  });
  await tx.v1ScheduleGuestRecruitment.updateMany({
    where: { scheduleId: { in: ids }, state: 'OPEN' },
    data: { state: 'CLOSED', version: { increment: 1 } },
  });
  return count;
}

/** 다음 스캔을 10분 슬롯 경계에 예약한다. 슬롯 키가 같으면 행이 하나만 생겨 재시도·워커 다중화에도 안전하다. */
export async function scheduleNextScheduleAutoCompleteScan(tx: Prisma.TransactionClient, now: Date): Promise<void> {
  const nextSlot = new Date(Math.floor(now.getTime() / SCAN_INTERVAL_MS) * SCAN_INTERVAL_MS + SCAN_INTERVAL_MS);
  await tx.v1OutboxEvent.createMany({
    data: [
      {
        businessKey: `team-schedule-auto-complete-scan:${nextSlot.toISOString()}`,
        aggregateType: 'V1_TEAM_SCHEDULE',
        aggregateId: 'auto-complete-scan',
        type: TEAM_SCHEDULE_AUTO_COMPLETE_SCAN_TYPE,
        payload: { scheduledFor: nextSlot.toISOString() },
        availableAt: nextSlot,
      },
    ],
    skipDuplicates: true,
  });
}
