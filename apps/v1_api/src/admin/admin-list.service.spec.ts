/**
 * admin-list.service.spec.ts
 *
 * Contract tests for the new read endpoints (listUsers, getUser, listMatches,
 * getMatch, listTeams, getTeam, listTeamMatches). Each test exercises:
 *   (a) non-admin → ForbiddenException (403 code)
 *   (b) active admin → correct shape + pageInfo
 *   (c) status filter narrows the Prisma `where` arg
 *   (d) q search passes correct Prisma `where` OR conditions
 *   (e) cursor pagination: hasNext=true when rows > limit, nextCursor is last item id
 *   (f) NOT_FOUND 404 on detail when row missing
 *
 * No mocks are asserted for their own sake — every assertion validates
 * observable behaviour of the service (returned data shape or thrown error).
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const adminAuthUser = {
  id: 'admin-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const nonAdminAuthUser = {
  id: 'regular-user-id',
  email: 'regular@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const activeAdminRecord = {
  id: 'admin-record-id',
  userId: 'admin-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
};

// A minimal seeded V1User row shape that Prisma returns for list queries
function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'host@teameet.v1',
    accountStatus: 'active',
    onboardingStatus: 'completed',
    lastLoginAt: null,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    deletedAt: null,
    profile: { nickname: '호스트민', displayName: '호스트민', realName: '호스트민', gender: 'male' },
    authIdentities: [{ provider: 'kakao' }],
    adminUser: null,
    teamMemberships: [{ role: 'owner' }, { role: 'member' }],
    _count: { hostedMatches: 3, ownedTeams: 1, teamMemberships: 2 },
    ...overrides,
  };
}

function makeMatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    title: '강남 저녁 러닝',
    placeName: '강남역',
    startAt: new Date('2026-06-20T10:00:00.000Z'),
    status: 'recruiting',
    maxParticipants: 6,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    hostUserId: 'u-1',
    sport: { name: '러닝', code: 'running' },
    hostUser: { profile: { nickname: '호스트민' } },
    _count: { participants: 1 },
    ...overrides,
  };
}

function makeTeamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    name: '강남 러닝 크루',
    status: 'active',
    memberCount: 3,
    managerCount: 1,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    ownerUserId: 'u-1',
    sport: { name: '러닝' },
    ownerUser: { profile: { nickname: '팀장원' } },
    ...overrides,
  };
}

function makeTeamMatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tm-1',
    title: '토요일 풋살 상대팀 모집',
    startAt: new Date('2026-05-23T05:00:00.000Z'),
    status: 'recruiting',
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    hostTeamId: 't-1',
    hostTeam: { name: '강남 러닝 크루' },
    sport: { name: '풋살' },
    ...overrides,
  };
}

function makeInquiryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inq-1',
    category: 'account',
    title: '로그인 문의',
    status: 'received',
    relatedType: null,
    relatedId: null,
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    closedAt: null,
    userId: 'u-1',
    user: { email: 'user@teameet.v1', profile: { nickname: '문의자', displayName: '문의자' } },
    _count: { replies: 0 },
    ...overrides,
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('AdminService — list/detail endpoints', () => {
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1User: { findMany: jest.Mock; findUnique: jest.Mock; groupBy: jest.Mock };
    v1Match: { findMany: jest.Mock; findUnique: jest.Mock; groupBy: jest.Mock };
    v1Team: { findMany: jest.Mock; findUnique: jest.Mock; groupBy: jest.Mock };
    v1TeamMatch: { findMany: jest.Mock; findUnique: jest.Mock; groupBy: jest.Mock };
    v1Inquiry: { findMany: jest.Mock; groupBy: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1User: { findMany: jest.fn(), findUnique: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      v1Match: { findMany: jest.fn(), findUnique: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      v1Team: { findMany: jest.fn(), findUnique: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      v1TeamMatch: { findMany: jest.fn(), findUnique: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      v1Inquiry: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Shared auth guard behaviour ─────────────────────────────────────────

  describe('auth guard (ForbiddenException for non-admins)', () => {
    beforeEach(() => {
      // non-admin: no v1AdminUser row found
      prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    });

    it('listUsers throws 403 for non-admin', async () => {
      await expect(service.listUsers(nonAdminAuthUser, {})).rejects.toThrow(ForbiddenException);
    });

    it('getUser throws 403 for non-admin', async () => {
      await expect(service.getUser(nonAdminAuthUser, 'u-1')).rejects.toThrow(ForbiddenException);
    });

    it('listMatches throws 403 for non-admin', async () => {
      await expect(service.listMatches(nonAdminAuthUser, {})).rejects.toThrow(ForbiddenException);
    });

    it('getMatch throws 403 for non-admin', async () => {
      await expect(service.getMatch(nonAdminAuthUser, 'm-1')).rejects.toThrow(ForbiddenException);
    });

    it('listTeams throws 403 for non-admin', async () => {
      await expect(service.listTeams(nonAdminAuthUser, {})).rejects.toThrow(ForbiddenException);
    });

    it('getTeam throws 403 for non-admin', async () => {
      await expect(service.getTeam(nonAdminAuthUser, 't-1')).rejects.toThrow(ForbiddenException);
    });

    it('listTeamMatches throws 403 for non-admin', async () => {
      await expect(service.listTeamMatches(nonAdminAuthUser, {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── listUsers ────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    beforeEach(() => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    });

    it('returns items and pageInfo with correct shape for active admin', async () => {
      const row = makeUserRow();
      prisma.v1User.findMany.mockResolvedValue([row]);
      prisma.v1User.groupBy.mockResolvedValue([
        { accountStatus: 'active', _count: { _all: 21 } },
        { accountStatus: 'suspended', _count: { _all: 2 } },
      ]);

      const result = await service.listUsers(adminAuthUser, {});

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item).toMatchObject({
        userId: 'u-1',
        nickname: '호스트민',
        displayName: '호스트민',
        email: 'host@teameet.v1',
        authProviders: ['kakao'],
        accountStatus: 'active',
        onboardingStatus: 'completed',
        gender: 'male',
        hostedMatchCount: 3,
        ownedTeamCount: 1,
        membershipCount: 2,
        teamRoleCounts: { owner: 1, manager: 0, member: 1 },
        adminRole: null,
      });
      expect(result.pageInfo).toEqual({ nextCursor: null, hasNext: false });
      expect(result.summary).toEqual({
        total: 23,
        byStatus: { active: 21, suspended: 2, blocked: 0, withdrawal_pending: 0, deleted: 0 },
      });
    });

    it('passes status filter to Prisma where clause', async () => {
      prisma.v1User.findMany.mockResolvedValue([]);
      await service.listUsers(adminAuthUser, { status: 'suspended' });

      const call = prisma.v1User.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toMatchObject({ accountStatus: 'suspended' });
    });

    it('passes q search as OR on nickname/realName/displayName/email', async () => {
      prisma.v1User.findMany.mockResolvedValue([]);
      await service.listUsers(adminAuthUser, { q: '호스트' });

      const call = prisma.v1User.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      const where = call.where as { OR?: unknown[] };
      expect(Array.isArray(where.OR)).toBe(true);
      expect(where.OR).toHaveLength(4);
    });

    it('returns hasNext=true and nextCursor when rows exceed limit', async () => {
      // limit default=20; return 21 rows to trigger next page
      const rows = Array.from({ length: 21 }, (_, i) => makeUserRow({ id: `u-${i + 1}` }));
      prisma.v1User.findMany.mockResolvedValue(rows);

      const result = await service.listUsers(adminAuthUser, { limit: 20 });

      expect(result.pageInfo.hasNext).toBe(true);
      expect(result.pageInfo.nextCursor).toBe('u-20');
      expect(result.items).toHaveLength(20);
    });

    it('passes cursor to Prisma when provided', async () => {
      prisma.v1User.findMany.mockResolvedValue([]);
      await service.listUsers(adminAuthUser, { cursor: 'some-cursor-id' });

      const call = prisma.v1User.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(call).toMatchObject({ cursor: { id: 'some-cursor-id' }, skip: 1 });
    });
  });

  // ─── getUser ─────────────────────────────────────────────────────────────

  describe('getUser', () => {
    beforeEach(() => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    });

    it('throws 404 with code NOT_FOUND when user missing', async () => {
      prisma.v1User.findUnique.mockResolvedValue(null);
      await expect(service.getUser(adminAuthUser, 'missing-id')).rejects.toThrow(NotFoundException);
      await expect(service.getUser(adminAuthUser, 'missing-id')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });

    it('returns full detail shape including optional reputationSummary', async () => {
      prisma.v1User.findUnique.mockResolvedValue({
        ...makeUserRow(),
        reputationSummary: {
          trustState: 'estimated',
          mannerScore: 4.5,
          reviewCount: 2,
          calculatedAt: new Date('2026-05-18T00:00:00.000Z'),
        },
        hostedMatches: [{ id: 'm-1', title: '강남 러닝', status: 'recruiting', startAt: new Date() }],
        ownedTeams: [{ id: 't-1', name: '강남 크루', status: 'active', memberCount: 3 }],
        teamMemberships: [
          {
            id: 'tm-1',
            role: 'owner',
            status: 'active',
            joinedAt: new Date('2026-05-18T00:00:00.000Z'),
            team: { id: 't-1', name: '강남 크루', status: 'active', memberCount: 3 },
          },
          {
            id: 'tm-2',
            role: 'member',
            status: 'active',
            joinedAt: new Date('2026-05-19T00:00:00.000Z'),
            team: { id: 't-2', name: '서초 풋살', status: 'active', memberCount: 8 },
          },
        ],
        statusLogs: [
          {
            reason: '잠시 쉬고 싶어요',
            createdAt: new Date('2026-05-20T00:00:00.000Z'),
          },
        ],
      });

      const result = await service.getUser(adminAuthUser, 'u-1');

      expect(result.gender).toBe('male');
      expect(result.authProviders).toEqual(['kakao']);
      expect(result.reputationSummary).not.toBeNull();
      expect(result.reputationSummary?.trustState).toBe('estimated');
      expect(result.hostedMatches).toHaveLength(1);
      expect(result.hostedMatches[0]).toMatchObject({ matchId: 'm-1', title: '강남 러닝' });
      expect(result.ownedTeams).toHaveLength(1);
      expect(result.ownedTeams[0]).toMatchObject({ teamId: 't-1', name: '강남 크루' });
      expect(result.teamRoleCounts).toEqual({ owner: 1, manager: 0, member: 1 });
      expect(result.teamMemberships).toHaveLength(2);
      expect(result.withdrawalRequest).toMatchObject({ reason: '잠시 쉬고 싶어요' });
    });

    it('returns null gender for a legacy member without a saved gender', async () => {
      prisma.v1User.findUnique.mockResolvedValue({
        ...makeUserRow({ profile: { nickname: '레거시 회원', displayName: '레거시 회원', gender: null } }),
        reputationSummary: null,
        hostedMatches: [],
        ownedTeams: [],
        teamMemberships: [],
        statusLogs: [],
      });

      const result = await service.getUser(adminAuthUser, 'u-1');

      expect(result.gender).toBeNull();
    });

    it('returns reputationSummary=null when absent', async () => {
      prisma.v1User.findUnique.mockResolvedValue({
        ...makeUserRow(),
        reputationSummary: null,
        hostedMatches: [],
        ownedTeams: [],
        teamMemberships: [],
        statusLogs: [],
      });

      const result = await service.getUser(adminAuthUser, 'u-1');
      expect(result.reputationSummary).toBeNull();
    });
  });

  // ─── listMatches ─────────────────────────────────────────────────────────

  describe('listMatches', () => {
    beforeEach(() => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    });

    it('returns items with correct shape', async () => {
      prisma.v1Match.findMany.mockResolvedValue([makeMatchRow()]);
      prisma.v1Match.groupBy.mockResolvedValue([
        { status: 'recruiting', _count: { _all: 8 } },
        { status: 'completed', _count: { _all: 4 } },
      ]);

      const result = await service.listMatches(adminAuthUser, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        matchId: 'm-1',
        title: '강남 저녁 러닝',
        sportName: '러닝',
        sportCode: 'running',
        hostUserId: 'u-1',
        hostName: '호스트민',
        placeName: '강남역',
        status: 'recruiting',
        participantCount: 1,
        maxParticipants: 6,
      });
      expect(result.pageInfo).toEqual({ nextCursor: null, hasNext: false });
      expect(result.summary).toEqual({
        total: 12,
        byStatus: { recruiting: 8, closed: 0, cancelled: 0, completed: 4, archived: 0 },
      });
    });

    it('passes status filter to where', async () => {
      prisma.v1Match.findMany.mockResolvedValue([]);
      await service.listMatches(adminAuthUser, { status: 'cancelled' });

      const call = prisma.v1Match.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toMatchObject({ status: 'cancelled' });
    });

    it('passes sportId filter to where', async () => {
      prisma.v1Match.findMany.mockResolvedValue([]);
      await service.listMatches(adminAuthUser, { sportId: 'sport-uuid' });

      const call = prisma.v1Match.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toMatchObject({ sportId: 'sport-uuid' });
    });

    it('passes q search as OR on title/placeName', async () => {
      prisma.v1Match.findMany.mockResolvedValue([]);
      await service.listMatches(adminAuthUser, { q: '강남' });

      const call = prisma.v1Match.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      const where = call.where as { OR?: unknown[] };
      expect(Array.isArray(where.OR)).toBe(true);
      expect(where.OR).toHaveLength(2);
    });

    it('returns hasNext=true and nextCursor when rows exceed limit', async () => {
      const rows = Array.from({ length: 11 }, (_, i) => makeMatchRow({ id: `m-${i + 1}` }));
      prisma.v1Match.findMany.mockResolvedValue(rows);

      const result = await service.listMatches(adminAuthUser, { limit: 10 });

      expect(result.pageInfo.hasNext).toBe(true);
      expect(result.pageInfo.nextCursor).toBe('m-10');
      expect(result.items).toHaveLength(10);
    });
  });

  // ─── getMatch ─────────────────────────────────────────────────────────────

  describe('getMatch', () => {
    beforeEach(() => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    });

    it('throws 404 with code NOT_FOUND when match missing', async () => {
      prisma.v1Match.findUnique.mockResolvedValue(null);
      await expect(service.getMatch(adminAuthUser, 'missing')).rejects.toThrow(NotFoundException);
      await expect(service.getMatch(adminAuthUser, 'missing')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });

    it('returns full detail shape', async () => {
      prisma.v1Match.findUnique.mockResolvedValue({
        ...makeMatchRow(),
        description: '가볍게 5km',
        deadlineAt: null,
        region: { name: '강남구' },
        _count: { participants: 1, applications: 2 },
      });

      const result = await service.getMatch(adminAuthUser, 'm-1');

      expect(result).toMatchObject({
        matchId: 'm-1',
        description: '가볍게 5km',
        regionName: '강남구',
        applicationCount: 2,
        participantCount: 1,
      });
    });
  });

  // ─── listTeams ───────────────────────────────────────────────────────────

  describe('listTeams', () => {
    beforeEach(() => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    });

    it('returns items with correct shape', async () => {
      prisma.v1Team.findMany.mockResolvedValue([makeTeamRow()]);
      prisma.v1Team.groupBy.mockResolvedValue([
        { status: 'active', _count: { _all: 7 } },
        { status: 'archived', _count: { _all: 1 } },
      ]);

      const result = await service.listTeams(adminAuthUser, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        teamId: 't-1',
        name: '강남 러닝 크루',
        sportName: '러닝',
        ownerUserId: 'u-1',
        ownerName: '팀장원',
        memberCount: 3,
        managerCount: 1,
        status: 'active',
      });
      expect(result.summary).toEqual({
        total: 8,
        byStatus: { active: 7, suspended: 0, archived: 1 },
      });
    });

    it('passes status filter to where', async () => {
      prisma.v1Team.findMany.mockResolvedValue([]);
      await service.listTeams(adminAuthUser, { status: 'suspended' });

      const call = prisma.v1Team.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toMatchObject({ status: 'suspended' });
    });

    it('passes q search as name contains', async () => {
      prisma.v1Team.findMany.mockResolvedValue([]);
      await service.listTeams(adminAuthUser, { q: '러닝' });

      const call = prisma.v1Team.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toMatchObject({ name: { contains: '러닝' } });
    });

    it('pagination: second page differs from first when nextCursor used', async () => {
      // Simulate page 1: 3 rows when limit=2 → hasNext=true, cursor=t-2
      const page1Rows = [makeTeamRow({ id: 't-1' }), makeTeamRow({ id: 't-2' }), makeTeamRow({ id: 't-3' })];
      prisma.v1Team.findMany.mockResolvedValueOnce(page1Rows);

      const page1 = await service.listTeams(adminAuthUser, { limit: 2 });
      expect(page1.pageInfo.hasNext).toBe(true);
      expect(page1.pageInfo.nextCursor).toBe('t-2');

      // Simulate page 2: 1 row (beyond cursor)
      const page2Rows = [makeTeamRow({ id: 't-3' })];
      prisma.v1Team.findMany.mockResolvedValueOnce(page2Rows);

      const page2 = await service.listTeams(adminAuthUser, { limit: 2, cursor: 't-2' });
      expect(page2.pageInfo.hasNext).toBe(false);
      expect(page2.items[0].teamId).toBe('t-3');

      // page 1 ids and page 2 ids must differ
      const p1Ids = page1.items.map((i) => i.teamId);
      const p2Ids = page2.items.map((i) => i.teamId);
      expect(p1Ids).not.toEqual(p2Ids);
    });
  });

  // ─── getTeam ─────────────────────────────────────────────────────────────

  describe('getTeam', () => {
    beforeEach(() => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    });

    it('throws 404 with code NOT_FOUND when team missing', async () => {
      prisma.v1Team.findUnique.mockResolvedValue(null);
      await expect(service.getTeam(adminAuthUser, 'missing')).rejects.toThrow(NotFoundException);
      await expect(service.getTeam(adminAuthUser, 'missing')).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });

    it('returns trustScore and recentHostedTeamMatches in detail', async () => {
      prisma.v1Team.findUnique.mockResolvedValue({
        ...makeTeamRow(),
        region: { name: '강남구' },
        trustScore: {
          trustState: 'sample',
          mannerScore: 4.6,
          matchCount: 8,
          calculatedAt: new Date('2026-05-18T00:00:00.000Z'),
        },
        hostedTeamMatches: [
          { id: 'tm-1', title: '토요일 풋살', status: 'recruiting', startAt: new Date('2026-05-23T05:00:00.000Z') },
        ],
      });

      const result = await service.getTeam(adminAuthUser, 't-1');

      expect(result.regionName).toBe('강남구');
      expect(result.trustScore).not.toBeNull();
      expect(result.trustScore?.matchCount).toBe(8);
      expect(result.recentHostedTeamMatches).toHaveLength(1);
      expect(result.recentHostedTeamMatches[0]).toMatchObject({ teamMatchId: 'tm-1' });
    });

    it('returns trustScore=null when absent', async () => {
      prisma.v1Team.findUnique.mockResolvedValue({
        ...makeTeamRow(),
        region: { name: '강남구' },
        trustScore: null,
        hostedTeamMatches: [],
      });

      const result = await service.getTeam(adminAuthUser, 't-1');
      expect(result.trustScore).toBeNull();
    });
  });

  // ─── listTeamMatches ─────────────────────────────────────────────────────

  describe('listTeamMatches', () => {
    beforeEach(() => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
    });

    it('returns items with correct shape', async () => {
      prisma.v1TeamMatch.findMany.mockResolvedValue([makeTeamMatchRow()]);
      prisma.v1TeamMatch.groupBy.mockResolvedValue([
        { status: 'recruiting', _count: { _all: 5 } },
        { status: 'matched', _count: { _all: 3 } },
      ]);

      const result = await service.listTeamMatches(adminAuthUser, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        teamMatchId: 'tm-1',
        title: '토요일 풋살 상대팀 모집',
        hostTeamId: 't-1',
        hostTeamName: '강남 러닝 크루',
        sportName: '풋살',
        status: 'recruiting',
      });
      expect(result.summary).toEqual({
        total: 8,
        byStatus: { recruiting: 5, closed: 0, matched: 3, cancelled: 0, completed: 0, archived: 0 },
      });
    });

    it('passes status filter to where', async () => {
      prisma.v1TeamMatch.findMany.mockResolvedValue([]);
      await service.listTeamMatches(adminAuthUser, { status: 'matched' });

      const call = prisma.v1TeamMatch.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toMatchObject({ status: 'matched' });
    });

    it('returns hasNext=true and nextCursor when rows exceed limit', async () => {
      const rows = Array.from({ length: 6 }, (_, i) => makeTeamMatchRow({ id: `tm-${i + 1}` }));
      prisma.v1TeamMatch.findMany.mockResolvedValue(rows);

      const result = await service.listTeamMatches(adminAuthUser, { limit: 5 });

      expect(result.pageInfo.hasNext).toBe(true);
      expect(result.pageInfo.nextCursor).toBe('tm-5');
      expect(result.items).toHaveLength(5);
    });
  });

  describe('listInquiries', () => {
    it('returns status and category facets without cursor truncation', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
      prisma.v1Inquiry.findMany.mockResolvedValue([makeInquiryRow()]);
      prisma.v1Inquiry.groupBy
        .mockResolvedValueOnce([
          { status: 'received', _count: { _all: 9 } },
          { status: 'answered', _count: { _all: 4 } },
        ])
        .mockResolvedValueOnce([
          { category: 'account', _count: { _all: 3 } },
          { category: 'report', _count: { _all: 2 } },
        ]);

      const result = await service.listInquiries(adminAuthUser, { q: '로그인' });

      expect(result.items[0]).toMatchObject({ inquiryId: 'inq-1', status: 'received', category: 'account' });
      expect(result.summary).toEqual({
        total: 13,
        byStatus: { received: 9, reviewing: 0, answered: 4, closed: 0 },
        byCategory: {
          account: 3,
          match: 0,
          team: 0,
          tournament: 0,
          payment_refund: 0,
          report: 2,
          other: 0,
        },
      });
    });
  });
});
