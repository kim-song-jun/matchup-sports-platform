import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1EscalationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EscalationRole, EscalationRow } from './result-escalation.types';

type EscalationClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ResultEscalationAccessService {
  async role(
    tx: EscalationClient,
    userId: string,
    tournamentId: string,
  ): Promise<EscalationRole> {
    if (await this.isPlatformOps(tx, userId)) return 'PLATFORM_OPS';
    const reviewer = await tx.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM v1_tournament_staff_assignments assignment
        INNER JOIN v1_users user_account ON user_account.id = assignment.user_id
        WHERE assignment.tournament_id = ${tournamentId}
          AND assignment.user_id = ${userId}
          AND assignment.role IN ('SUPPORT_READONLY', 'TOURNAMENT_DIRECTOR')
          AND assignment.revoked_at IS NULL
          AND assignment.created_at <= CURRENT_TIMESTAMP
          AND (assignment.expires_at IS NULL OR assignment.expires_at > CURRENT_TIMESTAMP)
          AND user_account.account_status = 'active'
      ) AS allowed
    `;
    if (reviewer[0]?.allowed === true) return 'REVIEWER';
    return this.deny();
  }

  async requirePlatformOps(tx: EscalationClient, userId: string): Promise<void> {
    if (!(await this.isPlatformOps(tx, userId))) this.deny();
  }

  async requireTournamentDirector(
    tx: EscalationClient,
    userId: string,
    tournamentId: string,
  ): Promise<void> {
    const platform = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT admin_user.user_id AS "userId"
      FROM v1_admin_users admin_user
      INNER JOIN v1_users user_account ON user_account.id = admin_user.user_id
      WHERE admin_user.user_id = ${userId}
        AND admin_user.admin_role IN ('owner', 'ops')
        AND admin_user.status = 'active'
        AND admin_user.revoked_at IS NULL
        AND user_account.account_status = 'active'
      FOR SHARE OF admin_user, user_account
      LIMIT 1
    `;
    if (platform.length > 0) return;
    const director = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT assignment.user_id AS "userId"
      FROM v1_tournament_staff_assignments assignment
      INNER JOIN v1_users user_account ON user_account.id = assignment.user_id
      WHERE assignment.tournament_id = ${tournamentId}
        AND assignment.user_id = ${userId}
        AND assignment.role = 'TOURNAMENT_DIRECTOR'
        AND assignment.revoked_at IS NULL
        AND assignment.created_at <= CURRENT_TIMESTAMP
        AND (assignment.expires_at IS NULL OR assignment.expires_at > CURRENT_TIMESTAMP)
        AND user_account.account_status = 'active'
      FOR SHARE OF assignment, user_account
      LIMIT 1
    `;
    if (director.length === 0) this.deny();
  }

  async platformRows(
    tx: EscalationClient,
    status?: V1EscalationStatus,
  ): Promise<EscalationRow[]> {
    const statusFilter = status === undefined
      ? Prisma.empty
      : Prisma.sql`AND escalation.status = ${status}::"V1EscalationStatus"`;
    return tx.$queryRaw<EscalationRow[]>`
      ${this.selectRows()}
      WHERE escalation.due_at <= CURRENT_TIMESTAMP
        AND escalation.kind = 'ESCALATION'
        ${this.canonicalSourcePredicate()}
      ${statusFilter}
      ORDER BY escalation.due_at ASC, escalation.id ASC
    `;
  }

  async platformRow(
    tx: EscalationClient,
    escalationId: string,
    lock: boolean,
  ): Promise<EscalationRow> {
    const lockClause = lock ? Prisma.sql`FOR UPDATE OF escalation` : Prisma.empty;
    const rows = await tx.$queryRaw<EscalationRow[]>`
      ${this.selectRows()}
      WHERE escalation.id = ${escalationId}
        AND escalation.due_at <= CURRENT_TIMESTAMP
        AND escalation.kind = 'ESCALATION'
        ${this.canonicalSourcePredicate()}
      ${lockClause}
    `;
    return this.requireRow(rows[0]);
  }

  async rows(
    tx: EscalationClient,
    tournamentId: string,
    role: EscalationRole,
    status?: V1EscalationStatus,
  ): Promise<EscalationRow[]> {
    const kindFilter = role === 'REVIEWER'
      ? Prisma.sql`AND escalation.kind = 'REMINDER'`
      : Prisma.sql`AND escalation.kind = 'ESCALATION'`;
    const statusFilter = status === undefined
      ? Prisma.empty
      : Prisma.sql`AND escalation.status = ${status}::"V1EscalationStatus"`;
    return tx.$queryRaw<EscalationRow[]>`
      ${this.selectRows()}
      WHERE COALESCE(team_match.tournament_id, team_match.league_id) = ${tournamentId}
        AND escalation.due_at <= CURRENT_TIMESTAMP
        ${this.canonicalSourcePredicate()}
      ${kindFilter}
      ${statusFilter}
      ORDER BY escalation.due_at ASC, escalation.id ASC
    `;
  }

  async row(
    tx: EscalationClient,
    tournamentId: string,
    escalationId: string,
    role: EscalationRole,
    lock: boolean,
  ): Promise<EscalationRow> {
    const kindFilter = role === 'REVIEWER'
      ? Prisma.sql`AND escalation.kind = 'REMINDER'`
      : Prisma.sql`AND escalation.kind = 'ESCALATION'`;
    const lockClause = lock ? Prisma.sql`FOR UPDATE OF escalation` : Prisma.empty;
    const rows = await tx.$queryRaw<EscalationRow[]>`
      ${this.selectRows()}
      WHERE COALESCE(team_match.tournament_id, team_match.league_id) = ${tournamentId}
        AND escalation.id = ${escalationId}
        AND escalation.due_at <= CURRENT_TIMESTAMP
        ${this.canonicalSourcePredicate()}
      ${kindFilter}
      ${lockClause}
    `;
    return this.requireRow(rows[0]);
  }

  deny(): never {
    throw new ForbiddenException({
      code: 'ESCALATION_SCOPE_DENIED',
      message: 'Result escalation scope is denied',
    });
  }

  private async isPlatformOps(tx: EscalationClient, userId: string): Promise<boolean> {
    const platform = await tx.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM v1_admin_users admin_user
        INNER JOIN v1_users user_account ON user_account.id = admin_user.user_id
        WHERE admin_user.user_id = ${userId}
          AND admin_user.admin_role IN ('owner', 'ops')
          AND admin_user.status = 'active'
          AND admin_user.revoked_at IS NULL
          AND user_account.account_status = 'active'
      ) AS allowed
    `;
    return platform[0]?.allowed === true;
  }

  private requireRow(row: EscalationRow | undefined): EscalationRow {
    if (row !== undefined) return row;
    throw new NotFoundException({
      code: 'RESULT_ESCALATION_NOT_FOUND',
      message: 'Result escalation was not found in this tournament scope',
    });
  }

  private selectRows(): Prisma.Sql {
    return Prisma.sql`
      SELECT
        escalation.id, escalation.result_revision_id AS "resultRevisionId",
        revision.game_id AS "gameId", COALESCE(team_match.tournament_id, team_match.league_id) AS "tournamentId",
        team_match.id AS "teamMatchId", team_match.league_id AS "leagueId",
        escalation.kind::text AS kind, escalation.due_at AS "dueAt", escalation.status,
        escalation.ack_by_user_id AS "ackByUserId", escalation.resolved_by_user_id AS "resolvedByUserId",
        escalation.reason, escalation.version, escalation.created_at AS "createdAt", escalation.updated_at AS "updatedAt"
      FROM v1_result_escalations escalation
      INNER JOIN v1_game_result_revisions revision ON revision.id = escalation.result_revision_id
      INNER JOIN v1_games game ON game.id = revision.game_id
      INNER JOIN v1_team_matches team_match ON team_match.id = game.team_match_id
      LEFT JOIN v1_tournaments competition ON competition.id = team_match.tournament_id
      LEFT JOIN v1_tournament_match_details details ON details.team_match_id = team_match.id
    `;
  }

  private canonicalSourcePredicate(): Prisma.Sql {
    return Prisma.sql`
        AND game.source_type = 'TEAM_MATCH'::"V1GameSourceType"
        AND team_match.deleted_at IS NULL
        AND (
          (team_match.tournament_id IS NULL AND team_match.league_id IS NULL AND details.team_match_id IS NULL)
          OR (
            team_match.tournament_id IS NOT NULL
            AND team_match.league_id IS NULL
            AND competition.id IS NOT NULL
            AND (competition.kind = 'regular_tournament' OR competition.kind IS NULL)
            AND details.team_match_id = team_match.id
            AND details.tournament_id = team_match.tournament_id
          )
          OR (
            team_match.league_id IS NOT NULL
            AND team_match.tournament_id = team_match.league_id
            AND competition.kind = 'regular_league'
            AND details.team_match_id IS NULL
          )
        )
    `;
  }
}
