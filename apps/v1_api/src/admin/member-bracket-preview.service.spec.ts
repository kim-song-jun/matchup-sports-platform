import { ForbiddenException } from '@nestjs/common';
import { MemberBracketPreviewService, MEMBER_BRACKET_PREVIEW_TTL_MS } from './member-bracket-preview.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AdminContextService } from '../common/admin-context.service';
import type { GamesService } from '../games/games.service';
import type { TeamsService } from '../teams/teams.service';

const admin = { id: 'admin-row', userId: 'operator', adminRole: 'ops', status: 'active' };
const member = { id: 'member', profile: { nickname: '회원', displayName: null }, accountStatus: 'active', onboardingStatus: 'completed' };
const tournament = { id: 'cup', bracketPublishedAt: new Date(), bracketPublishScheduledAt: null,
  kind: 'regular_tournament', status: 'closed', isPublic: true, deletedAt: null };

describe('MemberBracketPreviewService', () => {
  const prisma = { v1User: { findUnique: jest.fn() }, v1Tournament: { findFirst: jest.fn() },
    v1AdminActionLog: { create: jest.fn(), findFirst: jest.fn() } };
  const admins = { getMutationAdmin: jest.fn() };
  const games = { listMyTournamentFixtures: jest.fn() };
  const teams = { myTeams: jest.fn() };
  const service = new MemberBracketPreviewService(prisma as unknown as PrismaService,
    admins as unknown as AdminContextService, games as unknown as GamesService, teams as unknown as TeamsService);
  beforeEach(() => {
    jest.resetAllMocks();
    admins.getMutationAdmin.mockResolvedValue(admin);
    prisma.v1User.findUnique.mockResolvedValue(member);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournament);
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'audit', createdAt: new Date() });
    prisma.v1AdminActionLog.findFirst.mockImplementation(async ({ where }) =>
      where.adminUserId === admin.id && where.targetId === member.id && where.id === 'audit'
        ? { createdAt: new Date(), afterJson: { tournamentId: 'cup', readOnly: true } } : null);
    teams.myTeams.mockResolvedValue({ items: [{ teamId: 'member-team' }] });
    games.listMyTournamentFixtures.mockResolvedValue({ teams: [] });
  });
  it('creates an audit-bound 10 minute grant without returning a member login token', async () => {
    const result = await service.start('operator', 'member', { tournamentId: 'cup', reason: '대진표 표시 조사' });
    expect(result).toEqual({ previewId: 'audit', tournamentId: 'cup', expiresAt: expect.any(String) });
    expect(prisma.v1AdminActionLog.create.mock.calls[0][0].data).toMatchObject({
      adminUserId: admin.id, targetId: 'member', action: 'user.bracket_preview', afterJson: { tournamentId: 'cup', readOnly: true },
    });
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(Date.now() + MEMBER_BRACKET_PREVIEW_TTL_MS - 1000);
  });
  it('uses the selected member identity for both actual membership and fixture reads', async () => {
    const result = await service.read('operator', 'member', 'audit');
    expect(result.teamIds).toEqual(['member-team']);
    expect(teams.myTeams.mock.calls[0][0].id).toBe('member');
    expect(games.listMyTournamentFixtures.mock.calls[0]).toEqual([expect.objectContaining({ id: 'member' }), 'cup']);
    expect(result.member).toEqual({ id: 'member', name: '회원' });
  });
  it.each(['support', 'non-admin', 'revoked'])('denies %s before reading member data', async role => {
    const { AdminContextService: RealAdminContext } = await import('../common/admin-context.service');
    const realContext = new RealAdminContext({ v1AdminUser: { findUnique: jest.fn().mockResolvedValue(
      role === 'non-admin' ? null : { ...admin, adminRole: role === 'support' ? 'support' : 'ops',
        status: role === 'revoked' ? 'revoked' : 'active', user: { accountStatus: 'active' } }) } } as unknown as PrismaService);
    admins.getMutationAdmin.mockImplementation((id: string) => realContext.getMutationAdmin(id));
    await expect(service.start('operator', 'member', { tournamentId: 'cup', reason: '대진표 표시 조사' })).rejects.toThrow(ForbiddenException);
    await expect(service.read('operator', 'member', 'audit')).rejects.toThrow(ForbiddenException);
    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
  });
  it('rejects another target and another administrator grant', async () => {
    await expect(service.read('operator', 'other-member', 'audit')).rejects.toThrow(ForbiddenException);
    admins.getMutationAdmin.mockResolvedValue({ ...admin, id: 'another-admin' });
    await expect(service.read('operator', 'member', 'audit')).rejects.toThrow(ForbiddenException);
    expect(teams.myTeams).not.toHaveBeenCalled();
  });
  it('rejects expiry at the exact boundary before returning private membership data', async () => {
    prisma.v1AdminActionLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - MEMBER_BRACKET_PREVIEW_TTL_MS),
      afterJson: { tournamentId: 'cup' } });
    await expect(service.read('operator', 'member', 'audit')).rejects.toThrow(ForbiddenException);
    expect(teams.myTeams).not.toHaveBeenCalled();
  });
  it('revokes access when the selected tournament is no longer public', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(service.read('operator', 'member', 'audit')).rejects.toThrow();
    expect(teams.myTeams).not.toHaveBeenCalled();
    expect(games.listMyTournamentFixtures).not.toHaveBeenCalled();
  });
  it('does not open a preview when the mandatory audit write fails', async () => {
    prisma.v1AdminActionLog.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(service.start('operator', 'member', { tournamentId: 'cup', reason: '대진표 표시 조사' })).rejects.toThrow('audit unavailable');
  });
  it.each(['suspended', 'blocked', 'deleted'])('rejects a %s target on each read', async accountStatus => {
    prisma.v1User.findUnique.mockResolvedValue({ ...member, accountStatus });
    await expect(service.read('operator', 'member', 'audit')).rejects.toThrow(ForbiddenException);
  });
  it('accepts scheduled bracket publication but rejects unpublished brackets', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ ...tournament, bracketPublishedAt: null,
      bracketPublishScheduledAt: new Date(Date.now() - 1000) });
    await expect(service.start('operator', 'member', { tournamentId: 'cup', reason: '대진표 표시 조사' })).resolves.toHaveProperty('previewId');
    prisma.v1Tournament.findFirst.mockResolvedValue({ ...tournament, bracketPublishedAt: null });
    await expect(service.start('operator', 'member', { tournamentId: 'cup', reason: '대진표 표시 조사' })).rejects.toThrow();
  });
});
