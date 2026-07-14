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
import { KakaoGeocodingService } from './kakao-geocoding.service';
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
    genderCategory: null,
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
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
  let kakaoGeocoding: { geocode: jest.Mock };
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

    // 기본값: 키 미설정 상태와 동일하게 항상 null 반환(geocoding disabled). 개별 테스트에서 override.
    kakaoGeocoding = { geocode: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsAdminService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: KakaoGeocodingService, useValue: kakaoGeocoding },
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

  // ─── venue geocoding wiring (KakaoGeocodingService) ────────────────────────────

  it('create: venue provided + geocoding succeeds → coordinates saved with the tournament', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow({ venue: '잠실종합운동장', latitude: 37.5, longitude: 127.07 }));
    kakaoGeocoding.geocode.mockResolvedValue({ latitude: 37.5, longitude: 127.07 });

    await service.create(ownerAuthUser, { sportId: 'sport-1', title: '테스트 대회', teamCount: 8, venue: '잠실종합운동장' });

    expect(kakaoGeocoding.geocode).toHaveBeenCalledWith('잠실종합운동장');
    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ latitude: 37.5, longitude: 127.07 }) }),
    );
  });

  it('create: no venue → geocoding is never called and coordinates are null', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow());

    await service.create(ownerAuthUser, { sportId: 'sport-1', title: '테스트 대회', teamCount: 8 });

    expect(kakaoGeocoding.geocode).not.toHaveBeenCalled();
    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ latitude: null, longitude: null }) }),
    );
  });

  it('create: geocoding disabled/failed (returns null) → venue still saves, coordinates stay null', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow({ venue: '알 수 없는 장소' }));
    kakaoGeocoding.geocode.mockResolvedValue(null);

    const result = await service.create(ownerAuthUser, {
      sportId: 'sport-1',
      title: '테스트 대회',
      teamCount: 8,
      venue: '알 수 없는 장소',
    });

    expect(result).toMatchObject({ venue: '알 수 없는 장소' });
    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ latitude: null, longitude: null }) }),
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

  it('update: venue changed → re-geocodes and persists new coordinates', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({ venue: '기존 장소', latitude: 1, longitude: 1 });
    const updated = tournamentRow({ venue: '새 장소', latitude: 37.4, longitude: 127.1 });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...updated, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(updated);
    kakaoGeocoding.geocode.mockResolvedValue({ latitude: 37.4, longitude: 127.1 });

    await service.update(ownerAuthUser, 'tournament-1', { venue: '새 장소' });

    expect(kakaoGeocoding.geocode).toHaveBeenCalledWith('새 장소');
    expect(prisma.v1Tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ venue: '새 장소', latitude: 37.4, longitude: 127.1 }) }),
    );
  });

  it('update: venue unchanged (same value resent) → does not re-geocode or touch coordinates', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({ venue: '동일 장소', latitude: 5, longitude: 5 });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(existing);

    await service.update(ownerAuthUser, 'tournament-1', { venue: '동일 장소' });

    expect(kakaoGeocoding.geocode).not.toHaveBeenCalled();
    const updateCallData = prisma.v1Tournament.update.mock.calls[0][0].data;
    expect(updateCallData).not.toHaveProperty('latitude');
    expect(updateCallData).not.toHaveProperty('longitude');
  });

  it('update: venue not included in dto → does not re-geocode or touch coordinates', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({ venue: '기존 장소', latitude: 5, longitude: 5 });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(existing);

    await service.update(ownerAuthUser, 'tournament-1', { title: '제목만 변경' });

    expect(kakaoGeocoding.geocode).not.toHaveBeenCalled();
    const updateCallData = prisma.v1Tournament.update.mock.calls[0][0].data;
    expect(updateCallData).not.toHaveProperty('latitude');
    expect(updateCallData).not.toHaveProperty('longitude');
  });

  it('update: geocoding disabled/failed on venue change → clears coordinates to null (never blocks venue save)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({ venue: '기존 장소', latitude: 5, longitude: 5 });
    const updated = tournamentRow({ venue: '지오코딩 실패 장소', latitude: null, longitude: null });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...updated, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(updated);
    kakaoGeocoding.geocode.mockResolvedValue(null);

    const result = await service.update(ownerAuthUser, 'tournament-1', { venue: '지오코딩 실패 장소' });

    expect(result).toMatchObject({ venue: '지오코딩 실패 장소' });
    expect(prisma.v1Tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ latitude: null, longitude: null }) }),
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

  // ─── 성별 카테고리 · 쿼터 ───────────────────────────────────────────────────────

  it('create: mixed + genderMinMale > genderMaxMale → 400 TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });

    await expect(
      service.create(ownerAuthUser, {
        sportId: 'sport-1',
        title: 'x',
        teamCount: 8,
        genderCategory: 'mixed',
        genderMinMale: 5,
        genderMaxMale: 3,
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID' } });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('create: mixed + min합(male+female)이 maxPlayers 초과 → 400 TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });

    await expect(
      service.create(ownerAuthUser, {
        sportId: 'sport-1',
        title: 'x',
        teamCount: 8,
        maxPlayers: 10,
        genderCategory: 'mixed',
        genderMinMale: 6,
        genderMinFemale: 6,
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID' } });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('create: mixed + 유효한 쿼터 → 저장되고 응답에 그대로 노출', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });
    prisma.v1Tournament.create.mockResolvedValue(
      tournamentRow({ genderCategory: 'mixed', genderMinMale: 2, genderMaxMale: 6, genderMinFemale: 2, genderMaxFemale: 6 }),
    );

    const result = await service.create(ownerAuthUser, {
      sportId: 'sport-1',
      title: 'x',
      teamCount: 8,
      maxPlayers: 10,
      genderCategory: 'mixed',
      genderMinMale: 2,
      genderMaxMale: 6,
      genderMinFemale: 2,
      genderMaxFemale: 6,
    });

    expect(result).toMatchObject({ genderCategory: 'mixed', genderMinMale: 2, genderMaxMale: 6, genderMinFemale: 2, genderMaxFemale: 6 });
    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ genderCategory: 'mixed', genderMinMale: 2, genderMaxMale: 6, genderMinFemale: 2, genderMaxFemale: 6 }),
      }),
    );
  });

  it('create: genderCategory=male(비mixed) + 쿼터 값 전송 → 쿼터는 전부 null로 정규화되어 저장', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow({ genderCategory: 'male' }));

    await service.create(ownerAuthUser, {
      sportId: 'sport-1',
      title: 'x',
      teamCount: 8,
      genderCategory: 'male',
      genderMinMale: 5, // non-mixed 카테고리에서는 무시되어야 함
    });

    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          genderCategory: 'male',
          genderMinMale: null,
          genderMaxMale: null,
          genderMinFemale: null,
          genderMaxFemale: null,
        }),
      }),
    );
  });

  it('create: genderCategory 미지정 → null로 저장(성별정책 없음, 기존 대회와 동일 동작)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow());

    await service.create(ownerAuthUser, { sportId: 'sport-1', title: 'x', teamCount: 8 });

    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ genderCategory: null, genderMinMale: null, genderMaxMale: null, genderMinFemale: null, genderMaxFemale: null }),
      }),
    );
  });

  it('update: mixed로 전환하며 min>max 쿼터 전송 → 400 TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID (update 미호출)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ genderCategory: null, maxPlayers: 10 }));

    await expect(
      service.update(ownerAuthUser, 'tournament-1', {
        genderCategory: 'mixed',
        genderMinFemale: 8,
        genderMaxFemale: 4,
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID' } });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('update: mixed → male로 카테고리 변경 시 기존 쿼터값이 전부 null로 덮어써짐', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({ genderCategory: 'mixed', genderMinMale: 2, genderMaxMale: 6, genderMinFemale: 2, genderMaxFemale: 6 });
    const updated = tournamentRow({ genderCategory: 'male', genderMinMale: null, genderMaxMale: null, genderMinFemale: null, genderMaxFemale: null });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...updated, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(updated);

    await service.update(ownerAuthUser, 'tournament-1', { genderCategory: 'male' });

    expect(prisma.v1Tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          genderCategory: 'male',
          genderMinMale: null,
          genderMaxMale: null,
          genderMinFemale: null,
          genderMaxFemale: null,
        }),
      }),
    );
  });

  it('update: 성별 필드 미포함 → data에 gender* 키가 아예 없음(기존값 그대로 보존)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({ genderCategory: 'mixed', genderMinMale: 2, genderMaxMale: 6 });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(existing);

    await service.update(ownerAuthUser, 'tournament-1', { title: '제목만 변경' });

    const updateCallData = prisma.v1Tournament.update.mock.calls[0][0].data;
    expect(updateCallData).not.toHaveProperty('genderCategory');
    expect(updateCallData).not.toHaveProperty('genderMinMale');
  });
});
