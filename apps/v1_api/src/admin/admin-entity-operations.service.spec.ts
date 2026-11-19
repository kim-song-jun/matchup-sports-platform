import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminEntityOperationsService } from './admin-entity-operations.service';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';

const NOW = new Date('2026-11-19T01:00:00Z');
function setup() {
  const delegate = () => ({ findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ id: 'target' }),
    findUniqueOrThrow: jest.fn() });
  const prisma = { v1User: delegate(), v1Team: delegate(), v1Inquiry: delegate(), v1StatusChangeLog: delegate(),
    v1TeamJoinApplication: delegate(), v1TeamMatch: delegate(), v1MatchParticipant: delegate(),
    v1TournamentRegistration: delegate(), v1ParticipantIdentityLinkCurrent: delegate(), v1GameResultParticipant: delegate() };
  const admins = { getActiveAdmin: jest.fn().mockResolvedValue({ id: 'admin-record', userId: 'admin' }) };
  return { prisma, admins, service: new AdminEntityOperationsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService) };
}

describe('AdminEntityOperationsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('denies unauthorized readers before loading any target data', async () => {
    const { service, admins, prisma } = setup();
    admins.getActiveAdmin.mockRejectedValue(new ForbiddenException());
    await expect(service.list('visitor', 'users', 'target', 'history', 1)).rejects.toThrow(ForbiddenException);
    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
  });

  it('returns not found for an absent target rather than a successful empty history', async () => {
    const { service, prisma } = setup(); prisma.v1Team.findUnique.mockResolvedValue(null);
    await expect(service.list('admin', 'teams', 'missing', 'history', 1)).rejects.toThrow(NotFoundException);
  });

  it('reads history by target, not by the member who acted on another account', async () => {
    const { service, prisma } = setup();
    const logs = [
      { id: 'own', targetType: 'user', targetId: 'target', actorUserId: null, actorType: 'admin', toStatus: 'suspended', fromStatus: 'active',
        reason: '운영 확인', createdAt: NOW, adminUser: { userId: 'operator', user: { profile: { nickname: '운영자' } } }, actorUser: null },
      { id: 'unrelated', targetType: 'user', targetId: 'other', actorUserId: 'target', actorType: 'user', toStatus: 'deleted', fromStatus: 'active', reason: '다른 대상', createdAt: NOW },
    ];
    prisma.v1StatusChangeLog.findMany.mockImplementation(({ where }) => Promise.resolve(logs.filter((row) => row.targetId === where.targetId && row.targetType === where.targetType)));
    prisma.v1StatusChangeLog.count.mockResolvedValue(1);
    const result = await service.list('admin', 'users', 'target', 'history', 1);
    expect(result.items).toEqual([expect.objectContaining({ id: 'own', actor: '운영자', fromStatus: 'active', status: 'suspended', reason: '운영 확인' })]);
  });

  it('distinguishes inquiries written by a member from inquiries about that member', async () => {
    const { service, prisma } = setup();
    prisma.v1Inquiry.findMany.mockResolvedValue([
      { id: 'written', title: '로그인 문의', userId: 'target', status: 'answered', category: 'account', createdAt: NOW, closedAt: NOW },
      { id: 'reported', title: '대상 신고', userId: 'other', status: 'received', category: 'report', createdAt: NOW, closedAt: null },
    ]);
    prisma.v1Inquiry.count.mockResolvedValue(11);
    const result = await service.list('admin', 'users', 'target', 'inquiries', 1);
    expect(result.items.map((item) => item.description)).toEqual(['본인 작성 · 처리 완료', '대상 관련']);
    expect(result.pageInfo).toEqual({ page: 1, pageSize: 10, total: 11, hasNext: true });
    expect(result.items[1].href).toBe('/admin/inquiries/reported');
  });

  it('links league and tournament fixtures to their admin surface, with away matches included', async () => {
    const { service, prisma } = setup();
    prisma.v1TeamMatch.findMany.mockResolvedValue([
      { id: 'away', title: '원정 경기', status: 'matched', startAt: NOW, hostTeamId: 'other', tournamentId: null, leagueId: 'league' },
      { id: 'home', title: '대회 경기', status: 'matched', startAt: NOW, hostTeamId: 'target', tournamentId: 'cup', leagueId: null },
    ]);
    const result = await service.list('admin', 'teams', 'target', 'matches', 1);
    expect(result.items.map((item) => [item.href, item.description])).toEqual([
      ['/admin/league-matches/league', '참가 / 원정'], ['/admin/tournaments/cup', '주최 / 홈'],
    ]);
  });

  it('reports team owner account state, pending joins, and last completed fixture date separately', async () => {
    const { service, prisma } = setup();
    prisma.v1Team.findUniqueOrThrow.mockResolvedValue({ ownerUser: { id: 'owner', accountStatus: 'suspended', lastLoginAt: NOW } });
    prisma.v1TeamJoinApplication.count.mockResolvedValue(3);
    prisma.v1TeamMatch.findFirst.mockResolvedValue({ startAt: NOW });
    expect(await service.context('admin', 'teams', 'target')).toEqual({ kind: 'team', ownerAccountStatus: 'suspended',
      ownerLastLoginAt: NOW, pendingJoinCount: 3, lastPlayedAt: NOW });
    expect(prisma.v1TeamMatch.findFirst.mock.calls[0][0].where).toMatchObject({ status: 'completed', deletedAt: null, startAt: { lte: expect.any(Date) } });
  });

  it('returns current signup blockers and computes the withdrawal deadline from the target log', async () => {
    const { service, prisma } = setup();
    jest.spyOn(ManagedTermsRuntimeService.prototype, 'signupCompliance').mockResolvedValue({ compliant: false, pendingRequiredDocumentIds: ['terms'], nextRoute: '/terms' });
    prisma.v1User.findUniqueOrThrow.mockResolvedValue({ onboardingStatus: 'social_profile_deferred', accountStatus: 'withdrawal_pending',
      deletedAt: null, phoneVerifiedAt: null, adminUser: null, profile: { nickname: '임시' }, termsConsents: [{ id: 'old' }],
      authIdentities: [{ provider: 'apple' }], _count: { sportPreferences: 0 } });
    prisma.v1StatusChangeLog.findFirst.mockResolvedValue({ createdAt: NOW });
    const result = await service.context('admin', 'users', 'target');
    expect(result).toMatchObject({ kind: 'user', signupStage: 'profile_deferred',
      missingItems: ['terms', 'basicProfile', 'phone', 'interestSport'], deletionFinalized: false,
      withdrawalScheduledAt: new Date('2026-12-19T01:00:00Z') });
    expect(prisma.v1StatusChangeLog.findFirst.mock.calls[0][0].where).toEqual({ targetType: 'user', targetId: 'target', toStatus: 'withdrawal_pending' });
  });

  it('only reads current official appearances for the member current identity links', async () => {
    const { service, prisma } = setup();
    prisma.v1ParticipantIdentityLinkCurrent.findMany.mockResolvedValue([{ participantId: 'p-current' }]);
    prisma.v1GameResultParticipant.findMany.mockResolvedValue([{ id: 'appearance', resultRevision: {
      officialAt: NOW, game: { teamMatch: { id: 'match', title: '실제 출전', status: 'completed', startAt: NOW, tournamentId: null, leagueId: null } },
    } }]);
    prisma.v1GameResultParticipant.count.mockResolvedValue(1);
    const result = await service.list('admin', 'users', 'target', 'appearances', 1);
    expect(result.items).toEqual([expect.objectContaining({ title: '실제 출전', href: '/admin/team-matches/match', description: '현재 공식 결과의 출전자 기록' })]);
    expect(prisma.v1GameResultParticipant.findMany.mock.calls[0][0].where).toMatchObject({
      participantId: { in: ['p-current'] }, resultRevision: { officialAt: { not: null }, currentGames: { some: {} } },
    });
  });

  it('paginates the full history instead of returning an unlabelled truncated list', async () => {
    const { service, prisma } = setup();
    prisma.v1StatusChangeLog.count.mockResolvedValue(22);
    const result = await service.list('admin', 'teams', 'target', 'history', 3);
    expect(result.pageInfo).toEqual({ page: 3, pageSize: 10, total: 22, hasNext: false });
    expect(prisma.v1StatusChangeLog.findMany.mock.calls[0][0]).toMatchObject({ take: 10, skip: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  });

  it('does not show an old withdrawal deadline on a reactivated account', async () => {
    const { service, prisma } = setup();
    jest.spyOn(ManagedTermsRuntimeService.prototype, 'signupCompliance').mockResolvedValue({ compliant: true, pendingRequiredDocumentIds: [], nextRoute: null });
    prisma.v1User.findUniqueOrThrow.mockResolvedValue({ onboardingStatus: 'completed', accountStatus: 'active',
      deletedAt: null, phoneVerifiedAt: NOW, adminUser: null, profile: { nickname: '회원' }, termsConsents: [{ id: 'terms' }],
      authIdentities: [{ provider: 'email' }], _count: { sportPreferences: 1 } });
    prisma.v1StatusChangeLog.findFirst.mockResolvedValue({ createdAt: NOW });
    expect(await service.context('admin', 'users', 'target')).toMatchObject({ missingItems: [], withdrawalScheduledAt: null });
  });
});
