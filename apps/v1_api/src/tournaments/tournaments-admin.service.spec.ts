/**
 * tournaments-admin.service.spec.ts
 *
 * Contract tests for V1Tournament admin CRUD: admin-role gates, status-transition
 * rules, player-range / sport validation, and idempotent same-status change.
 * Each test asserts observable behaviour (returned shape or thrown error),
 * never a mock for its own sake.
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { TournamentsAdminService } from './tournaments-admin.service';

const ownerAuthUser = { id: 'owner-user-id', email: 'admin@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const supportAuthUser = { id: 'support-user-id', email: 'support@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const nonAdminAuthUser = { id: 'plain-user-id', email: 'user@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

const ownerAdminRecord = { id: 'owner-admin-id', userId: 'owner-user-id', adminRole: 'owner' as const, status: 'active' as const };
const supportAdminRecord = { id: 'support-admin-id', userId: 'support-user-id', adminRole: 'support' as const, status: 'active' as const };

function tournamentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    sportId: 'sport-1',
    title: '테스트 대회',
    status: 'draft',
    registrationDeadlineAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    entryFee: 120000,
    bankName: null,
    bankAccount: null,
    bankHolder: null,
    rulesText: null,
    refundPolicyText: null,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    createdByAdminUserId: 'owner-admin-id',
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    updatedAt: new Date('2026-06-14T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('TournamentsAdminService', () => {
  let service: TournamentsAdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Sport: { findUnique: jest.Mock };
    v1Tournament: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Sport: { findUnique: jest.fn() },
      v1Tournament: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $transaction: jest.fn(),
    };
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsAdminService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentsAdminService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── admin-role gates ───────────────────────────────────────────────────────

  it('create: non-admin → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.create(nonAdminAuthUser, { sportId: 'sport-1', title: 'x' })).rejects.toThrow(ForbiddenException);
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('create: support admin cannot mutate → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    await expect(service.create(supportAuthUser, { sportId: 'sport-1', title: 'x' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('list: non-admin → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.list(nonAdminAuthUser, {})).rejects.toThrow(ForbiddenException);
  });

  // ─── create validation ──────────────────────────────────────────────────────

  it('create: minPlayers > maxPlayers → 400 PLAYER_RANGE_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    await expect(
      service.create(ownerAuthUser, { sportId: 'sport-1', title: 'x', teamCount: 8, minPlayers: 10, maxPlayers: 6 }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_PLAYER_RANGE_INVALID' } });
  });

  it('create: missing teamCount → 400 TOURNAMENT_TEAM_COUNT_REQUIRED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);

    await expect(service.create(ownerAuthUser, { sportId: 'sport-1', title: 'x' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_TEAM_COUNT_REQUIRED' },
    });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('create: unknown sportId → 400 SPORT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue(null);
    await expect(service.create(ownerAuthUser, { sportId: 'ghost', title: 'x', teamCount: 8 })).rejects.toMatchObject({
      response: { code: 'SPORT_NOT_FOUND' },
    });
  });

  it('create: scheduledEndAt before scheduledAt → 400 TOURNAMENT_SCHEDULE_RANGE_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);

    await expect(
      service.create(ownerAuthUser, {
        sportId: 'sport-1',
        title: 'x',
        teamCount: 8,
        scheduledAt: '2026-08-15T09:00:00.000Z',
        scheduledEndAt: '2026-08-14T18:00:00.000Z',
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_SCHEDULE_RANGE_INVALID' } });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('create: owner with valid input → returns draft tournament + writes audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow());

    const result = await service.create(ownerAuthUser, {
      sportId: 'sport-1',
      title: '테스트 대회',
      teamCount: 12,
      entryFee: 120000,
      scheduledAt: '2026-08-15T09:00:00.000Z',
      scheduledEndAt: '2026-08-16T18:00:00.000Z',
    });

    expect(result).toMatchObject({
      id: 'tournament-1',
      status: 'draft',
      registrationCount: 0,
      entryFee: 120000,
      scheduledEndAt: null,
    });
    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamCount: 12,
          scheduledAt: new Date('2026-08-15T09:00:00.000Z'),
          scheduledEndAt: new Date('2026-08-16T18:00:00.000Z'),
        }),
      }),
    );
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'tournament.create', targetType: 'tournament' }) }),
    );
  });

  // ─── status transitions ───────────────────────────────────────────────────────

  it('changeStatus: draft → open succeeds and records previous/next', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'draft' }));
    prisma.v1Tournament.update.mockResolvedValue(tournamentRow({ status: 'open' }));

    const result = await service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'open' });

    expect(result).toMatchObject({ previousStatus: 'draft', status: 'open', alreadyInStatus: false });
    expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromStatus: 'draft', toStatus: 'open' }) }),
    );
  });

  it('changeStatus: open → completed (skipping in_progress) → 409 TRANSITION_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'open' }));
    await expect(service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'completed' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_STATUS_TRANSITION_INVALID' },
    });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('changeStatus: same status is idempotent (no write)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'open' }));
    const result = await service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'open' });
    expect(result).toMatchObject({ status: 'open', alreadyInStatus: true });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('changeStatus: completed is terminal → cannot go to in_progress (409)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'completed' }));
    await expect(service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'in_progress' })).rejects.toThrow(ConflictException);
  });

  // ─── not found ────────────────────────────────────────────────────────────────

  it('get: unknown id → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(service.get(ownerAuthUser, 'ghost')).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    await expect(service.get(ownerAuthUser, 'ghost')).rejects.toThrow(NotFoundException);
  });

  // ─── list shape ───────────────────────────────────────────────────────────────

  it('list: returns items with registrationCount + pageInfo', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findMany.mockResolvedValue([{ ...tournamentRow(), _count: { registrations: 3 } }]);
    const result = await service.list(ownerAuthUser, { limit: 20 });
    expect(result.items[0]).toMatchObject({ id: 'tournament-1', registrationCount: 3 });
    expect(result.pageInfo).toMatchObject({ hasNext: false, nextCursor: null });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  it('update: partial field (title only) persists updated value', async () => {
    // Arrange: admin resolves, existing tournament found, update returns patched row,
    // and get() (called at the end of update()) also resolves via findFirst+_count.
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({ title: '원래 제목' });
    const updated = tournamentRow({ title: '새 제목' });
    prisma.v1Tournament.findFirst
      // first call inside update() to load existing
      .mockResolvedValueOnce(existing)
      // second call inside get() which update() delegates to
      .mockResolvedValueOnce({ ...updated, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(updated);

    const result = await service.update(ownerAuthUser, 'tournament-1', { title: '새 제목' });

    expect(result).toMatchObject({ id: 'tournament-1', title: '새 제목' });
    // Only `title` was in the dto — verify update was called with exactly that field.
    expect(prisma.v1Tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: '새 제목' }) }),
    );
  });

  it('update: rejects scheduledEndAt earlier than final scheduledAt', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({ scheduledAt: new Date('2026-08-15T09:00:00.000Z') }),
    );

    await expect(
      service.update(ownerAuthUser, 'tournament-1', {
        scheduledEndAt: '2026-08-14T18:00:00.000Z',
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_SCHEDULE_RANGE_INVALID' } });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('update: minPlayers > maxPlayers (merged with existing) → 400 TOURNAMENT_PLAYER_RANGE_INVALID', async () => {
    // Existing has minPlayers=6, maxPlayers=10. Sending minPlayers=11 should fail
    // the merged-range check (11 > 10).
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ minPlayers: 6, maxPlayers: 10 }));

    await expect(
      service.update(ownerAuthUser, 'tournament-1', { minPlayers: 11 }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_PLAYER_RANGE_INVALID' } });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('update: sending only maxPlayers that falls below existing minPlayers → 400', async () => {
    // Existing: minPlayers=6, maxPlayers=10. Sending maxPlayers=3 makes merged (6,3) invalid.
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ minPlayers: 6, maxPlayers: 10 }));

    await expect(
      service.update(ownerAuthUser, 'tournament-1', { maxPlayers: 3 }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_PLAYER_RANGE_INVALID' } });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('update: non-existent tournament → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(
      service.update(ownerAuthUser, 'ghost-tournament', { title: '변경 시도' }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('update: emits audit log with before/after titles', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({ title: '이전 제목' });
    const updated = tournamentRow({ title: '이후 제목' });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...updated, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(updated);

    await service.update(ownerAuthUser, 'tournament-1', { title: '이후 제목' });

    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament.update',
          targetType: 'tournament',
          targetId: 'tournament-1',
          beforeJson: expect.objectContaining({ title: '이전 제목' }),
          afterJson: expect.objectContaining({ title: '이후 제목' }),
        }),
      }),
    );
  });
});
