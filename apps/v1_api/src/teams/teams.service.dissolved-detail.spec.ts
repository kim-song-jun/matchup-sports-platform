/**
 * 해체된 팀의 상세 응답(Task 180 H3). 보관 팀은 404 대신 읽기 전용으로 내려가야 지난 경기의
 * 팀 링크가 끊기지 않는다. 운영 화면이 열리지 않도록 viewer 는 누구에게나 비회원 형태다.
 */
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';

const OWNER = { id: 'owner-user', email: 'o@t.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const MEMBER = { id: 'member-user', email: 'm@t.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

function teamRow(status: 'active' | 'archived', deletedAt: Date | null) {
  const membership = (userId: string, role: string) => ({
    id: `m-${userId}`, teamId: 'team-1', userId, role, status: 'active', joinedAt: new Date('2026-01-01'),
    user: { profile: { nickname: userId, displayName: null, profileImageUrl: null } },
  });
  return {
    id: 'team-1', name: '마포 FC', status, deletedAt, joinPolicy: 'approval_required', contactPolicy: 'open',
    membersVisible: true, memberCount: 2, managerCount: 0, ownerUserId: OWNER.id, updatedAt: new Date('2026-09-01'),
    sport: { id: 'sport-1', name: '풋살' }, region: null, profile: null, joinApplications: [], trustScore: null,
    memberships: [membership(OWNER.id, 'owner'), membership(MEMBER.id, 'member')],
    ownerUser: { id: OWNER.id, profile: null },
  };
}

function setup(row: ReturnType<typeof teamRow>, archivedByActor: 'user' | 'admin' = 'user') {
  const prisma = {
    v1Team: { findFirst: jest.fn().mockResolvedValue(row) },
    v1StatusChangeLog: { findMany: jest.fn().mockResolvedValue([{ targetId: 'team-1', actorType: archivedByActor }]) },
    v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamContactBlock: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMatch: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const service = new TeamsService(prisma as unknown as PrismaService, {} as NotificationsService);
  return { prisma, service };
}

describe('TeamsService.detail — 해체된 팀', () => {
  afterEach(() => jest.useRealTimers());

  it('보관 팀도 상세를 준다 — 멈춘(suspended) 팀은 여전히 조회 대상이 아니다', async () => {
    const { prisma, service } = setup(teamRow('archived', new Date()));
    await service.detail(null, 'team-1');
    expect(prisma.v1Team.findFirst.mock.calls[0][0].where).toEqual({
      id: 'team-1',
      OR: [{ status: 'active', deletedAt: null }, { status: 'archived' }],
    });
  });

  it('팀장에게도 비회원 viewer 를 주고 멤버·컨택을 닫되, 기간 안이면 복구 가능을 알린다', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T00:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const dissolvedAt = new Date('2026-09-20T00:00:00.000Z');
    const { service } = setup(teamRow('archived', dissolvedAt));
    const result = await service.detail(OWNER, 'team-1');

    expect(result.status).toBe('archived');
    expect(result.viewer).toMatchObject({ role: 'none', membershipId: null, canRequestJoin: false, disabledReason: 'TEAM_DISSOLVED', manageRoute: null });
    expect(result.canViewMembers).toBe(false);
    expect(result.membersPreview).toEqual([]);
    expect(result.canSendContact).toBeUndefined();
    expect(result.contactPolicy).toBeUndefined();
    expect(result.dissolution).toEqual({
      dissolvedAt,
      archivedBy: 'owner',
      restoreDeadlineAt: new Date('2026-10-20T00:00:00.000Z'),
      canRestore: true,
    });
  });

  it('운영팀이 보관한 팀은 팀장에게도 기간 안 복구 버튼이 켜지지 않는다', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T00:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service } = setup(teamRow('archived', new Date('2026-09-20T00:00:00.000Z')), 'admin');
    expect((await service.detail(OWNER, 'team-1')).dissolution).toMatchObject({ archivedBy: 'admin', canRestore: false, restoreDeadlineAt: null });
  });

  it('팀원·비로그인에게는 복구 버튼도, 누가 보관했는지도 알리지 않는다', async () => {
    const dissolvedAt = new Date();
    for (const viewer of [MEMBER, null]) {
      const { service, prisma } = setup(teamRow('archived', dissolvedAt));
      expect((await service.detail(viewer, 'team-1')).dissolution).toMatchObject({ archivedBy: null, canRestore: false });
      expect(prisma.v1StatusChangeLog.findMany).not.toHaveBeenCalled();
    }
  });

  it('활동 중인 팀은 그대로 — dissolution 은 null 이고 팀장 viewer 가 유지된다', async () => {
    const { service } = setup(teamRow('active', null));
    const result = await service.detail(OWNER, 'team-1');
    expect(result.dissolution).toBeNull();
    expect(result.viewer.role).toBe('owner');
    expect(result.membersPreview).toHaveLength(2);
  });
});
