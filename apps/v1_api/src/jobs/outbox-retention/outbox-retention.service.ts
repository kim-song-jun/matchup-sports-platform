import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SECURITY_LOGIN_ANOMALY_TYPE } from '../../auth/login-security/login-security.policy';
import { COMPETITION_ROSTER_RESYNC_TYPE } from '../../games/roster/roster-resync-events';
import { INQUIRY_SLACK_NOTIFICATION_TYPE } from '../../inquiries/inquiry-slack-notifier';
import type { PrismaService } from '../../prisma/prisma.service';
import { LINEUP_INCLUDED_NOTIFICATION_TYPE } from '../../team-matches/team-match-lineup.service';
import {
  SCHEDULE_CANCELLED_NOTIFICATION_TYPE,
  SCHEDULE_CREATED_NOTIFICATION_TYPE,
} from '../../team-schedules/team-schedules.service';
import { WITHDRAWAL_FINALIZATION_REPORT_TYPE } from '../../users/withdrawal-finalization-report';
import { EMAIL_DELIVERY_FAILED_TYPE } from '../../verification/email/email-delivery-failure';
import { IDENTITY_LINK_EXPIRY_TYPE } from '../identity-link/identity-link-expiry.service';
import { LEAGUE_RESULT_ENTRY_REMINDER_TYPE } from '../league-reminders/league-result-entry-reminder.service';
import {
  LEAGUE_ROSTER_AUTOCONFIRM_TYPE,
  LEAGUE_ROSTER_REMINDER_TYPE,
} from '../league-roster/league-roster-autoconfirm.service';
import { LINEUP_REMINDER_SCAN_TYPE } from '../lineup-reminders/lineup-reminder.service';
import { LOGIN_SECURITY_RETENTION_SCAN_TYPE } from '../login-security-retention/login-security-retention.service';
import { TEAM_MATCH_NO_OPPONENT_SCAN_TYPE } from '../team-match-no-opponent/team-match-no-opponent-cancel.service';
import { TEAM_SCHEDULE_AUTO_COMPLETE_SCAN_TYPE } from '../team-schedule-auto-complete/team-schedule-auto-complete.service';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';

export const OUTBOX_RETENTION_SCAN_TYPE = 'OUTBOX_COMPLETED_RETENTION_SCAN';
export const OUTBOX_COMPLETED_RETENTION_DAYS = 30;

const SCAN_INTERVAL_MS = 60 * 60_000;
const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_MAX_BATCHES = 5;

/**
 * COMPLETED 행을 지워도 되는 종류. business_key 가 다시 만들어질 수 없거나(앞으로의 슬롯 시각,
 * 같은 트랜잭션에서 새로 만든 행의 id, 지금 시각의 창), 다시 만들어져도 알림·감사 쪽 고유 키가
 * 중복 발송을 막는다. 여기 없는 종류는 지우지 않는다. 특히 일정 리마인더 두 종류는 수동 요청이
 * 같은 키를 다시 넣을 수 있고 알림 중복 방지가 행 id 에 묶여 있어, 행을 지우면 같은 알림이 또 간다.
 */
export const PRUNABLE_COMPLETED_OUTBOX_TYPES: readonly string[] = [
  OUTBOX_RETENTION_SCAN_TYPE,
  LINEUP_REMINDER_SCAN_TYPE,
  TEAM_MATCH_NO_OPPONENT_SCAN_TYPE,
  TEAM_SCHEDULE_AUTO_COMPLETE_SCAN_TYPE,
  LOGIN_SECURITY_RETENTION_SCAN_TYPE,
  EMAIL_DELIVERY_FAILED_TYPE,
  INQUIRY_SLACK_NOTIFICATION_TYPE,
  SECURITY_LOGIN_ANOMALY_TYPE,
  WITHDRAWAL_FINALIZATION_REPORT_TYPE,
  'GAME_OPERATION_FLAG_CHANGED',
  'GAME_OPERATION_JOB_REQUEUED',
  'GAME_OPERATION_GATE_MODE_CHANGED',
  COMPETITION_ROSTER_RESYNC_TYPE,
  IDENTITY_LINK_EXPIRY_TYPE,
  LEAGUE_RESULT_ENTRY_REMINDER_TYPE,
  LEAGUE_ROSTER_REMINDER_TYPE,
  LEAGUE_ROSTER_AUTOCONFIRM_TYPE,
  LINEUP_INCLUDED_NOTIFICATION_TYPE,
  SCHEDULE_CREATED_NOTIFICATION_TYPE,
  SCHEDULE_CANCELLED_NOTIFICATION_TYPE,
  'SCHEDULE_GUEST_APPLICATION_MANAGER_NOTIFICATION',
  'GAME_RESULT_REVIEW_REMINDER',
  'GAME_RESULT_REVIEW_ESCALATION',
];

/** 보존 기간이 지난 COMPLETED 행을 지우는 자기 예약 스캔(한 시간마다). */
export class OutboxRetentionService {
  private readonly logger = new Logger(OutboxRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 다음 슬롯을 먼저 따로 커밋해 정리가 실패해도 체인이 끊기지 않는다. */
  readonly scanHandler: GameOperationHandler = async () => {
    const now = new Date();
    await this.prisma.$transaction((scheduleTx) => scheduleNextOutboxRetentionScan(scheduleTx, now));
    const deleted = await pruneCompletedOutboxEvents(this.prisma);
    this.logger.log(`deleted ${deleted} completed outbox events older than ${OUTBOX_COMPLETED_RETENTION_DAYS} days`);
  };
}

/**
 * 묶음마다 문장 하나로 지워(각자 커밋) 잠금을 짧게 둔다. 한 번에 최대 batchSize × maxBatches 행이라
 * 쌓인 행이 많아도 여러 스캔에 나뉘어 지워진다. 오래된 것부터 지운다.
 */
export async function pruneCompletedOutboxEvents(
  db: Pick<PrismaService, '$executeRaw'>,
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<number> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
  let deleted = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // available_at 조건이 (status, available_at) 색인을 타고, updated_at 은 완료 시각을 본다.
    const count = await db.$executeRaw`
      WITH doomed AS (
        SELECT id
        FROM v1_outbox_events
        WHERE status = 'COMPLETED'
          AND type IN (${Prisma.join(PRUNABLE_COMPLETED_OUTBOX_TYPES)})
          AND available_at < CURRENT_TIMESTAMP - (${OUTBOX_COMPLETED_RETENTION_DAYS}::int * INTERVAL '1 day')
          AND updated_at < CURRENT_TIMESTAMP - (${OUTBOX_COMPLETED_RETENTION_DAYS}::int * INTERVAL '1 day')
        ORDER BY available_at ASC
        LIMIT ${batchSize}::int
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM v1_outbox_events event
      USING doomed
      WHERE event.id = doomed.id
    `;
    deleted += count;
    if (count < batchSize) break;
  }
  return deleted;
}

/** 슬롯 키가 같으면 행이 하나만 생겨, 워커를 다시 띄우거나 여러 개 돌려도 체인이 늘지 않는다. */
export async function scheduleNextOutboxRetentionScan(tx: Prisma.TransactionClient, now: Date): Promise<void> {
  const nextSlot = new Date(Math.floor(now.getTime() / SCAN_INTERVAL_MS) * SCAN_INTERVAL_MS + SCAN_INTERVAL_MS);
  await tx.v1OutboxEvent.createMany({
    data: [
      {
        businessKey: `outbox-retention-scan:${nextSlot.toISOString()}`,
        aggregateType: 'OUTBOX',
        aggregateId: 'outbox-retention-scan',
        type: OUTBOX_RETENTION_SCAN_TYPE,
        payload: { scheduledFor: nextSlot.toISOString() },
        availableAt: nextSlot,
      },
    ],
    skipDuplicates: true,
  });
}
