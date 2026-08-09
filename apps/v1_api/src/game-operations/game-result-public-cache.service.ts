import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  OfficialRevisionRow,
  OfficialScore,
  PublicResultProjection,
} from './game-result-official-projection.types';

type ExistingCache = {
  revisionId: string;
  revision: number;
  visibility: string;
  isCurrent: boolean;
  sourceHash: string;
  payloadHash: string;
};

export class GameResultPublicCacheService {
  build(revision: OfficialRevisionRow, score: OfficialScore): PublicResultProjection {
    const payload = {
      gameId: revision.gameId,
      revisionId: revision.revisionId,
      revision: revision.revision,
      sourceType: revision.sourceType,
      tournamentId: revision.tournamentId,
      homeTeamId: revision.homeTeamId,
      awayTeamId: revision.awayTeamId,
      score,
      eventsHash: revision.sourceHash,
      officialAt: revision.officialAt.toISOString(),
      visibility: revision.visibility,
    };
    const payloadJson = JSON.stringify(payload);
    return {
      payload,
      payloadJson,
      payloadHash: createHash('sha256').update(payloadJson).digest('hex'),
      isCurrent: revision.currentOfficialRevisionId === revision.revisionId,
    };
  }

  async repairRequired(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    projection: PublicResultProjection,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<ExistingCache[]>`
      SELECT
        revision_id AS "revisionId",
        revision,
        visibility_mode::text AS visibility,
        is_current AS "isCurrent",
        source_hash AS "sourceHash",
        payload_hash AS "payloadHash"
      FROM v1_game_official_result_cache
      WHERE revision_id = ${revision.revisionId}
      FOR UPDATE
    `;
    const current = rows[0];
    return current !== undefined && (
      current.revision !== revision.revision ||
      current.visibility !== revision.visibility ||
      current.isCurrent !== projection.isCurrent ||
      current.sourceHash !== revision.sourceHash ||
      current.payloadHash !== projection.payloadHash
    );
  }

  async project(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    projection: PublicResultProjection,
  ): Promise<void> {
    if (projection.isCurrent) {
      await tx.$executeRaw`
        UPDATE v1_game_official_result_cache
        SET is_current = false, updated_at = CURRENT_TIMESTAMP
        WHERE game_id = ${revision.gameId}
          AND revision_id <> ${revision.revisionId}
          AND is_current
      `;
    }
    await tx.$executeRaw`
      INSERT INTO v1_game_official_result_cache (
        id, revision_id, game_id, tournament_id, revision, visibility_mode,
        is_current, source_hash, canonical_payload, payload_hash, cached_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${revision.revisionId}, ${revision.gameId}, ${revision.tournamentId},
        ${revision.revision}, ${revision.visibility}::"V1VisibilityMode", ${projection.isCurrent},
        ${revision.sourceHash}, ${projection.payloadJson}::jsonb, ${projection.payloadHash},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (revision_id) DO UPDATE
      SET tournament_id = EXCLUDED.tournament_id,
          revision = EXCLUDED.revision,
          visibility_mode = EXCLUDED.visibility_mode,
          is_current = EXCLUDED.is_current,
          source_hash = EXCLUDED.source_hash,
          canonical_payload = EXCLUDED.canonical_payload,
          payload_hash = EXCLUDED.payload_hash,
          updated_at = CURRENT_TIMESTAMP
      WHERE (
        v1_game_official_result_cache.tournament_id,
        v1_game_official_result_cache.revision,
        v1_game_official_result_cache.visibility_mode,
        v1_game_official_result_cache.is_current,
        v1_game_official_result_cache.source_hash,
        v1_game_official_result_cache.canonical_payload,
        v1_game_official_result_cache.payload_hash
      ) IS DISTINCT FROM (
        EXCLUDED.tournament_id,
        EXCLUDED.revision,
        EXCLUDED.visibility_mode,
        EXCLUDED.is_current,
        EXCLUDED.source_hash,
        EXCLUDED.canonical_payload,
        EXCLUDED.payload_hash
      )
    `;
  }
}
