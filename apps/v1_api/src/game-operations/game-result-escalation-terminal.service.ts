import { Prisma } from '@prisma/client';
import type { OfficialRevisionRow } from './game-result-official-projection.types';

export class GameResultEscalationTerminalService {
  async close(tx: Prisma.TransactionClient, revision: OfficialRevisionRow): Promise<void> {
    await tx.$executeRaw`
      UPDATE v1_result_escalations
      SET status = 'CLOSED'::"V1EscalationStatus",
          reason = COALESCE(${revision.reason}, 'official'),
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE result_revision_id = ${revision.revisionId}
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
      WHERE revision_id = ${revision.revisionId}
        AND type IN ('GAME_RESULT_REVIEW_REMINDER', 'GAME_RESULT_REVIEW_ESCALATION')
        AND status IN ('PENDING', 'RETRY')
    `;
  }
}
