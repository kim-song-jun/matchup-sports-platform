import { Prisma, V1EscalationStatus } from '@prisma/client';

export type EscalationRole = 'PLATFORM_OPS' | 'REVIEWER';

export type EscalationRow = {
  id: string;
  resultRevisionId: string;
  gameId: string;
  tournamentId: string | null;
  teamMatchId: string | null;
  leagueId: string | null;
  kind: 'REMINDER' | 'ESCALATION';
  dueAt: Date;
  status: V1EscalationStatus;
  ackByUserId: string | null;
  resolvedByUserId: string | null;
  reason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export function escalationView(row: EscalationRow) {
  return {
    id: row.id,
    resultRevisionId: row.resultRevisionId,
    gameId: row.gameId,
    tournamentId: row.tournamentId,
    teamMatchId: row.teamMatchId,
    leagueId: row.leagueId,
    kind: row.kind,
    dueAt: row.dueAt,
    status: row.status,
    ackByUserId: row.ackByUserId,
    resolvedByUserId: row.resolvedByUserId,
    reason: row.reason,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function escalationAuditValue(
  value: ReturnType<typeof escalationView>,
): Prisma.InputJsonObject {
  return {
    id: value.id,
    resultRevisionId: value.resultRevisionId,
    gameId: value.gameId,
    tournamentId: value.tournamentId,
    teamMatchId: value.teamMatchId,
    leagueId: value.leagueId,
    kind: value.kind,
    dueAt: value.dueAt.toISOString(),
    status: value.status,
    ackByUserId: value.ackByUserId,
    resolvedByUserId: value.resolvedByUserId,
    reason: value.reason,
    version: value.version,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
