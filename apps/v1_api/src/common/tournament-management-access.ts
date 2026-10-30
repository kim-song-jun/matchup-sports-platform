import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { V1ActiveAdmin } from './admin-context.service';

export type V1TournamentDirector = {
  id: null;
  userId: string;
  adminRole: 'tournament_director';
  status: 'active';
  tournamentId: string;
  assignmentId: string;
  assignmentVersion: number;
};
export type V1TournamentManager = V1ActiveAdmin | V1TournamentDirector;
export type TournamentManagementResource =
  | { tournamentId: string }
  | { registrationId: string }
  | { playerId: string }
  | { fixtureId: string }
  | { groupId: string }
  | { groupTeamId: string }
  | { slotId: string }
  | { announcementId: string };

type Db = PrismaService | Prisma.TransactionClient;

export function denyTournamentManagement(): never {
  throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '이 대회를 관리할 권한이 없어요.' });
}

/** Child IDs are resolved server-side; a caller cannot label another tournament's child as its own. */
export async function managementTournamentId(db: Db, resource: TournamentManagementResource): Promise<string> {
  if ('tournamentId' in resource) return resource.tournamentId;
  let row: { tournamentId: string | null } | null;
  if ('registrationId' in resource) {
    row = await db.v1TournamentRegistration.findUnique({ where: { id: resource.registrationId }, select: { tournamentId: true } });
  } else if ('playerId' in resource) {
    const player = await db.v1TournamentPlayer.findUnique({ where: { id: resource.playerId }, select: { registration: { select: { tournamentId: true } } } });
    row = player?.registration ?? null;
  } else if ('fixtureId' in resource) {
    row = await db.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: resource.fixtureId }, select: { tournamentId: true } });
  } else if ('groupId' in resource) {
    row = await db.v1TournamentGroup.findUnique({ where: { id: resource.groupId }, select: { tournamentId: true } });
  } else if ('groupTeamId' in resource) {
    const team = await db.v1TournamentGroupTeam.findUnique({ where: { id: resource.groupTeamId }, select: { group: { select: { tournamentId: true } } } });
    row = team?.group ?? null;
  } else if ('slotId' in resource) {
    row = await db.v1TournamentSlot.findUnique({ where: { id: resource.slotId }, select: { tournamentId: true } });
  } else {
    row = await db.v1TournamentAnnouncement.findUnique({ where: { id: resource.announcementId }, select: { tournamentId: true } });
  }
  if (!row?.tournamentId) denyTournamentManagement();
  return row.tournamentId;
}

export function activeDirectorWhere(userId: string, now = new Date()): Prisma.V1TournamentStaffAssignmentWhereInput {
  return {
    userId, role: 'TOURNAMENT_DIRECTOR', revokedAt: null, createdAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    user: { accountStatus: 'active', deletedAt: null },
    tournament: { deletedAt: null, OR: [{ kind: null }, { kind: 'regular_tournament' }] },
  };
}

export async function getActiveTournamentDirector(db: Db, userId: string, resource: TournamentManagementResource): Promise<V1TournamentDirector> {
  let assignment = await db.v1TournamentStaffAssignment.findFirst({
    where: { ...activeDirectorWhere(userId), ...('tournamentId' in resource ? { tournamentId: resource.tournamentId } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, version: true, tournamentId: true },
  });
  if (!assignment) denyTournamentManagement();
  const tournamentId = await managementTournamentId(db, resource);
  if (assignment.tournamentId !== tournamentId) {
    assignment = await db.v1TournamentStaffAssignment.findFirst({
      where: { ...activeDirectorWhere(userId), tournamentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, version: true, tournamentId: true },
    });
    if (!assignment) denyTournamentManagement();
  }
  return { id: null, userId, adminRole: 'tournament_director', status: 'active', tournamentId,
    assignmentId: assignment.id, assignmentVersion: assignment.version };
}
