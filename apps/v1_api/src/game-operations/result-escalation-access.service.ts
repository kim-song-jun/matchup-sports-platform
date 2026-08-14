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
      WHERE fixture.tournament_id = ${tournamentId}
        AND escalation.due_at <= CURRENT_TIMESTAMP
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
      WHERE fixture.tournament_id = ${tournamentId}
        AND escalation.id = ${escalationId}
        AND escalation.due_at <= CURRENT_TIMESTAMP
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
        revision.game_id AS "gameId", fixture.tournament_id AS "tournamentId",
        team_match.id AS "teamMatchId", team_match.series_id AS "seriesId",
        escalation.kind::text AS kind, escalation.due_at AS "dueAt", escalation.status,
        escalation.ack_by_user_id AS "ackByUserId", escalation.resolved_by_user_id AS "resolvedByUserId",
        escalation.reason, escalation.version, escalation.created_at AS "createdAt", escalation.updated_at AS "updatedAt"
      FROM v1_result_escalations escalation
      INNER JOIN v1_game_result_revisions revision ON revision.id = escalation.result_revision_id
      INNER JOIN v1_games game ON game.id = revision.game_id
      LEFT JOIN v1_tournament_fixtures fixture ON fixture.id = game.tournament_fixture_id
      LEFT JOIN v1_team_matches team_match ON team_match.id = game.team_match_id
    `;
  }
}
