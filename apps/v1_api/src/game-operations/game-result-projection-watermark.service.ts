import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';

type ExistingWatermark = { sourceHash: string; status: string };

export class GameResultProjectionWatermarkService {
  async repairRequired(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    teamIds: string[],
  ): Promise<boolean> {
    if (teamIds.length === 0) return false;
    const rows = await tx.$queryRaw<ExistingWatermark[]>`
      SELECT source_hash AS "sourceHash", status::text AS status
      FROM v1_projection_watermarks
      WHERE projection = 'TEAM_RECORD'
        AND entity_type = 'TEAM'
        AND entity_id = ${teamIds[0]}
      FOR UPDATE
    `;
    const current = rows[0];
    return current !== undefined && (
      current.sourceHash !== revision.sourceHash || current.status !== 'APPLIED'
    );
  }

  async writeRepairAudit(
    tx: Prisma.TransactionClient,
    claim: GameOperationClaim,
    revision: OfficialRevisionRow,
  ): Promise<void> {
    const after = JSON.stringify({ sourceHash: revision.sourceHash, status: 'APPLIED' });
    const requestId = `projection-repair:${revision.revisionId}:${revision.sourceHash}`;
    await tx.$executeRaw`
      INSERT INTO v1_operation_audits (
        id, actor_type, actor_user_id, system_actor, action, resource_type,
        resource_id, request_id, source_ip, before, after, reason, created_at
      )
      SELECT
        ${randomUUID()}, 'SYSTEM'::"V1OperationActorType", NULL,
        'V1_GAME_OPERATIONS_WORKER', 'GAME_PROJECTION_REPAIRED', 'GAME_RESULT_REVISION',
        ${revision.revisionId}, ${requestId}, NULL, NULL, ${after}::jsonb,
        ${`outbox:${claim.id}`}, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM v1_operation_audits
        WHERE action = 'GAME_PROJECTION_REPAIRED'
          AND resource_id = ${revision.revisionId}
          AND request_id = ${requestId}
      )
    `;
  }

  async write(
    tx: Prisma.TransactionClient,
    input: {
      projection: string;
      entityType: string;
      entityId: string;
      revisionId: string;
      sourceHash: string;
    },
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO v1_projection_watermarks (
        id, projection, entity_type, entity_id, revision_id, source_hash, projected_at, status
      ) VALUES (
        ${randomUUID()}, ${input.projection}, ${input.entityType}, ${input.entityId},
        ${input.revisionId}, ${input.sourceHash}, CURRENT_TIMESTAMP, 'APPLIED'::"V1ProjectionStatus"
      )
      ON CONFLICT (projection, entity_type, entity_id) DO UPDATE
      SET revision_id = EXCLUDED.revision_id,
          source_hash = EXCLUDED.source_hash,
          projected_at = CURRENT_TIMESTAMP,
          status = 'APPLIED'::"V1ProjectionStatus"
      WHERE v1_projection_watermarks.revision_id = EXCLUDED.revision_id
         OR EXISTS (
           SELECT 1 FROM v1_games current_game
           WHERE current_game.current_official_revision_id = EXCLUDED.revision_id
         )
    `;
  }
}
