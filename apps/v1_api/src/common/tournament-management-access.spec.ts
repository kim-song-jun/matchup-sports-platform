import { AdminContextService, writeAdminActionLog } from './admin-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import { activeDirectorWhere, type TournamentManagementResource } from './tournament-management-access';

function setup() {
  const assignments = [{ id: 'assignment-1', userId: 'director', tournamentId: 'own', role: 'TOURNAMENT_DIRECTOR',
    createdAt: new Date(0), expiresAt: null as Date | null, revokedAt: null as Date | null, version: 3,
    accountStatus: 'active', deletedAt: null as Date | null, kind: 'regular_tournament' }];
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue(null) },
    v1TournamentStaffAssignment: { findFirst: jest.fn(async ({ where }) => assignments.find(a =>
      a.userId === where.userId && (!where.tournamentId || a.tournamentId === where.tournamentId) &&
      a.role === where.role && a.revokedAt === where.revokedAt && a.createdAt <= where.createdAt.lte &&
      (a.expiresAt === null || a.expiresAt > where.OR[1].expiresAt.gt) &&
      a.accountStatus === where.user.accountStatus && a.deletedAt === where.user.deletedAt &&
      where.tournament.OR.some((kind: { kind: string | null }) => kind.kind === a.kind)) ?? null) },
    v1TournamentRegistration: { findUnique: jest.fn(async ({ where }) => ({ tournamentId: where.id })) },
    v1TournamentPlayer: { findUnique: jest.fn(async ({ where }) => ({ registration: { tournamentId: where.id } })) },
    v1TournamentMatchDetails: { findUnique: jest.fn(async ({ where }) => ({ tournamentId: where.teamMatchId })) },
    v1TournamentGroup: { findUnique: jest.fn(async ({ where }) => ({ tournamentId: where.id })) },
    v1TournamentGroupTeam: { findUnique: jest.fn(async ({ where }) => ({ group: { tournamentId: where.id } })) },
    v1TournamentSlot: { findUnique: jest.fn(async ({ where }) => ({ tournamentId: where.id })) },
    v1TournamentAnnouncement: { findUnique: jest.fn(async ({ where }) => ({ tournamentId: where.id })) },
    v1OperationAudit: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    v1AdminActionLog: { create: jest.fn() },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-1' }) },
  };
  return { db, assignments, service: new AdminContextService(db as unknown as PrismaService) };
}

describe('scoped full tournament management', () => {
  it('grants own tournament management without creating platform admin access', async () => {
    const { service } = setup();
    await expect(service.getTournamentMutationAdmin('director', { tournamentId: 'own' })).resolves.toMatchObject({
      id: null, userId: 'director', adminRole: 'tournament_director', tournamentId: 'own', assignmentVersion: 3,
    });
    await expect(service.getMutationAdmin('director')).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    await expect(service.getTournamentAdmin('director', { tournamentId: 'other' })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it.each(['registrationId', 'playerId', 'fixtureId', 'groupId', 'groupTeamId', 'slotId', 'announcementId'] as const)(
    'authorizes the actual tournament of a %s, including foreign child rejection', async (key) => {
      const { service } = setup();
      await expect(service.getTournamentMutationAdmin('director', { [key]: 'own' } as TournamentManagementResource)).resolves.toMatchObject({ tournamentId: 'own' });
      await expect(service.getTournamentMutationAdmin('director', { [key]: 'other' } as TournamentManagementResource)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    },
  );

  it.each([
    { role: 'FIELD_OPERATOR' }, { role: 'SUPPORT_READONLY' }, { revokedAt: new Date() },
    { expiresAt: new Date(0) }, { createdAt: new Date('2999-01-01') }, { accountStatus: 'suspended' },
    { deletedAt: new Date() }, { kind: 'regular_league' },
  ])('rejects invalid director authority %j', async (change) => {
    const { service, assignments } = setup(); Object.assign(assignments[0], change);
    await expect(service.getTournamentMutationAdmin('director', { tournamentId: 'own' })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('uses the same assignment predicate in the list so filters and counts cannot leak other tournaments', async () => {
    const { service } = setup();
    const where = await service.tournamentManagementWhere('director');
    expect(where).toMatchObject({ staffAssignments: { some: { ...activeDirectorWhere('director'),
      createdAt: { lte: expect.any(Date) }, OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] } } });
  });

  it('preserves platform admin access and support read-only access', async () => {
    const { service, db } = setup();
    db.v1AdminUser.findUnique.mockResolvedValue({ id: 'admin', userId: 'support', adminRole: 'support', status: 'active', user: { accountStatus: 'active' } });
    await expect(service.getTournamentAdmin('support', { tournamentId: 'other' })).resolves.toMatchObject({ id: 'admin' });
    await expect(service.getTournamentMutationAdmin('support', { tournamentId: 'other' })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    db.v1AdminUser.findUnique.mockResolvedValue({ id: 'admin', userId: 'ops', adminRole: 'ops', status: 'active', user: { accountStatus: 'active' } });
    await expect(service.getTournamentMutationAdmin('ops', { tournamentId: 'other' })).resolves.toMatchObject({ id: 'admin' });
  });

  it('records the actual director and assignment and refuses audit after revocation', async () => {
    const { service, db, assignments } = setup();
    const actor = await service.getTournamentMutationAdmin('director', { tournamentId: 'own' });
    const change = { action: 'tournament.status', targetType: 'tournament', targetId: 'own', toStatus: 'open', afterJson: { status: 'open' } };
    await expect(writeAdminActionLog(db as unknown as PrismaService, actor, change)).resolves.toEqual({ actionLogId: 'audit-1', statusChangeLogId: 'status-1' });
    expect(db.v1OperationAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'director', tournamentId: 'own', after: {
      status: 'open', _authorization: { role: 'tournament_director', assignmentId: 'assignment-1', assignmentVersion: 3 },
    } }) });
    expect(db.v1AdminActionLog.create).not.toHaveBeenCalled();
    assignments[0].revokedAt = new Date();
    await expect(writeAdminActionLog(db as unknown as PrismaService, actor, change)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(db.v1OperationAudit.create).toHaveBeenCalledTimes(1);
  });
});
