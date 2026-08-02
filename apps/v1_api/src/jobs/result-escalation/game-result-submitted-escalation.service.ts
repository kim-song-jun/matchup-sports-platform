import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { GameOperationClaim, GameOperationHandler } from '../v1-game-operations-worker.service';

type SubmittedRevision = {
  revisionId: string;
  gameId: string;
  state: string;
  submittedAt: Date | null;
  teamMatchId: string | null;
  tournamentId: string | null;
};

type Recipient = {
  userId: string;
  targetType: 'team_match' | 'tournament';
  targetId: string;
};

export class GameResultSubmittedEscalationService {
  readonly handler: GameOperationHandler = async (claim, tx) => {
    const revisionId = this.revisionId(claim.payload);
    const revision = await this.lockRevision(tx, revisionId);
    if (revision.state !== 'SUBMITTED' || revision.submittedAt === null) return;

    await this.createQueue(tx, revision);
    await this.scheduleDueDeliveries(tx, revision);
    const recipient = await this.currentReviewer(tx, revision);
    if (recipient !== null) {
      await this.notifyReviewer(tx, revision, recipient, 'submitted');
    }
  };

  readonly reminderHandler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockRevision(tx, this.revisionId(claim.payload));
    if (revision.state !== 'SUBMITTED' || revision.submittedAt === null) return;
    const recipient = await this.currentReviewer(tx, revision);
    if (recipient !== null) {
      await this.notifyReviewer(tx, revision, recipient, 'reminder');
    }
  };

  readonly escalationHandler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockRevision(tx, this.revisionId(claim.payload));
    if (revision.state !== 'SUBMITTED' || revision.submittedAt === null) return;
    await this.createQueue(tx, revision);
  };

  private revisionId(payload: unknown): string {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('revisionId' in payload) ||
      typeof payload.revisionId !== 'string' ||
      payload.revisionId.trim().length === 0
    ) {
      throw new Error('GAME_RESULT_SUBMITTED payload requires a non-empty revisionId');
    }
    return payload.revisionId.trim();
  }

  private async lockRevision(
    tx: Prisma.TransactionClient,
    revisionId: string,
  ): Promise<SubmittedRevision> {
    const rows = await tx.$queryRaw<SubmittedRevision[]>`
      SELECT
        revision.id AS "revisionId",
        revision.game_id AS "gameId",
        revision.state::text AS state,
        revision.submitted_at AS "submittedAt",
        game.team_match_id AS "teamMatchId",
        fixture.tournament_id AS "tournamentId"
      FROM v1_game_result_revisions revision
      INNER JOIN v1_games game ON game.id = revision.game_id
      LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
      WHERE revision.id = ${revisionId}
      FOR UPDATE OF revision
    `;
    const revision = rows[0];
    if (revision === undefined) {
      throw new Error(`GAME_RESULT_SUBMITTED revision ${revisionId} was not found`);
    }
    return revision;
  }

  private async createQueue(
    tx: Prisma.TransactionClient,
    revision: SubmittedRevision,
  ): Promise<void> {
    const reminderDueAt = new Date(revision.submittedAt!.getTime() + 24 * 60 * 60 * 1_000);
    const escalationDueAt = new Date(revision.submittedAt!.getTime() + 48 * 60 * 60 * 1_000);
    await tx.$executeRaw`
      INSERT INTO v1_result_escalations (
        id, result_revision_id, kind, due_at, status, version, created_at, updated_at
      ) VALUES
        (${randomUUID()}, ${revision.revisionId}, 'REMINDER'::"V1EscalationKind", ${reminderDueAt},
         'PENDING'::"V1EscalationStatus", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${randomUUID()}, ${revision.revisionId}, 'ESCALATION'::"V1EscalationKind", ${escalationDueAt},
         'PENDING'::"V1EscalationStatus", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (result_revision_id, kind) DO NOTHING
    `;
  }

  private async scheduleDueDeliveries(
    tx: Prisma.TransactionClient,
    revision: SubmittedRevision,
  ): Promise<void> {
    const reminderDueAt = new Date(revision.submittedAt!.getTime() + 24 * 60 * 60 * 1_000);
    const escalationDueAt = new Date(revision.submittedAt!.getTime() + 48 * 60 * 60 * 1_000);
    const payload = JSON.stringify({ gameId: revision.gameId, revisionId: revision.revisionId });
    await tx.$executeRaw`
      INSERT INTO v1_outbox_events (
        id, business_key, aggregate_type, aggregate_id, revision_id, type, payload,
        available_at, status, attempts, retry_generation, version, created_at, updated_at
      ) VALUES
        (${randomUUID()}, ${`result-review:${revision.revisionId}:reminder`}, 'GAME', ${revision.gameId},
         ${revision.revisionId}, 'GAME_RESULT_REVIEW_REMINDER', ${payload}::jsonb,
         ${reminderDueAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${randomUUID()}, ${`result-review:${revision.revisionId}:escalation`}, 'GAME', ${revision.gameId},
         ${revision.revisionId}, 'GAME_RESULT_REVIEW_ESCALATION', ${payload}::jsonb,
         ${escalationDueAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (business_key) DO NOTHING
    `;
  }

  private async currentReviewer(
    tx: Prisma.TransactionClient,
    revision: SubmittedRevision,
  ): Promise<Recipient | null> {
    if (revision.teamMatchId !== null) {
      const rows = await tx.$queryRaw<Array<{ userId: string }>>`
        SELECT candidate.user_id AS "userId"
        FROM v1_team_matches team_match
        INNER JOIN v1_teams team ON team.id = team_match.approved_applicant_team_id
        CROSS JOIN LATERAL (
          SELECT eligible.user_id
          FROM (
            SELECT team.owner_user_id AS user_id, 0 AS priority
            UNION ALL
            SELECT membership.user_id,
                   CASE membership.role WHEN 'owner' THEN 1 ELSE 2 END AS priority
            FROM v1_team_memberships membership
            WHERE membership.team_id = team.id
              AND membership.status = 'active'
              AND membership.role IN ('owner', 'manager')
          ) eligible
          INNER JOIN v1_users reviewer ON reviewer.id = eligible.user_id
          WHERE reviewer.account_status = 'active'
          ORDER BY eligible.priority ASC, eligible.user_id ASC
          LIMIT 1
        ) candidate
        WHERE team_match.id = ${revision.teamMatchId}
        LIMIT 1
      `;
      const reviewer = rows[0];
      return reviewer === undefined
        ? null
        : { userId: reviewer.userId, targetType: 'team_match', targetId: revision.teamMatchId };
    }
    if (revision.tournamentId !== null) {
      const rows = await tx.$queryRaw<Array<{ userId: string }>>`
        SELECT assignment.user_id AS "userId"
        FROM v1_tournament_staff_assignments assignment
        INNER JOIN v1_users reviewer ON reviewer.id = assignment.user_id
        WHERE assignment.tournament_id = ${revision.tournamentId}
          AND assignment.role = 'TOURNAMENT_DIRECTOR'
          AND assignment.revoked_at IS NULL
          AND assignment.created_at <= CURRENT_TIMESTAMP
          AND (assignment.expires_at IS NULL OR assignment.expires_at > CURRENT_TIMESTAMP)
          AND reviewer.account_status = 'active'
        ORDER BY assignment.created_at ASC, assignment.id ASC
        LIMIT 1
      `;
      const reviewer = rows[0];
      return reviewer === undefined
        ? null
        : { userId: reviewer.userId, targetType: 'tournament', targetId: revision.tournamentId };
    }
    return null;
  }

  private async notifyReviewer(
    tx: Prisma.TransactionClient,
    revision: SubmittedRevision,
    recipient: Recipient,
    stage: 'submitted' | 'reminder',
  ): Promise<void> {
    const businessKey = `result-review:${revision.revisionId}:${stage}:recipient:${recipient.userId}`;
    const deepLink = recipient.targetType === 'team_match'
      ? `/team-matches/${recipient.targetId}/result/approval`
      : `/tournament-ops/tournaments/${recipient.targetId}/result-review`;
    await tx.$executeRaw`
      INSERT INTO v1_notifications (
        id, business_key, recipient_user_id, target_type, target_id,
        title, body, deep_link, created_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${businessKey}, ${recipient.userId},
        ${recipient.targetType}::"V1NotificationTargetType", ${recipient.targetId},
        '경기 결과를 확인해 주세요', '제출된 경기 결과가 검토를 기다리고 있어요.', ${deepLink},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (business_key) DO NOTHING
    `;
  }
}
