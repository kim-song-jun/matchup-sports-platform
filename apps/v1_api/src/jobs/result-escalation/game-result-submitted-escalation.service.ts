import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';

const REMINDER_DELAY_MS = 24 * 60 * 60 * 1_000;
const ESCALATION_DELAY_MS = 48 * 60 * 60 * 1_000;
// D-4: 리그(시리즈) 팀매치는 일반 팀매치/대회의 24h/48h 대신 12시간 단일 임계값을 쓴다.
const SERIES_ESCALATION_DELAY_MS = 12 * 60 * 60 * 1_000;

type SubmittedRevision = {
  revisionId: string;
  gameId: string;
  state: string;
  submittedAt: Date | null;
  teamMatchId: string | null;
  tournamentId: string | null;
  seriesId: string | null;
  hostTeamId: string | null;
};

type Recipient = { userId: string; targetType: 'team_match' | 'tournament'; targetId: string };

export class GameResultSubmittedEscalationService {
  readonly handler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockRevision(tx, this.revisionId(claim.payload));
    if (revision.state !== 'SUBMITTED' || revision.submittedAt === null) return;
    await this.createQueue(tx, revision);
    await this.scheduleDueDeliveries(tx, revision);
    const recipient = await this.currentReviewer(tx, revision);
    if (recipient !== null) await this.notifyReviewer(tx, revision, recipient, 'submitted');
  };

  readonly reminderHandler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockRevision(tx, this.revisionId(claim.payload));
    if (revision.state !== 'SUBMITTED' || revision.submittedAt === null) return;
    const recipient = await this.currentReviewer(tx, revision);
    if (recipient !== null) await this.notifyReviewer(tx, revision, recipient, 'reminder');
  };

  readonly escalationHandler: GameOperationHandler = async (claim, tx) => {
    const revision = await this.lockRevision(tx, this.revisionId(claim.payload));
    if (revision.state !== 'SUBMITTED' || revision.submittedAt === null) return;
    await this.createQueue(tx, revision);
    if (revision.seriesId !== null && revision.teamMatchId !== null && revision.hostTeamId !== null) {
      await this.notifyLeagueEscalation(tx, revision);
    }
  };

  private revisionId(payload: unknown): string {
    if (typeof payload !== 'object' || payload === null || !('revisionId' in payload) || typeof payload.revisionId !== 'string' || payload.revisionId.trim().length === 0) {
      throw new Error('GAME_RESULT_SUBMITTED payload requires a non-empty revisionId');
    }
    return payload.revisionId.trim();
  }

  private async lockRevision(tx: Prisma.TransactionClient, revisionId: string): Promise<SubmittedRevision> {
    const rows = await tx.$queryRaw<SubmittedRevision[]>`
      SELECT
        revision.id AS "revisionId", revision.game_id AS "gameId", revision.state::text AS state,
        revision.submitted_at AS "submittedAt", game.team_match_id AS "teamMatchId",
        fixture.tournament_id AS "tournamentId", team_match.series_id AS "seriesId",
        team_match.host_team_id AS "hostTeamId"
      FROM v1_game_result_revisions revision
      INNER JOIN v1_games game ON game.id = revision.game_id
      LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
      LEFT JOIN v1_team_matches team_match ON team_match.id = game.team_match_id
      WHERE revision.id = ${revisionId}
      FOR UPDATE OF revision
    `;
    const revision = rows[0];
    if (revision === undefined) throw new Error(`GAME_RESULT_SUBMITTED revision ${revisionId} was not found`);
    return revision;
  }

  private async createQueue(tx: Prisma.TransactionClient, revision: SubmittedRevision): Promise<void> {
    if (revision.seriesId !== null) {
      const escalationDueAt = new Date(revision.submittedAt!.getTime() + SERIES_ESCALATION_DELAY_MS);
      await tx.$executeRaw`
        INSERT INTO v1_result_escalations (id, result_revision_id, kind, due_at, status, version, created_at, updated_at)
        VALUES (${randomUUID()}, ${revision.revisionId}, 'ESCALATION'::"V1EscalationKind", ${escalationDueAt}, 'PENDING'::"V1EscalationStatus", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (result_revision_id, kind) DO NOTHING
      `;
      return;
    }
    const reminderDueAt = new Date(revision.submittedAt!.getTime() + REMINDER_DELAY_MS);
    const escalationDueAt = new Date(revision.submittedAt!.getTime() + ESCALATION_DELAY_MS);
    await tx.$executeRaw`
      INSERT INTO v1_result_escalations (id, result_revision_id, kind, due_at, status, version, created_at, updated_at)
      VALUES
        (${randomUUID()}, ${revision.revisionId}, 'REMINDER'::"V1EscalationKind", ${reminderDueAt}, 'PENDING'::"V1EscalationStatus", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${randomUUID()}, ${revision.revisionId}, 'ESCALATION'::"V1EscalationKind", ${escalationDueAt}, 'PENDING'::"V1EscalationStatus", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (result_revision_id, kind) DO NOTHING
    `;
  }

  private async scheduleDueDeliveries(tx: Prisma.TransactionClient, revision: SubmittedRevision): Promise<void> {
    const payload = JSON.stringify({ gameId: revision.gameId, revisionId: revision.revisionId });
    if (revision.seriesId !== null) {
      const escalationDueAt = new Date(revision.submittedAt!.getTime() + SERIES_ESCALATION_DELAY_MS);
      await tx.$executeRaw`
        INSERT INTO v1_outbox_events (id, business_key, aggregate_type, aggregate_id, revision_id, type, payload, available_at, status, attempts, retry_generation, version, created_at, updated_at)
        VALUES (${randomUUID()}, ${`result-review:${revision.revisionId}:escalation`}, 'GAME', ${revision.gameId}, ${revision.revisionId}, 'GAME_RESULT_REVIEW_ESCALATION', ${payload}::jsonb, ${escalationDueAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (business_key) DO NOTHING
      `;
      return;
    }
    const reminderDueAt = new Date(revision.submittedAt!.getTime() + REMINDER_DELAY_MS);
    const escalationDueAt = new Date(revision.submittedAt!.getTime() + ESCALATION_DELAY_MS);
    await tx.$executeRaw`
      INSERT INTO v1_outbox_events (id, business_key, aggregate_type, aggregate_id, revision_id, type, payload, available_at, status, attempts, retry_generation, version, created_at, updated_at)
      VALUES
        (${randomUUID()}, ${`result-review:${revision.revisionId}:reminder`}, 'GAME', ${revision.gameId}, ${revision.revisionId}, 'GAME_RESULT_REVIEW_REMINDER', ${payload}::jsonb, ${reminderDueAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${randomUUID()}, ${`result-review:${revision.revisionId}:escalation`}, 'GAME', ${revision.gameId}, ${revision.revisionId}, 'GAME_RESULT_REVIEW_ESCALATION', ${payload}::jsonb, ${escalationDueAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (business_key) DO NOTHING
    `;
  }

  private async currentReviewer(tx: Prisma.TransactionClient, revision: SubmittedRevision): Promise<Recipient | null> {
    if (revision.teamMatchId !== null) {
      const rows = await tx.$queryRaw<Array<{ userId: string }>>`
        SELECT candidate.user_id AS "userId"
        FROM v1_team_matches team_match
        INNER JOIN v1_teams team ON team.id = team_match.approved_applicant_team_id
        CROSS JOIN LATERAL (
          SELECT eligible.user_id FROM (
            SELECT team.owner_user_id AS user_id, 0 AS priority
            UNION ALL
            SELECT membership.user_id, CASE membership.role WHEN 'owner' THEN 1 ELSE 2 END AS priority
            FROM v1_team_memberships membership
            WHERE membership.team_id = team.id AND membership.status = 'active' AND membership.role IN ('owner', 'manager')
          ) eligible
          INNER JOIN v1_users reviewer ON reviewer.id = eligible.user_id
          WHERE reviewer.account_status = 'active'
          ORDER BY eligible.priority ASC, eligible.user_id ASC LIMIT 1
        ) candidate
        WHERE team_match.id = ${revision.teamMatchId}
        LIMIT 1
      `;
      const reviewer = rows[0];
      return reviewer === undefined ? null : { userId: reviewer.userId, targetType: 'team_match', targetId: revision.teamMatchId };
    }
    if (revision.tournamentId !== null) {
      const rows = await tx.$queryRaw<Array<{ userId: string }>>`
        SELECT assignment.user_id AS "userId"
        FROM v1_tournament_staff_assignments assignment
        INNER JOIN v1_users reviewer ON reviewer.id = assignment.user_id
        WHERE assignment.tournament_id = ${revision.tournamentId} AND assignment.role = 'TOURNAMENT_DIRECTOR'
          AND assignment.revoked_at IS NULL AND assignment.created_at <= CURRENT_TIMESTAMP
          AND (assignment.expires_at IS NULL OR assignment.expires_at > CURRENT_TIMESTAMP)
          AND reviewer.account_status = 'active'
        ORDER BY assignment.created_at ASC, assignment.id ASC LIMIT 1
      `;
      const reviewer = rows[0];
      return reviewer === undefined ? null : { userId: reviewer.userId, targetType: 'tournament', targetId: revision.tournamentId };
    }
    return null;
  }

  /** D-4: 12시간 무응답 시 원정팀 재알림 + 홈팀 알림 + 리그 운영자(admin) 알림 + 운영 큐 등재. */
  private async notifyLeagueEscalation(tx: Prisma.TransactionClient, revision: SubmittedRevision): Promise<void> {
    const teamRows = await tx.$queryRaw<Array<{ role: 'away' | 'home'; userId: string }>>`
      SELECT 'away' AS role, candidate.user_id AS "userId"
      FROM v1_team_matches team_match
      INNER JOIN v1_teams team ON team.id = team_match.approved_applicant_team_id
      CROSS JOIN LATERAL (
        SELECT eligible.user_id FROM (
          SELECT team.owner_user_id AS user_id, 0 AS priority
          UNION ALL
          SELECT membership.user_id, CASE membership.role WHEN 'owner' THEN 1 ELSE 2 END AS priority
          FROM v1_team_memberships membership
          WHERE membership.team_id = team.id AND membership.status = 'active' AND membership.role IN ('owner', 'manager')
        ) eligible
        INNER JOIN v1_users reviewer ON reviewer.id = eligible.user_id
        WHERE reviewer.account_status = 'active'
        ORDER BY eligible.priority ASC, eligible.user_id ASC LIMIT 1
      ) candidate
      WHERE team_match.id = ${revision.teamMatchId}
      UNION ALL
      SELECT 'home' AS role, candidate.user_id AS "userId"
      FROM v1_team_matches team_match
      INNER JOIN v1_teams team ON team.id = team_match.host_team_id
      CROSS JOIN LATERAL (
        SELECT eligible.user_id FROM (
          SELECT team.owner_user_id AS user_id, 0 AS priority
          UNION ALL
          SELECT membership.user_id, CASE membership.role WHEN 'owner' THEN 1 ELSE 2 END AS priority
          FROM v1_team_memberships membership
          WHERE membership.team_id = team.id AND membership.status = 'active' AND membership.role IN ('owner', 'manager')
        ) eligible
        INNER JOIN v1_users reviewer ON reviewer.id = eligible.user_id
        WHERE reviewer.account_status = 'active'
        ORDER BY eligible.priority ASC, eligible.user_id ASC LIMIT 1
      ) candidate
      WHERE team_match.id = ${revision.teamMatchId}
    `;
    const deepLink = `/team-matches/${revision.teamMatchId}/result/approval`;
    for (const row of teamRows) {
      const businessKey = `result-review:${revision.revisionId}:league-escalation:recipient:${row.userId}`;
      const title = row.role === 'away' ? '아직 경기 결과를 확인하지 않으셨어요' : '상대팀이 아직 결과를 확인하지 않았어요';
      const body = row.role === 'away' ? '리그 경기 결과 확인이 12시간째 지연되고 있어요.' : '원정팀이 아직 리그 경기 결과를 확인하지 않았어요.';
      await tx.$executeRaw`
        INSERT INTO v1_notifications (id, business_key, recipient_user_id, target_type, target_id, title, body, deep_link, created_at, updated_at)
        VALUES (${randomUUID()}, ${businessKey}, ${row.userId}, 'team_match'::"V1NotificationTargetType", ${revision.teamMatchId}, ${title}, ${body}, ${deepLink}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (business_key) DO NOTHING
      `;
    }

    const adminRows = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT admin_user.user_id AS "userId"
      FROM v1_admin_users admin_user
      INNER JOIN v1_users user_account ON user_account.id = admin_user.user_id
      WHERE admin_user.admin_role IN ('owner', 'ops') AND admin_user.status = 'active'
        AND admin_user.revoked_at IS NULL AND user_account.account_status = 'active'
    `;
    for (const admin of adminRows) {
      const businessKey = `result-review:${revision.revisionId}:league-escalation:admin:${admin.userId}`;
      await tx.$executeRaw`
        INSERT INTO v1_notifications (id, business_key, recipient_user_id, target_type, target_id, title, body, deep_link, created_at, updated_at)
        VALUES (${randomUUID()}, ${businessKey}, ${admin.userId}, 'team_match'::"V1NotificationTargetType", ${revision.teamMatchId}, '12시간 무응답 — 확인이 필요해요', '리그 경기 결과가 12시간째 승인되지 않았어요.', ${deepLink}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (business_key) DO NOTHING
      `;
    }
  }

  private async notifyReviewer(tx: Prisma.TransactionClient, revision: SubmittedRevision, recipient: Recipient, stage: 'submitted' | 'reminder'): Promise<void> {
    const businessKey = `result-review:${revision.revisionId}:${stage}:recipient:${recipient.userId}`;
    const deepLink = recipient.targetType === 'team_match' ? `/team-matches/${recipient.targetId}/result/approval` : `/tournament-ops/tournaments/${recipient.targetId}/result-review`;
    await tx.$executeRaw`
      INSERT INTO v1_notifications (id, business_key, recipient_user_id, target_type, target_id, title, body, deep_link, created_at, updated_at)
      VALUES (${randomUUID()}, ${businessKey}, ${recipient.userId}, ${recipient.targetType}::"V1NotificationTargetType", ${recipient.targetId}, '경기 결과를 확인해 주세요', '제출된 경기 결과가 검토를 기다리고 있어요.', ${deepLink}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (business_key) DO NOTHING
    `;
  }
}
