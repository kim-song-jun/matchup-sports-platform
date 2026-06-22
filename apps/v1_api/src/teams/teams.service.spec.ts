/**
 * teams.service.spec.ts
 *
 * Service-layer contract tests for TeamsService.
 * Each test asserts observable behaviour: correct HTTP error status/code,
 * right state transition, idempotent no-op, or computed guard logic.
 * No test asserts only that a mock returned what we told it to return.
 */
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const owner = {
  id: 'owner-user',
  email: 'owner@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const manager = {
  id: 'manager-user',
  email: 'manager@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const member = {
  id: 'member-user',
  email: 'member@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const suspended = {
  id: 'suspended-user',
  email: 'suspended@teameet.v1',
  accountStatus: 'suspended' as const,
  onboardingStatus: 'completed' as const,
};

function teamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-1',
    status: 'active',
    joinPolicy: 'approval_required',
    memberCount: 5,
    managerCount: 1,
    membersVisible: true,
    ownerUserId: owner.id,
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function membershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    teamId: 'team-1',
    userId: owner.id,
    role: 'owner' as const,
    status: 'active' as const,
    joinedAt: new Date('2026-01-01'),
    leftAt: null,
    removedByUserId: null,
    team: teamRow(),
    ...overrides,
  };
}

function applicationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    teamId: 'team-1',
    applicantUserId: member.id,
    status: 'requested',
    message: null,
    createdAt: new Date('2026-06-01'),
    reviewedByUserId: null,
    reviewedAt: null,
    withdrawnAt: null,
    team: teamRow(),
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: {
    v1Team: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
    v1TeamMembership: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; create: jest.Mock; upsert: jest.Mock; findUnique: jest.Mock };
    v1TeamJoinApplication: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock; createMany: jest.Mock };
    v1Sport: { findFirst: jest.Mock };
    v1Region: { findFirst: jest.Mock };
    v1ChatRoom: { findUnique: jest.Mock };
    v1ChatRoomParticipant: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { emitNotification: jest.Mock; emitToManyDeferred: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1Team: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
      v1TeamMembership: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      v1TeamJoinApplication: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      v1StatusChangeLog: { create: jest.fn(), createMany: jest.fn() },
      v1Sport: { findFirst: jest.fn() },
      v1Region: { findFirst: jest.fn() },
      v1ChatRoom: { findUnique: jest.fn() },
      v1ChatRoomParticipant: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };

    // Default: $transaction executes the callback with prisma itself as tx
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );

    notifications = {
      emitNotification: jest.fn().mockResolvedValue(undefined),
      emitToManyDeferred: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TeamsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── removeMembership: owner 제거 불가 ──────────────────────────────────────

  it('removeMembership: owner 멤버십은 제거할 수 없다 → 409 STATE_CONFLICT', async () => {
    // owner가 본인을 제거하려 해도, 또는 다른 owner 역할도 동일
    const ownerMembership = membershipRow({ role: 'owner', userId: member.id });
    // getMembershipWithTeam(target) → owner 역할 멤버십, getManagementActor(caller) → owner 본인
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(ownerMembership) // getMembershipWithTeam (the target)
      .mockResolvedValueOnce({ role: 'owner' }); // getManagementActor (caller IS owner)

    // owner 멤버십 제거는 ConflictException(409, code=STATE_CONFLICT) — ForbiddenException 아님
    await expect(
      service.removeMembership(owner, 'mem-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STATE_CONFLICT' }),
    });
  });

  // ─── removeMembership: 비-owner는 제거 불가 (getManagementActor) ──────────────────

  it('removeMembership: owner가 아닌 사용자는 멤버 제거를 시도해도 403', async () => {
    const targetMembership = membershipRow({ role: 'member', userId: member.id, userId2: 'target' });
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(targetMembership) // getMembershipWithTeam
      .mockResolvedValueOnce(null);            // getManagementActor → not owner → throws

    await expect(
      service.removeMembership(manager, 'mem-1', {}),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── changeMembershipRole: owner 역할을 일반 API로 변경 불가 ────────────────

  it('changeMembershipRole: 대상이 owner인 경우 역할 변경 불가 → 409 STATE_CONFLICT', async () => {
    const ownerTarget = membershipRow({ role: 'owner', userId: 'target-user', status: 'active' });
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(ownerTarget) // getMembershipWithTeam
      .mockResolvedValueOnce({ role: 'owner' }); // getManagementActor (caller is owner)

    await expect(
      service.changeMembershipRole(owner, 'mem-target', { role: 'manager' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STATE_CONFLICT' }),
    });
  });

  // ─── changeMembershipRole: 매니저 수 한도 초과 → 409 MANAGER_LIMIT_EXCEEDED ─

  it('changeMembershipRole: 매니저가 이미 5명일 때 member→manager 승격 불가 → 409 MANAGER_LIMIT_EXCEEDED', async () => {
    const memberTarget = membershipRow({
      role: 'member',
      userId: 'target-user',
      status: 'active',
      team: teamRow({ managerCount: 5 }),
    });

    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(memberTarget) // getMembershipWithTeam
      .mockResolvedValueOnce({ role: 'owner' }); // getManagementActor

    await expect(
      service.changeMembershipRole(owner, 'mem-target', { role: 'manager' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MANAGER_LIMIT_EXCEEDED' }),
    });
  });

  // ─── changeMembershipRole: 이미 같은 역할이면 no-op ──────────────────────────

  it('changeMembershipRole: 이미 manager인 멤버를 manager로 변경하면 DB 업데이트 없이 현재 상태 반환', async () => {
    const managerTarget = membershipRow({
      role: 'manager',
      userId: 'target-user',
      status: 'active',
      team: teamRow({ managerCount: 1 }),
    });

    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(managerTarget) // getMembershipWithTeam
      .mockResolvedValueOnce({ role: 'owner' }); // getManagementActor

    const result = await service.changeMembershipRole(owner, 'mem-1', { role: 'manager' });

    // No DB update was triggered
    expect(prisma.v1TeamMembership.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      membershipId: 'mem-1',
      role: 'manager',
    });
  });

  // ─── approveJoinApplication: 닫힌 팀에는 승인 불가 → 409 STATE_CONFLICT ──────

  it('approveJoinApplication: joinPolicy=closed 팀은 신청 승인 불가 → 409 STATE_CONFLICT', async () => {
    const closedTeamApplication = applicationRow({
      status: 'requested',
      team: teamRow({ joinPolicy: 'closed', status: 'active' }),
    });

    // assertManagerOrOwner: caller is manager
    prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ id: 'mgr-mem' });
    prisma.v1TeamJoinApplication.findFirst.mockResolvedValueOnce(closedTeamApplication);

    await expect(
      service.approveJoinApplication(manager, 'app-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STATE_CONFLICT' }),
    });
    // Critically: the transaction must NOT have run
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── approveJoinApplication: 이미 처리된 신청 → 409 STATE_CONFLICT ───────────

  it('approveJoinApplication: 이미 approved인 신청은 다시 승인 불가 → 409 STATE_CONFLICT', async () => {
    const alreadyApproved = applicationRow({
      status: 'approved',
      team: teamRow({ joinPolicy: 'approval_required', status: 'active' }),
    });

    prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ id: 'mgr-mem' }); // assertManagerOrOwner
    prisma.v1TeamJoinApplication.findFirst.mockResolvedValueOnce(alreadyApproved);

    await expect(
      service.approveJoinApplication(manager, 'app-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STATE_CONFLICT' }),
    });
  });

  // ─── withdrawJoinApplication: 본인이 아닌 사용자가 철회 불가 → 403 ───────────

  it('withdrawJoinApplication: 신청자 본인이 아닌 사용자가 철회 시도하면 403 PERMISSION_DENIED', async () => {
    const otherUsersApplication = applicationRow({
      applicantUserId: 'someone-else',
      status: 'requested',
    });

    prisma.v1TeamJoinApplication.findFirst.mockResolvedValueOnce(otherUsersApplication);

    await expect(
      service.withdrawJoinApplication(member, 'app-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    });
    // Verify the correct exception type
    await prisma.v1TeamJoinApplication.findFirst.mockResolvedValueOnce(otherUsersApplication);
    await expect(
      service.withdrawJoinApplication(member, 'app-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── withdrawJoinApplication: 이미 withdrawn → 409 ALREADY_PROCESSED ────────

  it('withdrawJoinApplication: 이미 withdrawn 상태인 신청 재철회 시도 → 409 ALREADY_PROCESSED', async () => {
    const withdrawnApp = applicationRow({
      applicantUserId: member.id,
      status: 'withdrawn',
    });

    prisma.v1TeamJoinApplication.findFirst.mockResolvedValueOnce(withdrawnApp);

    await expect(
      service.withdrawJoinApplication(member, 'app-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_PROCESSED' }),
    });
  });

  // ─── createJoinApplication: 계정 정지 시 신청 불가 → 403 PERMISSION_DENIED ──

  it('createJoinApplication: 정지된 계정(suspended)은 팀 가입 신청 불가 → 403 PERMISSION_DENIED', async () => {
    // assertActiveAccount throws before any DB call
    await expect(
      service.createJoinApplication(suspended, 'team-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    });
    // Crucially: no DB queries were made
    expect(prisma.v1Team.findFirst).not.toHaveBeenCalled();
    expect(prisma.v1TeamJoinApplication.findFirst).not.toHaveBeenCalled();
  });

  // ─── createJoinApplication: 닫힌 팀 신청 → 409 JOIN_CLOSED ──────────────────

  it('createJoinApplication: joinPolicy=closed 팀에 가입 신청 → 409 JOIN_CLOSED', async () => {
    const closedTeam = {
      ...teamRow({ joinPolicy: 'closed' }),
      sport: { id: 's-1', name: '풋살' },
      region: null,
      profile: null,
      memberships: [],
      joinApplications: [],
      trustScore: null,
      ownerUser: { id: owner.id, profile: null },
    };

    prisma.v1Team.findFirst.mockResolvedValueOnce(closedTeam);

    await expect(
      service.createJoinApplication(member, 'team-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'JOIN_CLOSED' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── createJoinApplication: 이미 멤버인 경우 → 409 ALREADY_MEMBER ──────────

  it('createJoinApplication: 이미 팀 멤버인 사용자가 가입 신청 → 409 ALREADY_MEMBER', async () => {
    const teamWithActiveMembership = {
      ...teamRow({ joinPolicy: 'approval_required' }),
      sport: { id: 's-1', name: '풋살' },
      region: null,
      profile: null,
      memberships: [
        {
          id: 'mem-existing',
          userId: member.id,
          teamId: 'team-1',
          role: 'member',
          status: 'active',
          joinedAt: new Date('2026-01-01'),
          user: { profile: { nickname: '테스트유저', displayName: null, profileImageUrl: null } },
        },
      ],
      joinApplications: [],
      trustScore: null,
      ownerUser: { id: owner.id, profile: null },
    };

    prisma.v1Team.findFirst.mockResolvedValueOnce(teamWithActiveMembership);

    await expect(
      service.createJoinApplication(member, 'team-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_MEMBER' }),
    });
  });

  // ─── rejectJoinApplication: 비-매니저 거절 시도 → 403 ───────────────────────

  it('rejectJoinApplication: 일반 멤버(member)가 신청 거절 시도 → 403 PERMISSION_DENIED', async () => {
    // assertManagerOrOwner: findFirst returns null → not a manager/owner
    prisma.v1TeamMembership.findFirst.mockResolvedValueOnce(null);
    prisma.v1TeamJoinApplication.findFirst.mockResolvedValueOnce(applicationRow());

    await expect(
      service.rejectJoinApplication(member, 'app-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── removeMembership: 비활성 멤버십 제거 → 409 ALREADY_PROCESSED ────────────

  it('removeMembership: 이미 inactive(left) 상태인 멤버십 제거 시도 → 409 ALREADY_PROCESSED', async () => {
    const inactiveMembership = membershipRow({
      role: 'member',
      userId: 'target-user',
      status: 'left',
    });

    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(inactiveMembership) // getMembershipWithTeam
      .mockResolvedValueOnce({ role: 'owner' }); // getManagementActor

    await expect(
      service.removeMembership(owner, 'mem-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_PROCESSED' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── manager 권한 확장: member 대상은 관리 가능, 다른 manager/owner 는 불가 ────

  it('changeMembershipRole: manager가 member를 manager로 승격할 수 있다 (member 대상 관리 허용)', async () => {
    const memberTarget = membershipRow({
      role: 'member',
      userId: 'target-user',
      status: 'active',
      team: teamRow({ managerCount: 1 }),
    });
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(memberTarget) // getMembershipWithTeam (target)
      .mockResolvedValueOnce({ role: 'manager' }); // getManagementActor (caller is manager)
    prisma.v1TeamMembership.update.mockResolvedValue({
      id: 'mem-1',
      teamId: 'team-1',
      role: 'manager',
    });
    prisma.v1Team.update.mockResolvedValue({ managerCount: 2 });

    const result = await service.changeMembershipRole(manager, 'mem-1', { role: 'manager' });

    expect(prisma.v1TeamMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'manager' } }),
    );
    expect(result).toMatchObject({ role: 'manager', managerCount: 2 });
  });

  it('changeMembershipRole: manager는 다른 manager의 역할을 변경할 수 없다 → 403 PERMISSION_DENIED', async () => {
    const managerTarget = membershipRow({
      role: 'manager',
      userId: 'other-manager',
      status: 'active',
      team: teamRow({ managerCount: 2 }),
    });
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(managerTarget) // getMembershipWithTeam (target)
      .mockResolvedValueOnce({ role: 'manager' }); // getManagementActor (caller is manager)

    await expect(
      service.changeMembershipRole(manager, 'mem-1', { role: 'member' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('removeMembership: manager가 member를 추방할 수 있다 (member 대상 관리 허용)', async () => {
    const memberTarget = membershipRow({
      role: 'member',
      userId: 'target-user',
      status: 'active',
    });
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(memberTarget) // getMembershipWithTeam (target)
      .mockResolvedValueOnce({ role: 'manager' }); // getManagementActor (caller is manager)
    prisma.v1TeamMembership.update.mockResolvedValue({
      id: 'mem-1',
      teamId: 'team-1',
      status: 'removed',
    });
    prisma.v1Team.update.mockResolvedValue({ memberCount: 4 });
    prisma.v1ChatRoom.findUnique.mockResolvedValue(null); // 채팅방 없음 → 참가자 정리 early-return

    const result = await service.removeMembership(manager, 'mem-1', {});

    expect(prisma.v1TeamMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'removed' }) }),
    );
    expect(result).toMatchObject({ status: 'removed', memberCount: 4 });
  });

  it('removeMembership: manager는 다른 manager를 추방할 수 없다 → 403 PERMISSION_DENIED', async () => {
    const managerTarget = membershipRow({
      role: 'manager',
      userId: 'other-manager',
      status: 'active',
    });
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(managerTarget) // getMembershipWithTeam (target)
      .mockResolvedValueOnce({ role: 'manager' }); // getManagementActor (caller is manager)

    await expect(
      service.removeMembership(manager, 'mem-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
