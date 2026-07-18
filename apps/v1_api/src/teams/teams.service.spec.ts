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
    name: '테스트팀',
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

// ─── Invitation fixtures ──────────────────────────────────────────────────────

const invitee = {
  id: 'invitee-user',
  email: 'invitee@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    teamId: 'team-1',
    invitedUserId: invitee.id,
    invitedByUserId: manager.id,
    status: 'pending' as const,
    message: null,
    createdAt: new Date('2026-06-01'),
    respondedAt: null,
    team: { id: 'team-1', name: '테스트팀', status: 'active', memberCount: 5 },
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: {
    v1Team: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; create: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    v1TeamProfile: { upsert: jest.Mock };
    v1TeamMembership: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock; create: jest.Mock; upsert: jest.Mock; findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; updateMany: jest.Mock; count: jest.Mock };
    v1TeamJoinApplication: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
    v1TeamInvitation: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    v1User: { findUnique: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock; createMany: jest.Mock };
    v1Sport: { findFirst: jest.Mock };
    v1Region: { findFirst: jest.Mock };
    v1ChatRoom: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock; upsert: jest.Mock };
    v1ChatRoomParticipant: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock; create: jest.Mock; upsert: jest.Mock };
    v1ChatMessage: { create: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let notifications: { emitNotification: jest.Mock; emitToManyDeferred: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1Team: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
      v1TeamProfile: { upsert: jest.fn() },
      v1TeamMembership: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      v1TeamJoinApplication: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      v1TeamInvitation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      v1User: { findUnique: jest.fn() },
      v1StatusChangeLog: { create: jest.fn(), createMany: jest.fn() },
      v1Sport: { findFirst: jest.fn() },
      v1Region: { findFirst: jest.fn() },
      v1ChatRoom: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), upsert: jest.fn() },
      v1ChatRoomParticipant: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), upsert: jest.fn() },
      v1ChatMessage: { create: jest.fn() },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };

    // Default: $transaction executes the callback with prisma itself as tx
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma),
    );
    prisma.$queryRaw.mockResolvedValue(undefined);
    prisma.v1ChatRoom.upsert.mockResolvedValue({ id: 'room-1' });
    prisma.v1ChatRoomParticipant.upsert.mockResolvedValue({ id: 'participant-1' });
    prisma.v1ChatRoomParticipant.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1ChatMessage.create.mockResolvedValue({ sentAt: new Date('2026-06-01T10:00:00.000Z') });
    prisma.v1User.findUnique.mockResolvedValue({
      phone: '01012345678',
      profile: { realName: '새 멤버 실명', gender: 'male', displayName: '새 멤버', nickname: '새멤버' },
    });

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

  it('create blocks an incomplete creator profile in the service layer', async () => {
    prisma.v1User.findUnique.mockResolvedValueOnce({
      phone: null,
      profile: { realName: null, gender: 'male' },
    });

    await expect(
      service.create(owner, {
        sportId: 'sport-1',
        regionId: 'region-seoul',
        name: '생성되면 안 되는 팀',
        joinPolicy: 'approval_required',
      }),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'PROFILE_COMPLETION_REQUIRED',
        details: { missingFields: ['realName', 'phone'] },
      },
    });
    expect(prisma.v1Team.create).not.toHaveBeenCalled();
  });

  describe('team region validation', () => {
    it('create allows a city-level region for city-wide teams', async () => {
      prisma.v1Sport.findFirst.mockResolvedValueOnce({ id: 'sport-1' });
      prisma.v1Region.findFirst.mockResolvedValueOnce({ id: 'region-seoul' });
      prisma.v1Team.create.mockResolvedValueOnce(teamRow({ id: 'team-city', regionId: 'region-seoul' }));
      prisma.v1TeamMembership.create.mockResolvedValueOnce(membershipRow({ id: 'mem-city', teamId: 'team-city' }));
      prisma.v1StatusChangeLog.createMany.mockResolvedValueOnce({ count: 2 });

      await expect(
        service.create(owner, {
          sportId: 'sport-1',
          regionId: 'region-seoul',
          name: '서울 전체 팀',
          joinPolicy: 'approval_required',
        }),
      ).resolves.toMatchObject({
        teamId: 'team-city',
        membershipId: 'mem-city',
      });

      expect(prisma.v1Region.findFirst).toHaveBeenCalledWith({
        where: { id: 'region-seoul', isActive: true, level: { in: [1, 2] } },
        select: { id: true },
      });
      expect(prisma.v1Team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            membersVisible: true,
            regionId: 'region-seoul',
          }),
        }),
      );
    });

    it('update allows a city-level region for city-wide teams', async () => {
      const updatedAt = new Date('2026-06-01T00:00:00.000Z');
      const nextUpdatedAt = new Date('2026-06-02T00:00:00.000Z');
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        ...teamRow({ updatedAt, membersVisible: true }),
        memberships: [membershipRow({ role: 'owner', userId: owner.id })],
      });
      prisma.v1Sport.findFirst.mockResolvedValueOnce({ id: 'sport-1' });
      prisma.v1Region.findFirst.mockResolvedValueOnce({ id: 'region-seoul' });
      prisma.v1Team.update.mockResolvedValueOnce({
        ...teamRow({ id: 'team-1', updatedAt: nextUpdatedAt, membersVisible: true }),
      });
      prisma.v1TeamProfile.upsert.mockResolvedValueOnce({ teamId: 'team-1' });

      await expect(
        service.update(owner, 'team-1', {
          version: updatedAt.toISOString(),
          sportId: 'sport-1',
          regionId: 'region-seoul',
          name: '서울 전체 팀',
          logoUrl: null,
          coverImageUrl: null,
          introduction: null,
          activityAreaText: null,
          activityDays: [],
          activityFrequency: null,
          activityTimeSlots: [],
          activityTypes: [],
          activityMemo: null,
          skillLevelText: null,
          minLevelCode: null,
          maxLevelCode: null,
          genderRule: null,
          joinPolicy: 'approval_required',
          memberGoalCount: null,
          membersVisibilityEnabled: true,
        }),
      ).resolves.toMatchObject({
        teamId: 'team-1',
        version: nextUpdatedAt.toISOString(),
        membersVisibilityEnabled: true,
      });

      expect(prisma.v1Region.findFirst).toHaveBeenCalledWith({
        where: { id: 'region-seoul', isActive: true, level: { in: [1, 2] } },
        select: { id: true },
      });
      expect(prisma.v1Team.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            regionId: 'region-seoul',
          }),
        }),
      );
    });
  });

  describe('list', () => {
    it('includes owner and active manager in each list item', async () => {
      prisma.v1Team.findMany.mockResolvedValueOnce([
        {
          ...teamRow(),
          name: '테스트팀',
          sport: { id: 'sport-1', name: 'Soccer' },
          region: null,
          profile: null,
          memberships: [
            {
              ...membershipRow({ id: 'owner-membership', role: 'owner', userId: owner.id }),
              user: { profile: { nickname: 'owner-nick', displayName: '오너', profileImageUrl: null } },
            },
            {
              ...membershipRow({ id: 'manager-membership', role: 'manager', userId: manager.id }),
              user: { profile: { nickname: 'manager-nick', displayName: '감독님', profileImageUrl: null } },
            },
          ],
          joinApplications: [],
          trustScore: null,
          ownerUser: {
            id: owner.id,
            profile: { nickname: 'owner-nick', displayName: '오너', profileImageUrl: 'https://example.com/owner.png' },
          },
        },
      ]);

      const result = await service.list(null, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].owner).toEqual({
        userId: owner.id,
        displayName: '오너',
        profileImageUrl: 'https://example.com/owner.png',
      });
      expect(result.items[0].manager).toEqual({
        userId: manager.id,
        displayName: '감독님',
      });
    });

    it('returns manager=null when the team has no active manager', async () => {
      prisma.v1Team.findMany.mockResolvedValueOnce([
        {
          ...teamRow(),
          name: '테스트팀',
          sport: { id: 'sport-1', name: 'Soccer' },
          region: null,
          profile: null,
          memberships: [
            {
              ...membershipRow({ id: 'owner-membership', role: 'owner', userId: owner.id }),
              user: { profile: { nickname: 'owner-nick', displayName: null, profileImageUrl: null } },
            },
            {
              ...membershipRow({ id: 'member-membership', role: 'member', userId: member.id }),
              user: { profile: { nickname: 'member-nick', displayName: null, profileImageUrl: null } },
            },
          ],
          joinApplications: [],
          trustScore: null,
          ownerUser: { id: owner.id, profile: null },
        },
      ]);

      const result = await service.list(null, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].owner).toEqual({
        userId: owner.id,
        displayName: '팀장',
        profileImageUrl: null,
      });
      expect(result.items[0].manager).toBeNull();
    });
  });

  describe('member list visibility', () => {
    it('detail allows active members to preview members even when public visibility is disabled', async () => {
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        ...teamRow({ membersVisible: false }),
        name: 'Private team',
        sport: { id: 'sport-1', name: 'Soccer' },
        region: null,
        profile: null,
        memberships: [
          {
            ...membershipRow({ id: 'member-viewer', role: 'member', userId: member.id }),
            user: { profile: { nickname: 'viewer', displayName: null, profileImageUrl: null } },
          },
          {
            ...membershipRow({ id: 'owner-membership', role: 'owner', userId: owner.id }),
            user: { profile: { nickname: 'owner', displayName: null, profileImageUrl: null } },
          },
        ],
        joinApplications: [],
        trustScore: null,
        ownerUser: {
          id: owner.id,
          profile: { nickname: 'owner', displayName: null, profileImageUrl: null },
        },
      });

      const result = await service.detail(member, 'team-1');

      expect(result.membersVisibilityEnabled).toBe(false);
      expect(result.canViewMembers).toBe(true);
      expect(result.membersPreview).toHaveLength(2);
    });

    it('members exposes private profile fields only for the ordinary member viewer own row', async () => {
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        ...teamRow({ membersVisible: false }),
        sport: { id: 'sport-1', name: 'Soccer' },
        region: null,
        profile: null,
        memberships: [membershipRow({ role: 'member', userId: member.id })],
        joinApplications: [],
        trustScore: null,
        ownerUser: { id: owner.id, profile: null },
      });
      prisma.v1TeamMembership.findMany.mockResolvedValueOnce([
        {
          ...membershipRow({ id: 'member-viewer', role: 'member', userId: member.id }),
          user: {
            phone: '010-1111-2222',
            profile: {
              nickname: 'viewer',
              displayName: 'Viewer Real Name',
              realName: 'Viewer Real Name',
              profileImageUrl: null,
              birthDate: new Date('1995-04-03'),
              gender: 'female',
            },
          },
        },
        {
          ...membershipRow({ id: 'other-member', role: 'member', userId: 'other-user' }),
          user: {
            phone: '010-9999-8888',
            profile: {
              nickname: 'other',
              displayName: 'Other Real Name',
              realName: 'Other Real Name',
              profileImageUrl: null,
              birthDate: new Date('1990-01-02'),
              gender: 'male',
            },
          },
        },
      ]);

      const result = await service.members(member, 'team-1', {});

      expect(result.membersVisibilityEnabled).toBe(false);
      expect(result.viewerRole).toBe('member');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        userId: member.id,
        realName: 'Viewer Real Name',
        phone: '010-1111-2222',
        birthDate: new Date('1995-04-03'),
        gender: 'female',
      });
      expect(result.items[1]).toMatchObject({
        userId: 'other-user',
        realName: null,
        phone: null,
        birthDate: null,
        gender: null,
      });
    });

    it('members reports all active owners independently of roster filters and pagination', async () => {
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        ...teamRow({ membersVisible: true }),
        sport: { id: 'sport-1', name: 'Soccer' },
        region: null,
        profile: null,
        memberships: [],
        joinApplications: [],
        trustScore: null,
        ownerUser: { id: owner.id, profile: null },
      });
      prisma.v1TeamMembership.findMany.mockResolvedValueOnce([
        {
          ...membershipRow({ id: 'removed-manager', role: 'manager', status: 'removed', userId: manager.id }),
          user: { phone: null, profile: null },
        },
        {
          ...membershipRow({ id: 'next-removed-manager', role: 'manager', status: 'removed', userId: 'next-manager' }),
          user: { phone: null, profile: null },
        },
      ]);
      prisma.v1TeamMembership.count.mockResolvedValueOnce(2);

      const result = await service.members(null, 'team-1', {
        cursor: 'previous-membership',
        limit: 1,
        role: 'manager',
        status: 'removed',
      });

      expect(result.summary.ownerCount).toBe(2);
      expect(result.items).toHaveLength(1);
      expect(result.pageInfo).toEqual({ nextCursor: 'removed-manager', hasNext: true });
      expect(prisma.v1TeamMembership.count).toHaveBeenCalledWith({
        where: { teamId: 'team-1', role: 'owner', status: 'active' },
      });
    });

    it.each([
      { viewer: owner, role: 'owner' as const },
      { viewer: manager, role: 'manager' as const },
    ])('members exposes roster-required profile fields to an active $role', async ({ viewer, role }) => {
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        ...teamRow({ membersVisible: false }),
        sport: { id: 'sport-1', name: 'Soccer' },
        region: null,
        profile: null,
        memberships: [membershipRow({ role, userId: viewer.id })],
        joinApplications: [],
        trustScore: null,
        ownerUser: { id: owner.id, profile: null },
      });
      prisma.v1TeamMembership.findMany.mockResolvedValueOnce([
        {
          ...membershipRow({ id: 'roster-member', role: 'member', userId: 'roster-user' }),
          user: {
            phone: '010-2222-3333',
            profile: {
              nickname: 'roster',
              displayName: 'Roster Real Name',
              realName: 'Roster Real Name',
              profileImageUrl: null,
              birthDate: new Date('1993-07-08'),
              gender: 'male',
            },
          },
        },
      ]);

      const result = await service.members(viewer, 'team-1', {});

      expect(result.viewerRole).toBe(role);
      expect(result.items[0]).toMatchObject({
        userId: 'roster-user',
        realName: 'Roster Real Name',
        phone: '010-2222-3333',
        birthDate: new Date('1993-07-08'),
        gender: 'male',
      });
    });

    it.each(['left', 'removed'] as const)(
      'members hides private profile fields from the former member own $status row',
      async (status) => {
        prisma.v1Team.findFirst.mockResolvedValueOnce({
          ...teamRow({ membersVisible: true }),
          sport: { id: 'sport-1', name: 'Soccer' },
          region: null,
          profile: null,
          memberships: [membershipRow({ role: 'member', status, userId: member.id })],
          joinApplications: [],
          trustScore: null,
          ownerUser: { id: owner.id, profile: null },
        });
        prisma.v1TeamMembership.findMany.mockResolvedValueOnce([
          {
            ...membershipRow({ id: `former-member-${status}`, role: 'member', status, userId: member.id }),
            user: {
              phone: '010-3333-4444',
              profile: {
                nickname: 'former',
                displayName: 'Former Real Name',
                profileImageUrl: null,
                birthDate: new Date('1991-02-03'),
                gender: 'female',
              },
            },
          },
        ]);

        const result = await service.members(member, 'team-1', { status });

        expect(result.viewerRole).toBe('none');
        expect(result.items[0]).toMatchObject({
          userId: member.id,
          realName: null,
          phone: null,
          birthDate: null,
          gender: null,
        });
      },
    );

    it('detail allows non-members to preview members when public visibility is enabled', async () => {
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        ...teamRow({ membersVisible: true }),
        name: 'Public team',
        sport: { id: 'sport-1', name: 'Soccer' },
        region: null,
        profile: null,
        memberships: [
          {
            ...membershipRow({ id: 'owner-membership', role: 'owner', userId: owner.id }),
            user: { profile: { nickname: 'owner', displayName: null, profileImageUrl: null } },
          },
        ],
        joinApplications: [],
        trustScore: null,
        ownerUser: { id: owner.id, profile: { nickname: 'owner', displayName: null, profileImageUrl: null } },
      });

      const result = await service.detail(null, 'team-1');

      expect(result.membersVisibilityEnabled).toBe(true);
      expect(result.canViewMembers).toBe(true);
      expect(result.membersPreview).toHaveLength(1);
    });

    it('members allows non-members to list public members without internal contact fields', async () => {
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        ...teamRow({ membersVisible: true }),
        sport: { id: 'sport-1', name: 'Soccer' },
        region: null,
        profile: null,
        memberships: [],
        joinApplications: [],
        trustScore: null,
        ownerUser: { id: owner.id, profile: null },
      });
      prisma.v1TeamMembership.findMany.mockResolvedValueOnce([
        {
          ...membershipRow({ id: 'owner-membership', role: 'owner', userId: owner.id }),
          user: {
            phone: '010-0000-0000',
            profile: {
              nickname: 'owner',
              displayName: 'Owner',
              realName: 'Owner Real',
              profileImageUrl: null,
              birthDate: new Date('1990-01-01'),
              gender: 'male',
            },
          },
        },
      ]);

      const result = await service.members(null, 'team-1', {});

      expect(result.viewerRole).toBe('none');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        displayName: 'owner',
        realName: null,
        phone: null,
        birthDate: null,
        gender: null,
      });
    });

    it('members blocks non-members when public visibility is disabled', async () => {
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        ...teamRow({ membersVisible: false }),
        sport: { id: 'sport-1', name: 'Soccer' },
        region: null,
        profile: null,
        memberships: [],
        joinApplications: [],
        trustScore: null,
        ownerUser: { id: owner.id, profile: null },
      });

      await expect(service.members(null, 'team-1', {})).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'MEMBERS_VISIBILITY_DISABLED' }),
      });
      expect(prisma.v1TeamMembership.findMany).not.toHaveBeenCalled();
    });
  });

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

  // ─── leaveTeam: 본인 self-leave ────────────────────────────────────────────

  it('leaveTeam: 마지막 active owner는 나갈 수 없다 → 409 LAST_OWNER_CANNOT_LEAVE', async () => {
    const ownerMembership = membershipRow({ role: 'owner', userId: owner.id, status: 'active' });
    prisma.v1Team.findFirst.mockResolvedValueOnce({
      ...teamRow(),
      memberships: [ownerMembership],
    });
    prisma.v1TeamMembership.count.mockResolvedValueOnce(0); // no other active owner

    await expect(
      service.leaveTeam(owner, 'team-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LAST_OWNER_CANNOT_LEAVE' }),
    });
    // R15-005: last-owner 체크는 $transaction 내부(row lock 하에서) 실행되어야 하며,
    // 실패 시 트랜잭션이 롤백되어 membership 업데이트는 발생하지 않는다.
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.v1TeamMembership.updateMany).not.toHaveBeenCalled();
  });

  it('leaveTeam: 다른 active owner가 있으면 owner도 나갈 수 있다', async () => {
    const ownerMembership = membershipRow({ id: 'mem-owner', role: 'owner', userId: owner.id, status: 'active' });
    prisma.v1Team.findFirst.mockResolvedValueOnce({
      ...teamRow(),
      memberships: [ownerMembership],
    });
    prisma.v1TeamMembership.count.mockResolvedValueOnce(1); // another active owner exists
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(null); // no chat room
    prisma.v1TeamMembership.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.v1TeamMembership.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'mem-owner',
      teamId: 'team-1',
      status: 'left',
    });
    prisma.v1Team.update.mockResolvedValueOnce({ memberCount: 4, managerCount: 1 });

    const result = await service.leaveTeam(owner, 'team-1', {});

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.v1TeamMembership.updateMany).toHaveBeenCalledWith({
      where: { id: 'mem-owner', teamId: 'team-1', status: 'active' },
      data: { status: 'left', leftAt: expect.any(Date) },
    });
    expect(result).toMatchObject({ membershipId: 'mem-owner', status: 'left', memberCount: 4 });
  });

  it('leaveTeam: 일반 멤버는 나가면 status=left + memberCount decrement + 채팅 참가자 정리', async () => {
    const memberMembership = membershipRow({
      id: 'mem-member',
      role: 'member',
      userId: member.id,
      status: 'active',
    });
    prisma.v1Team.findFirst.mockResolvedValueOnce({
      ...teamRow(),
      memberships: [memberMembership],
    });
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce({ id: 'room-1' });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValueOnce({ id: 'participant-1', status: 'active' });
    prisma.v1ChatRoomParticipant.update.mockResolvedValueOnce({ id: 'participant-1' });
    prisma.v1TeamMembership.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.v1TeamMembership.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'mem-member',
      teamId: 'team-1',
      status: 'left',
    });
    prisma.v1Team.update.mockResolvedValueOnce({ memberCount: 4, managerCount: 1 });

    const result = await service.leaveTeam(member, 'team-1', {});

    // owner-only 확인 경로(count/row lock)는 member에게는 호출되지 않는다
    expect(prisma.v1TeamMembership.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.v1Team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { memberCount: { decrement: 1 } },
    });
    expect(prisma.v1ChatRoomParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-1' },
      data: { status: 'left', leftAt: expect.any(Date) },
      select: { id: true },
    });
    expect(result).toMatchObject({ membershipId: 'mem-member', status: 'left', memberCount: 4 });
  });

  it('leaveTeam: manager가 나가면 tx 내부에서 재조회한 role로 managerCount를 decrement한다(바깥에서 읽은 stale role 무시)', async () => {
    // 바깥(tx 밖)에서 읽은 membership은 role='member'였지만, tx 내부 재조회(findUniqueOrThrow)는
    // role='manager'를 반환하도록 해 "바깥 role 대신 tx 내부 재조회 결과를 쓴다"를 직접 증명한다.
    const memberMembership = membershipRow({
      id: 'mem-manager',
      role: 'member',
      userId: member.id,
      status: 'active',
    });
    prisma.v1Team.findFirst.mockResolvedValueOnce({
      ...teamRow(),
      memberships: [memberMembership],
    });
    prisma.v1ChatRoom.findUnique.mockResolvedValueOnce(null);
    prisma.v1TeamMembership.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.v1TeamMembership.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'mem-manager',
      teamId: 'team-1',
      status: 'left',
      role: 'manager',
    });
    prisma.v1Team.update.mockResolvedValueOnce({ memberCount: 4, managerCount: 0 });

    await service.leaveTeam(member, 'team-1', {});

    expect(prisma.v1Team.update).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { memberCount: { decrement: 1 }, managerCount: { decrement: 1 } },
    });
  });

  it('leaveTeam: membership이 트랜잭션 중 이미 처리되면 409 CONCURRENT_UPDATE', async () => {
    const memberMembership = membershipRow({
      id: 'mem-member',
      role: 'member',
      userId: member.id,
      status: 'active',
    });
    prisma.v1Team.findFirst.mockResolvedValueOnce({
      ...teamRow(),
      memberships: [memberMembership],
    });
    // updateMany의 조건부 guard(where: status='active')가 0건을 매칭한 상황을 시뮬레이션
    // (동시 요청이 먼저 이 membership을 'left'로 바꿔버린 경우)
    prisma.v1TeamMembership.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.leaveTeam(member, 'team-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CONCURRENT_UPDATE' }),
    });
    expect(prisma.v1Team.update).not.toHaveBeenCalled();
  });

  it('leaveTeam: 팀에 소속되지 않은 사용자는 403', async () => {
    prisma.v1Team.findFirst.mockResolvedValueOnce({
      ...teamRow(),
      memberships: [],
    });

    await expect(
      service.leaveTeam(member, 'team-1', {}),
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

  it('changeMembershipRole: R15-004 — concurrent promotions bypass outer cap check → 409 MANAGER_LIMIT_EXCEEDED inside tx', async () => {
    // Outer check passes (managerCount=4), but by the time the transaction runs the
    // count is already at 5; the atomic updateMany returns count=0 → 409.
    const memberTarget = membershipRow({
      role: 'member',
      userId: 'target-user',
      status: 'active',
      team: teamRow({ managerCount: 4 }), // outer pre-check passes
    });
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(memberTarget)
      .mockResolvedValueOnce({ role: 'owner' });
    // Inside the transaction: conditional updateMany finds managerCount >= 5 → returns 0
    prisma.v1Team.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.changeMembershipRole(owner, 'mem-target', { role: 'manager' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MANAGER_LIMIT_EXCEEDED' }),
    });
    expect(prisma.v1TeamMembership.update).not.toHaveBeenCalled();
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

  // ─── changeMembershipRole: R15-003 — concurrent ownership delegation ──────

  it('changeMembershipRole: R15-003 — concurrent ownership delegation → 409 CONCURRENT_UPDATE', async () => {
    // Target is a manager; caller claims to be owner. But inside the transaction,
    // updateMany finds the caller is no longer owner (already demoted) → 409.
    const managerTarget = membershipRow({
      id: 'mem-target',
      role: 'manager',
      userId: 'target-user',
      status: 'active',
      teamId: 'team-1',
    });
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce(managerTarget) // getMembershipWithTeam
      .mockResolvedValueOnce({ role: 'owner' }) // getManagementActor
      .mockResolvedValueOnce({ id: 'owner-mem', userId: owner.id, teamId: 'team-1' }); // findFirst(currentOwner)
    // Inside the transaction: owner was already demoted concurrently
    prisma.v1TeamMembership.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.changeMembershipRole(owner, 'mem-target', { role: 'owner' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CONCURRENT_UPDATE' }),
    });
    expect(prisma.v1Team.update).not.toHaveBeenCalled();
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

  it('approveJoinApplication: full team cannot approve a requested application', async () => {
    const fullTeamApplication = applicationRow({
      status: 'requested',
      team: teamRow({
        joinPolicy: 'approval_required',
        status: 'active',
        memberCount: 5,
        profile: { memberGoalCount: 5 },
      }),
    });

    prisma.v1TeamJoinApplication.findFirst.mockResolvedValueOnce(fullTeamApplication);
    prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ id: 'manager-mem', role: 'manager' });

    await expect(
      service.approveJoinApplication(manager, 'app-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TEAM_FULL' }),
    });
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

  it('approveJoinApplication: requested 신청 승인 → 멤버십/팀 채팅 참가자를 upsert로 활성화', async () => {
    const application = applicationRow({
      status: 'requested',
      team: teamRow({ joinPolicy: 'approval_required', status: 'active', memberCount: 5 }),
    });
    const membership = membershipRow({
      id: 'new-member-mem',
      teamId: application.teamId,
      userId: application.applicantUserId,
      role: 'member',
      status: 'active',
    });

    prisma.v1TeamJoinApplication.findFirst.mockResolvedValueOnce(application);
    prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ id: 'manager-mem', role: 'manager' });
    prisma.v1TeamJoinApplication.update.mockResolvedValue({ ...application, status: 'approved' });
    prisma.v1TeamMembership.findUnique.mockResolvedValue(null);
    prisma.v1TeamMembership.upsert.mockResolvedValue(membership);
    prisma.v1Team.update.mockResolvedValue(teamRow({ memberCount: 6 }));
    prisma.v1ChatRoom.findUnique.mockResolvedValue(null);
    prisma.v1ChatRoom.upsert.mockResolvedValue({ id: 'team-room-1' });
    prisma.v1ChatRoomParticipant.findUnique.mockResolvedValue(null);
    prisma.v1ChatRoomParticipant.upsert.mockResolvedValue({ id: 'team-room-participant-1' });
    prisma.v1StatusChangeLog.create.mockResolvedValue({ id: 'chat-log-1' });
    prisma.v1StatusChangeLog.createMany.mockResolvedValue({ count: 2 });

    const result = await service.approveJoinApplication(manager, application.id, { note: '환영합니다.' });

    expect(result).toMatchObject({
      applicationId: application.id,
      status: 'approved',
      joinState: 'member',
      membershipId: 'new-member-mem',
      memberCount: 6,
    });
    expect(prisma.v1TeamMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId_userId: { teamId: application.teamId, userId: application.applicantUserId } },
      }),
    );
    expect(prisma.v1ChatRoom.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: application.teamId },
        create: { teamId: application.teamId, status: 'active' },
      }),
    );
    expect(prisma.v1ChatRoomParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chatRoomId_userId: { chatRoomId: 'team-room-1', userId: application.applicantUserId } },
      }),
    );
    expect(prisma.v1ChatRoomParticipant.updateMany).toHaveBeenCalledWith({
      where: { id: 'team-room-participant-1', status: 'active', visibleFromAt: null },
      data: { visibleFromAt: expect.any(Date) },
    });
    expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chatRoomId: 'team-room-1',
        senderUserId: application.applicantUserId,
        body: '새멤버님이 들어왔습니다',
        messageType: 'system',
        systemEventType: 'joined',
      }),
      select: { sentAt: true },
    });
    expect(notifications.emitNotification).toHaveBeenCalledWith(
      application.applicantUserId,
      'team_join_application_accepted',
      application.teamId,
      '"테스트팀" 팀 가입이 승인됐어요.',
    );
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

  it('createJoinApplication: full team cannot receive join applications', async () => {
    const fullTeam = {
      ...teamRow({ joinPolicy: 'approval_required', memberCount: 5 }),
      sport: { id: 's-1', name: 'sport' },
      region: null,
      profile: { memberGoalCount: 5 },
      memberships: [],
      joinApplications: [],
      trustScore: null,
      ownerUser: { id: owner.id, profile: null },
    };

    prisma.v1Team.findFirst.mockResolvedValueOnce(fullTeam);

    await expect(
      service.createJoinApplication(member, 'team-1', {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TEAM_FULL' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('createJoinApplication: notifies active owner and manager when an application is requested', async () => {
    const openTeam = {
      ...teamRow({ joinPolicy: 'approval_required', memberCount: 5 }),
      sport: { id: 's-1', name: 'sport' },
      region: null,
      profile: { memberGoalCount: 10 },
      memberships: [
        {
          id: 'owner-mem',
          userId: owner.id,
          teamId: 'team-1',
          role: 'owner',
          status: 'active',
          joinedAt: new Date('2026-01-01'),
          user: { profile: { nickname: 'owner', displayName: null, profileImageUrl: null } },
        },
      ],
      joinApplications: [],
      trustScore: null,
      ownerUser: { id: owner.id, profile: null },
    };
    const createdApplication = applicationRow({
      id: 'app-new',
      teamId: 'team-1',
      applicantUserId: member.id,
      status: 'requested',
    });

    prisma.v1Team.findFirst.mockResolvedValueOnce(openTeam);
    prisma.v1TeamJoinApplication.create.mockResolvedValueOnce(createdApplication);
    prisma.v1StatusChangeLog.create.mockResolvedValueOnce({ id: 'log-1' });

    const result = await service.createJoinApplication(member, 'team-1', {
      message: 'I want to join.',
    });

    expect(result).toMatchObject({
      applicationId: 'app-new',
      teamId: 'team-1',
      status: 'requested',
      joinState: 'requested',
    });
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function),
      'team_join_application_received',
      'team-1',
      '"테스트팀" 팀 가입 신청을 확인해 주세요.',
    );

    prisma.v1TeamMembership.findMany.mockResolvedValueOnce([
      { userId: owner.id },
      { userId: manager.id },
    ]);
    const resolveRecipients = notifications.emitToManyDeferred.mock.calls[0][0] as () => Promise<
      string[]
    >;
    await expect(resolveRecipients()).resolves.toEqual([owner.id, manager.id]);
    expect(prisma.v1TeamMembership.findMany).toHaveBeenCalledWith({
      where: { teamId: 'team-1', status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
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
    // R15-004: atomic cap check via updateMany (count < 5)
    prisma.v1Team.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.v1Team.findUniqueOrThrow.mockResolvedValueOnce({ id: 'team-1', managerCount: 2 });
    prisma.v1TeamMembership.update.mockResolvedValue({
      id: 'mem-1',
      teamId: 'team-1',
      role: 'manager',
    });

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

  // ════════════════════════════════════════════════════════════════════════════
  // 팀 멤버 초대 (createInvitation / acceptInvitation / declineInvitation / cancelInvitation)
  // ════════════════════════════════════════════════════════════════════════════

  // ─── createInvitation ───────────────────────────────────────────────────────

  describe('createInvitation', () => {
    /** 공통 성공 셋업: manager 권한 + 활성 팀 + 등록된 이메일 + 기존 초대 없음 */
    function setupCreateInvitationSuccess(callerRole: 'owner' | 'manager' = 'manager') {
      // assertManagerOrOwner → getManagementActor
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: callerRole });
      // v1Team.findFirst (팀 조회)
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        id: 'team-1',
        name: '테스트팀',
        status: 'active',
      });
      // v1User.findUnique (초대할 이메일 → 유저 조회)
      prisma.v1User.findUnique.mockResolvedValueOnce({ id: invitee.id });
      // v1TeamMembership.findUnique (기존 멤버 여부)
      prisma.v1TeamMembership.findUnique.mockResolvedValueOnce(null);
      // v1TeamInvitation.findUnique (기존 초대 여부)
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(null);
    }

    it('비멤버 이메일 초대 성공 → invitationId 반환 + alreadyInvited=false', async () => {
      setupCreateInvitationSuccess();
      prisma.v1TeamInvitation.create.mockResolvedValueOnce({
        id: 'inv-new',
        status: 'pending',
      });

      const result = await service.createInvitation(
        manager,
        'team-1',
        { invitedEmail: invitee.email },
      );

      expect(result.invitationId).toBe('inv-new');
      expect(result.status).toBe('pending');
      expect(result.alreadyInvited).toBe(false);
      expect(prisma.v1TeamInvitation.create).toHaveBeenCalledTimes(1);
    });

    it('존재하지 않는 이메일 초대 → 404 USER_NOT_FOUND', async () => {
      // assertManagerOrOwner → getManagementActor
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'owner' });
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        id: 'team-1', name: '팀', status: 'active',
      });
      // 이메일에 해당하는 유저 없음
      prisma.v1User.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createInvitation(owner, 'team-1', { invitedEmail: 'nobody@unknown.com' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
      });
      // 초대 레코드는 생성되지 않아야 함
      expect(prisma.v1TeamInvitation.create).not.toHaveBeenCalled();
    });

    it('이미 active 멤버 초대 → 409 ALREADY_MEMBER', async () => {
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'owner' });
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        id: 'team-1', name: '팀', status: 'active',
      });
      prisma.v1User.findUnique.mockResolvedValueOnce({ id: invitee.id });
      // 기존 active 멤버십 존재
      prisma.v1TeamMembership.findUnique.mockResolvedValueOnce({ status: 'active' });

      await expect(
        service.createInvitation(owner, 'team-1', { invitedEmail: invitee.email }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ALREADY_MEMBER' }),
      });
      expect(prisma.v1TeamInvitation.create).not.toHaveBeenCalled();
    });

    it('정원이 찬 팀은 초대를 보낼 수 없다 → 409 TEAM_FULL', async () => {
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'owner' });
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        id: 'team-1',
        name: '팀',
        status: 'active',
        memberCount: 5,
        profile: { memberGoalCount: 5 },
      });

      await expect(
        service.createInvitation(owner, 'team-1', { invitedEmail: invitee.email }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TEAM_FULL' }),
      });
      expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
      expect(prisma.v1TeamInvitation.create).not.toHaveBeenCalled();
    });

    it('manager 권한으로 초대 가능 (owner 가 아니어도 성공)', async () => {
      setupCreateInvitationSuccess('manager');
      prisma.v1TeamInvitation.create.mockResolvedValueOnce({
        id: 'inv-mgr',
        status: 'pending',
      });

      const result = await service.createInvitation(
        manager,
        'team-1',
        { invitedEmail: invitee.email },
      );

      expect(result.alreadyInvited).toBe(false);
      expect(result.invitationId).toBe('inv-mgr');
    });

    it('일반 멤버(member)는 초대할 수 없다 → 403 PERMISSION_DENIED', async () => {
      // getManagementActor → null (member 는 owner/manager 가 아님)
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createInvitation(
          { ...member, accountStatus: 'active', onboardingStatus: 'completed' },
          'team-1',
          { invitedEmail: invitee.email },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
      });
      expect(prisma.v1TeamInvitation.create).not.toHaveBeenCalled();
    });

    it('declined 였던 초대 재초대 시 pending 으로 reset (upsert 경로)', async () => {
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'owner' });
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        id: 'team-1', name: '팀', status: 'active',
      });
      prisma.v1User.findUnique.mockResolvedValueOnce({ id: invitee.id });
      // 기존 멤버 없음
      prisma.v1TeamMembership.findUnique.mockResolvedValueOnce(null);
      // 기존 초대: declined 상태
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce({
        id: 'inv-old',
        status: 'declined',
      });
      // update(reset) 경로
      prisma.v1TeamInvitation.update.mockResolvedValueOnce({
        id: 'inv-old',
        status: 'pending',
      });

      const result = await service.createInvitation(
        owner,
        'team-1',
        { invitedEmail: invitee.email },
      );

      // create 가 아니라 update 경로로 reset 됐어야 함
      expect(prisma.v1TeamInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
      );
      expect(prisma.v1TeamInvitation.create).not.toHaveBeenCalled();
      expect(result.status).toBe('pending');
      expect(result.alreadyInvited).toBe(false);
    });

    it('이미 pending 인 초대 재시도 → alreadyInvited=true (트랜잭션·생성 skip)', async () => {
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'owner' });
      prisma.v1Team.findFirst.mockResolvedValueOnce({
        id: 'team-1', name: '팀', status: 'active',
      });
      prisma.v1User.findUnique.mockResolvedValueOnce({ id: invitee.id });
      prisma.v1TeamMembership.findUnique.mockResolvedValueOnce(null);
      // 기존 초대: pending 상태
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce({
        id: 'inv-existing',
        status: 'pending',
      });

      const result = await service.createInvitation(
        owner,
        'team-1',
        { invitedEmail: invitee.email },
      );

      expect(result.alreadyInvited).toBe(true);
      expect(result.invitationId).toBe('inv-existing');
      // DB 변경 없어야 함
      expect(prisma.v1TeamInvitation.create).not.toHaveBeenCalled();
      expect(prisma.v1TeamInvitation.update).not.toHaveBeenCalled();
    });
  });

  // ─── acceptInvitation ───────────────────────────────────────────────────────

  describe('acceptInvitation', () => {
    function mockMissingChatParticipant() {
      prisma.v1ChatRoomParticipant.findUnique.mockResolvedValue(null);
    }

    it('full team cannot accept a pending invitation', async () => {
      const inv = invitationRow({
        invitedUserId: invitee.id,
        status: 'pending',
        team: { id: 'team-1', name: '테스트팀', status: 'active', memberCount: 5, profile: { memberGoalCount: 5 } },
      });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);

      await expect(service.acceptInvitation(invitee, 'inv-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TEAM_FULL' }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('초대받은 본인이 수락 → membership active + memberCount increment', async () => {
      const inv = invitationRow({ invitedUserId: invitee.id, status: 'pending' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);

      // 트랜잭션 내부
      // R15-002: updateMany with conditional status check
      prisma.v1TeamInvitation.updateMany.mockResolvedValueOnce({ count: 1 });
      // findUniqueOrThrow returns the accepted invitation
      prisma.v1TeamInvitation.findUniqueOrThrow.mockResolvedValueOnce({ id: 'inv-1', status: 'accepted' });
      // v1TeamMembership.findUnique (wasActive 체크) → 기존 멤버십 없음
      prisma.v1TeamMembership.findUnique.mockResolvedValueOnce(null);
      // upsert → 새 멤버십 생성
      prisma.v1TeamMembership.upsert.mockResolvedValueOnce({
        id: 'mem-new',
        teamId: 'team-1',
        userId: invitee.id,
        role: 'member',
        status: 'active',
        joinedAt: new Date(),
      });
      // memberCount increment
      prisma.v1Team.update.mockResolvedValueOnce({ id: 'team-1', memberCount: 6 });
      prisma.v1StatusChangeLog.createMany.mockResolvedValue({ count: 1 });
      mockMissingChatParticipant();

      const result = await service.acceptInvitation(invitee, 'inv-1');

      expect(result.status).toBe('accepted');
      expect(result.alreadyProcessed).toBe(false);
      expect(result.membershipId).toBe('mem-new');
      // memberCount increment 가 호출됐어야 함
      expect(prisma.v1Team.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ memberCount: { increment: 1 } }),
        }),
      );
      expect(prisma.v1ChatRoomParticipant.updateMany).toHaveBeenCalledWith({
        where: { id: 'participant-1', status: 'active', visibleFromAt: null },
        data: { visibleFromAt: expect.any(Date) },
      });
      expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          chatRoomId: 'room-1',
          senderUserId: invitee.id,
          body: '새멤버님이 들어왔습니다',
          messageType: 'system',
          systemEventType: 'joined',
        }),
        select: { sentAt: true },
      });
    });

    it('본인 아닌 유저가 수락 시도 → 403 PERMISSION_DENIED', async () => {
      // 초대: invitedUserId = invitee, 하지만 호출자 = member (다른 유저)
      const inv = invitationRow({ invitedUserId: invitee.id, status: 'pending' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);

      await expect(
        service.acceptInvitation(member, 'inv-1'), // member.id ≠ invitee.id
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('이미 accepted → alreadyProcessed=true (트랜잭션 skip)', async () => {
      const inv = invitationRow({ invitedUserId: invitee.id, status: 'accepted' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);
      // idempotency: 기존 멤버십 조회
      prisma.v1TeamMembership.findUnique.mockResolvedValueOnce({ id: 'mem-existing' });

      const result = await service.acceptInvitation(invitee, 'inv-1');

      expect(result.alreadyProcessed).toBe(true);
      expect(result.status).toBe('accepted');
      expect(result.membershipId).toBe('mem-existing');
      // 트랜잭션이 실행되지 않아야 함
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('이미 active 멤버였으면 memberCount increment 안 함 (wasActive 분기)', async () => {
      const inv = invitationRow({ invitedUserId: invitee.id, status: 'pending' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);

      prisma.v1TeamInvitation.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.v1TeamInvitation.findUniqueOrThrow.mockResolvedValueOnce({ id: 'inv-1', status: 'accepted' });
      // wasActive = true: 기존 active 멤버십 존재
      prisma.v1TeamMembership.findUnique.mockResolvedValueOnce({
        id: 'mem-already',
        status: 'active',
        joinedAt: new Date('2026-01-01'),
      });
      prisma.v1TeamMembership.upsert.mockResolvedValueOnce({
        id: 'mem-already',
        teamId: 'team-1',
        userId: invitee.id,
        role: 'member',
        status: 'active',
        joinedAt: new Date('2026-01-01'),
      });
      prisma.v1StatusChangeLog.createMany.mockResolvedValue({ count: 1 });
      mockMissingChatParticipant();

      const result = await service.acceptInvitation(invitee, 'inv-1');

      expect(result.alreadyProcessed).toBe(false);
      // wasActive=true → v1Team.update(memberCount increment) 가 호출되지 않아야 함
      expect(prisma.v1Team.update).not.toHaveBeenCalled();
      expect(prisma.v1ChatRoomParticipant.updateMany).toHaveBeenCalled();
      expect(prisma.v1ChatMessage.create).not.toHaveBeenCalled();
    });

    it('R15-002: invitation cancelled between outer read and transaction → 409 STATE_CONFLICT', async () => {
      // Outer read sees pending invitation; inside the transaction updateMany matches 0
      // rows (another actor cancelled it), so acceptance is rejected.
      const inv = invitationRow({ invitedUserId: invitee.id, status: 'pending' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);
      prisma.v1TeamInvitation.updateMany.mockResolvedValueOnce({ count: 0 }); // concurrent cancel

      await expect(service.acceptInvitation(invitee, 'inv-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STATE_CONFLICT' }),
      });
      expect(prisma.v1TeamMembership.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── declineInvitation ──────────────────────────────────────────────────────

  describe('declineInvitation', () => {
    it('본인이 거절 → status=declined + alreadyProcessed=false', async () => {
      const inv = invitationRow({ invitedUserId: invitee.id, status: 'pending' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);
      prisma.v1TeamInvitation.update.mockResolvedValueOnce({ id: 'inv-1', status: 'declined' });

      const result = await service.declineInvitation(invitee, 'inv-1');

      expect(result.status).toBe('declined');
      expect(result.alreadyProcessed).toBe(false);
      expect(prisma.v1TeamInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'declined' }),
        }),
      );
    });

    it('본인 아닌 유저가 거절 시도 → 403 PERMISSION_DENIED', async () => {
      const inv = invitationRow({ invitedUserId: invitee.id, status: 'pending' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);

      await expect(
        service.declineInvitation(member, 'inv-1'), // member.id ≠ invitee.id
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
      });
      expect(prisma.v1TeamInvitation.update).not.toHaveBeenCalled();
    });

    it('이미 declined → alreadyProcessed=true (update skip)', async () => {
      const inv = invitationRow({ invitedUserId: invitee.id, status: 'declined' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce(inv);

      const result = await service.declineInvitation(invitee, 'inv-1');

      expect(result.alreadyProcessed).toBe(true);
      expect(result.status).toBe('declined');
      expect(prisma.v1TeamInvitation.update).not.toHaveBeenCalled();
    });
  });

  // ─── cancelInvitation ───────────────────────────────────────────────────────

  describe('cancelInvitation', () => {
    it('manager/owner 가 pending 초대 취소 → status=cancelled + alreadyCancelled=false', async () => {
      // assertManagerOrOwner
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'manager' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce({
        id: 'inv-1',
        teamId: 'team-1',
        status: 'pending',
      });
      prisma.v1TeamInvitation.update.mockResolvedValueOnce({ id: 'inv-1', status: 'cancelled' });

      const result = await service.cancelInvitation(manager, 'team-1', 'inv-1');

      expect(result.status).toBe('cancelled');
      expect(result.alreadyCancelled).toBe(false);
      expect(prisma.v1TeamInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'cancelled' },
        }),
      );
    });

    it('이미 cancelled 인 초대 취소 → alreadyCancelled=true (update skip)', async () => {
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'owner' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce({
        id: 'inv-1',
        teamId: 'team-1',
        status: 'cancelled',
      });

      const result = await service.cancelInvitation(owner, 'team-1', 'inv-1');

      expect(result.alreadyCancelled).toBe(true);
      expect(result.status).toBe('cancelled');
      expect(prisma.v1TeamInvitation.update).not.toHaveBeenCalled();
    });

    it('일반 멤버는 초대 취소 불가 → 403 PERMISSION_DENIED', async () => {
      // getManagementActor → null (member 권한 없음)
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.cancelInvitation(member, 'team-1', 'inv-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
      });
      expect(prisma.v1TeamInvitation.update).not.toHaveBeenCalled();
    });

    it('accepted 된 초대는 취소 불가 → 409 STATE_CONFLICT', async () => {
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'owner' });
      prisma.v1TeamInvitation.findUnique.mockResolvedValueOnce({
        id: 'inv-1',
        teamId: 'team-1',
        status: 'accepted',
      });

      await expect(
        service.cancelInvitation(owner, 'team-1', 'inv-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STATE_CONFLICT' }),
      });
      expect(prisma.v1TeamInvitation.update).not.toHaveBeenCalled();
    });
  });

  describe('listInvitations', () => {
    it('manager/owner 가 pending 초대 목록 조회 → invitedUser displayName fallback 포함', async () => {
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ role: 'manager' }); // assertManagerOrOwner
      prisma.v1TeamInvitation.findMany.mockResolvedValueOnce([
        {
          id: 'inv-1',
          teamId: 'team-1',
          invitedUserId: invitee.id,
          status: 'pending',
          message: '같이 해요',
          createdAt: new Date('2026-06-01'),
          invitedUser: { id: invitee.id, profile: { nickname: 'nick', displayName: null, profileImageUrl: null } },
        },
      ]);

      const result = await service.listInvitations(manager, 'team-1');

      expect(result.teamId).toBe('team-1');
      expect(result.items).toHaveLength(1);
      // displayName null → nickname fallback
      expect(result.items[0]).toMatchObject({
        invitationId: 'inv-1',
        invitedUserId: invitee.id,
        status: 'pending',
        invitedUser: { userId: invitee.id, displayName: 'nick' },
      });
    });

    it('일반 멤버는 초대 목록 조회 불가 → 403 PERMISSION_DENIED', async () => {
      prisma.v1TeamMembership.findFirst.mockResolvedValueOnce(null); // getManagementActor → null
      await expect(
        service.listInvitations(member, 'team-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
      });
      expect(prisma.v1TeamInvitation.findMany).not.toHaveBeenCalled();
    });
  });

  describe('myInvitations', () => {
    it('받은 pending 초대 목록 → team/invitedBy 투영 + introductionPreview 120자 컷', async () => {
      const longIntro = 'a'.repeat(200);
      prisma.v1TeamInvitation.findMany.mockResolvedValueOnce([
        {
          id: 'inv-1',
          teamId: 'team-1',
          status: 'pending',
          message: null,
          createdAt: new Date('2026-06-01'),
          team: { id: 'team-1', name: '테스트팀', sportId: 'sport-1', status: 'active', profile: { logoUrl: null, description: longIntro } },
          invitedByUser: { id: manager.id, profile: { nickname: '매니저', displayName: null, profileImageUrl: null } },
        },
      ]);

      const result = await service.myInvitations(invitee);

      // 본인이 받은 pending 초대만 조회
      expect(prisma.v1TeamInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { invitedUserId: invitee.id, status: 'pending' } }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].team).toMatchObject({ teamId: 'team-1', name: '테스트팀', sportId: 'sport-1' });
      expect(result.items[0].team.introductionPreview).toHaveLength(120); // 200자 → 120 컷
      expect(result.items[0].invitedBy.displayName).toBe('매니저'); // displayName null → nickname fallback
    });
  });

  describe('invitation account guard', () => {
    it('acceptInvitation: 비활성(suspended) 계정은 초대 수락 불가 → 403 (조회 전 차단)', async () => {
      await expect(
        service.acceptInvitation(suspended, 'inv-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
      });
      expect(prisma.v1TeamInvitation.findUnique).not.toHaveBeenCalled();
    });

    it('declineInvitation: 비활성(suspended) 계정은 초대 거절 불가 → 403 (조회 전 차단)', async () => {
      await expect(
        service.declineInvitation(suspended, 'inv-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
      });
      expect(prisma.v1TeamInvitation.findUnique).not.toHaveBeenCalled();
    });
  });
});
