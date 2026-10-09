import { Prisma } from '@prisma/client';

/**
 * Closes pending/acknowledged review escalations and their not-yet-fired reminder/escalation outbox jobs for a
 * revision whose review ended outside the OFFICIAL path (void, discarded on a team change). Runs inline in the
 * caller's transaction instead of the async projection worker.
 */
export async function closeRevisionReviewSla(tx: Prisma.TransactionClient, revisionId: string, reason: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE v1_result_escalations
    SET status = 'CLOSED'::"V1EscalationStatus",
        reason = ${reason},
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE result_revision_id = ${revisionId}
      AND status IN ('PENDING', 'ACKNOWLEDGED')
  `;
  await tx.$executeRaw`
    UPDATE v1_outbox_events
    SET status = 'COMPLETED'::"V1OutboxStatus",
        lease_owner = NULL,
        lease_until = NULL,
        last_error = NULL,
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE revision_id = ${revisionId}
      AND type IN ('GAME_RESULT_REVIEW_REMINDER', 'GAME_RESULT_REVIEW_ESCALATION')
      AND status IN ('PENDING', 'RETRY')
  `;
}
