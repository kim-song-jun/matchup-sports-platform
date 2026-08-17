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
import { NotificationsService } from '../notifications/notifications.service';
import { CompetitionConfigRegistry } from './competition-config/competition-config-registry';
import { TournamentCompetitionConfig } from './competition-config/tournament-competition-config';
import { TournamentsAdminService } from './tournaments-admin.service';

const ownerAuthUser = { id: 'owner-user-id', email: 'admin@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const supportAuthUser = { id: 'support-user-id', email: 'support@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const nonAdminAuthUser = { id: 'plain-user-id', email: 'user@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

const ownerAdminRecord = { id: 'owner-admin-id', userId: 'owner-user-id', adminRole: 'owner' as const, status: 'active' as const, user: { accountStatus: 'active' as const } };
const supportAdminRecord = { id: 'support-admin-id', userId: 'support-user-id', adminRole: 'support' as const, status: 'active' as const, user: { accountStatus: 'active' as const } };

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
    parkingInfo: '주차와 입장 동선은 지도에서 확인해요.',
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
  let notifications: { emitNotificationToMany: jest.Mock };
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Sport: { findUnique: jest.Mock };
    v1Tournament: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      groupBy: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    v1CompetitionConfigVersion: { findFirst: jest.Mock; findUnique: jest.Mock };
    v1TournamentFixture: { count: jest.Mock; updateMany: jest.Mock };
    v1TournamentStanding: { count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Sport: { findUnique: jest.fn() },
      v1Tournament: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      // "출전 인원" 기능(LineupSizeConfigResolver/TournamentCompetitionConfig.change) 전용
      // — 대부분의 기존 테스트는 lineupMaxPlayers를 전혀 안 보내거나 종목이 football/futsal이
      // 아니라 이 경로를 안 타므로 unconfigured mock(undefined 반환)으로 둬도 무해하다.
      v1CompetitionConfigVersion: { findFirst: jest.fn(), findUnique: jest.fn() },
      v1TournamentFixture: { count: jest.fn(), updateMany: jest.fn() },
      v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { count: jest.fn() },
      $transaction: jest.fn(),
    };
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));

    // 기본값: 키 미설정 상태와 동일하게 항상 null 반환(geocoding disabled). 개별 테스트에서 override.
    kakaoGeocoding = { geocode: jest.fn().mockResolvedValue(null) };
    notifications = { emitNotificationToMany: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsAdminService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: KakaoGeocodingService, useValue: kakaoGeocoding },
        { provide: NotificationsService, useValue: notifications },
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

  it('create: paid tournament without complete bank details is rejected', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);

    await expect(
      service.create(ownerAuthUser, {
        sportId: 'sport-1',
        title: '유료 대회',
        teamCount: 8,
        entryFee: 50000,
      }),
    ).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_PAYMENT_INSTRUCTIONS_REQUIRED' },
    });
    expect(prisma.v1Sport.findUnique).not.toHaveBeenCalled();
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
      bankName: '국민은행',
      bankAccount: '123-456',
      bankHolder: '팀밋',
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
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'draft', entryFee: 0 }));
    prisma.v1Tournament.update.mockResolvedValue(tournamentRow({ status: 'open' }));

    const result = await service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'open' });

    expect(result).toMatchObject({ previousStatus: 'draft', status: 'open', alreadyInStatus: false });
    expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromStatus: 'draft', toStatus: 'open' }) }),
    );
  });

  it('changeStatus: paid tournament without bank details cannot be opened', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'draft' }));

    await expect(
      service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'open' }),
    ).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_PAYMENT_INSTRUCTIONS_REQUIRED' },
    });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('changeStatus: open → completed (skipping in_progress) → 409 TRANSITION_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'open' }));
    await expect(service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'completed' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_STATUS_TRANSITION_INVALID' },
    });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  // 대회가 끝나는 순간이 후기를 쓰는 시점이다. 이 알림이 없으면 사용자가 대회 페이지를
  // 다시 찾아 들어오지 않는 한 후기를 쓸 계기가 없다. 수신자는 대회 후기 작성 권한과
  // 정확히 같아야 한다(참가 확정 팀의 owner/manager) — 넓으면 못 쓰는 알림, 좁으면 누락.
  it('changeStatus: in_progress → completed 시 참가팀 팀장·운영진에게 후기 요청 알림을 보낸다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'in_progress', entryFee: 0 }));
    prisma.v1Tournament.update.mockResolvedValue(tournamentRow({ status: 'completed' }));
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { team: { memberships: [{ userId: 'owner-a' }, { userId: 'manager-a' }] } },
      // 같은 사람이 두 팀의 운영진이면 알림은 한 번만 가야 한다.
      { team: { memberships: [{ userId: 'manager-a' }, { userId: 'owner-b' }] } },
    ]);

    await service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'completed' });

    expect(notifications.emitNotificationToMany).toHaveBeenCalledWith(
      ['owner-a', 'manager-a', 'owner-b'],
      'tournament_completed_review_request',
      'tournament-1',
    );
    // 조회 조건이 후기 권한과 갈리면 못 쓰는 사람에게 알림이 간다 — 조건 자체를 고정한다.
    const where = prisma.v1TournamentRegistration.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tournamentId: 'tournament-1',
      status: 'confirmed',
      team: { status: 'active', deletedAt: null },
    });
  });

  it('changeStatus: completed 외 전이에서는 후기 요청 알림을 보내지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'draft', entryFee: 0 }));
    prisma.v1Tournament.update.mockResolvedValue(tournamentRow({ status: 'open' }));

    await service.changeStatus(ownerAuthUser, 'tournament-1', { status: 'open' });

    expect(notifications.emitNotificationToMany).not.toHaveBeenCalled();
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

  // ─── bracket publish (Task 109 Track 6) ────────────────────────────────────────

  it('publishBracket: not-yet-published tournament → sets bracketPublishedAt + writes audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ bracketPublishedAt: null }));
    prisma.v1Tournament.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.publishBracket(ownerAuthUser, 'tournament-1');

    expect(result.alreadyPublished).toBe(false);
    expect(result.bracketPublishedAt).toEqual(expect.any(String));
    expect(prisma.v1Tournament.updateMany).toHaveBeenCalledWith({
      where: { id: 'tournament-1', deletedAt: null, bracketPublishedAt: null },
      // 즉시 공개는 남아 있던 예약을 함께 비운다(공개된 뒤의 예약은 의미가 없다).
      data: { bracketPublishedAt: expect.any(Date), bracketPublishScheduledAt: null },
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'tournament.bracket_publish' }) }),
    );
    // 대진표 공개는 대회 status와 무관한 이벤트라 status-change 로그는 남기지 않는다.
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('publishBracket: concurrent requests produce one transition and one audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ bracketPublishedAt: null }));
    let winnerPublishedAt: Date | null = null;
    prisma.v1Tournament.updateMany.mockImplementation(
      ({ data }: { data: { bracketPublishedAt: Date } }) => {
        if (winnerPublishedAt) return Promise.resolve({ count: 0 });
        winnerPublishedAt = data.bracketPublishedAt;
        return Promise.resolve({ count: 1 });
      },
    );
    prisma.v1Tournament.findUnique.mockImplementation(() =>
      Promise.resolve({ bracketPublishedAt: winnerPublishedAt, deletedAt: null }),
    );

    const results = await Promise.all([
      service.publishBracket(ownerAuthUser, 'tournament-1'),
      service.publishBracket(ownerAuthUser, 'tournament-1'),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alreadyPublished: false }),
        expect.objectContaining({ alreadyPublished: true }),
      ]),
    );
    expect(new Set(results.map((result) => result.bracketPublishedAt)).size).toBe(1);
    expect(prisma.v1Tournament.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
  });

  it('publishBracket: 예약 시각이 지나 이미 공개 중이면 재예약을 받지 않는다(재비공개 방지)', async () => {
    // 예약 공개는 조회 시점 판정이라 시각이 지나도 bracketPublishedAt 은 null 이다.
    // 여기서 미래 예약을 그대로 받으면 이미 공개된 대진표가 다시 감춰진다.
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({
        bracketPublishedAt: null,
        bracketPublishScheduledAt: new Date(Date.now() - 60_000),
      }),
    );

    const result = await service.publishBracket(
      ownerAuthUser,
      'tournament-1',
      new Date(Date.now() + 86_400_000),
    );

    expect(result.alreadyPublished).toBe(true);
    expect(prisma.v1Tournament.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('publishBracket: 아직 오지 않은 예약이 있으면 재예약은 미래 조건 가드와 함께 기록된다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({
        bracketPublishedAt: null,
        bracketPublishScheduledAt: new Date(Date.now() + 3_600_000),
      }),
    );
    prisma.v1Tournament.updateMany.mockResolvedValue({ count: 1 });

    const next = new Date(Date.now() + 7_200_000);
    const result = await service.publishBracket(ownerAuthUser, 'tournament-1', next);

    expect(result.bracketPublishScheduledAt).toBe(next.toISOString());
    expect(prisma.v1Tournament.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bracketPublishedAt: null,
          // 이미 지난 예약(=공개 상태)에는 덮어쓰지 않도록 하는 레이스 가드
          OR: [{ bracketPublishScheduledAt: null }, { bracketPublishScheduledAt: { gt: expect.any(Date) } }],
        }),
        data: { bracketPublishScheduledAt: next },
      }),
    );
  });

  it('publishBracket: already published → idempotent no-op (no write)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const publishedAt = new Date('2026-07-01T00:00:00.000Z');
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ bracketPublishedAt: publishedAt }));

    const result = await service.publishBracket(ownerAuthUser, 'tournament-1');

    expect(result).toEqual({
      tournamentId: 'tournament-1',
      bracketPublishedAt: publishedAt.toISOString(),
      bracketPublishScheduledAt: null,
      alreadyPublished: true,
    });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
    expect(prisma.v1Tournament.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('publishBracket: non-admin → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.publishBracket(nonAdminAuthUser, 'tournament-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.v1Tournament.findFirst).not.toHaveBeenCalled();
  });

  it('publishBracket: support admin cannot mutate → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    await expect(service.publishBracket(supportAuthUser, 'tournament-1')).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('publishBracket: unknown tournament → 404', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(service.publishBracket(ownerAuthUser, 'ghost')).rejects.toThrow(NotFoundException);
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
    prisma.v1Tournament.groupBy.mockResolvedValue([
      { status: 'open', _count: { _all: 4 } },
      { status: 'completed', _count: { _all: 2 } },
    ]);
    const result = await service.list(ownerAuthUser, { limit: 20 });
    expect(result.items[0]).toMatchObject({ id: 'tournament-1', registrationCount: 3 });
    expect(result.pageInfo).toMatchObject({ hasNext: false, nextCursor: null });
    expect(result.summary).toEqual({
      total: 6,
      byStatus: { draft: 0, open: 4, closed: 0, in_progress: 0, completed: 2, cancelled: 0 },
    });
  });

  it('get: returns collection counts for all operation tabs', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({
      ...tournamentRow(),
      _count: { registrations: 7, fixtures: 11, announcements: 3 },
    });

    const result = await service.get(ownerAuthUser, 'tournament-1');

    expect(result.operationCounts).toEqual({ registrations: 7, fixtures: 11, announcements: 3 });
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

  it('update: clearing venue and editable text fields persists null without geocoding', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({
      venue: '기존 장소',
      parkingInfo: '기존 주차 안내',
      latitude: 5,
      longitude: 5,
      entryFee: 0,
      bankName: '기존 은행',
      rulesText: '기존 규정',
    });
    const updated = tournamentRow({
      venue: null,
      parkingInfo: null,
      latitude: null,
      longitude: null,
      bankName: null,
      rulesText: null,
    });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...updated, _count: { registrations: 0 } });
    prisma.v1Tournament.update.mockResolvedValue(updated);

    await service.update(ownerAuthUser, 'tournament-1', {
      venue: null,
      parkingInfo: null,
      bankName: null,
      rulesText: null,
    });

    expect(kakaoGeocoding.geocode).not.toHaveBeenCalled();
    expect(prisma.v1Tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venue: null,
          parkingInfo: null,
          latitude: null,
          longitude: null,
          bankName: null,
          rulesText: null,
        }),
      }),
    );
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

  it('create: rejects an impossible mixed gender quota', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);

    await expect(
      service.create(ownerAuthUser, {
        sportId: 'sport-1',
        title: '혼성 대회',
        teamCount: 8,
        maxPlayers: 10,
        genderCategory: 'mixed',
        genderMinMale: 6,
        genderMinFemale: 5,
      }),
    ).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID' },
    });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('create: persists a valid mixed gender quota', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' });
    prisma.v1Tournament.create.mockResolvedValue(
      tournamentRow({
        genderCategory: 'mixed',
        genderMinMale: 2,
        genderMaxMale: 6,
        genderMinFemale: 2,
        genderMaxFemale: 6,
      }),
    );

    const result = await service.create(ownerAuthUser, {
      sportId: 'sport-1',
      title: '혼성 대회',
      teamCount: 8,
      genderCategory: 'mixed',
      genderMinMale: 2,
      genderMaxMale: 6,
      genderMinFemale: 2,
      genderMaxFemale: 6,
    });

    expect(result).toMatchObject({
      genderCategory: 'mixed',
      genderMinMale: 2,
      genderMaxMale: 6,
      genderMinFemale: 2,
      genderMaxFemale: 6,
    });
  });

  it('update: changing maxPlayers revalidates the retained mixed quota', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({
        maxPlayers: 10,
        genderCategory: 'mixed',
        genderMinMale: 5,
        genderMinFemale: 4,
      }),
    );

    await expect(
      service.update(ownerAuthUser, 'tournament-1', { maxPlayers: 8 }),
    ).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID' },
    });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('create: rejects a gender maximum above the roster capacity', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);

    await expect(
      service.create(ownerAuthUser, {
        sportId: 'sport-1',
        title: '혼성 대회',
        teamCount: 8,
        maxPlayers: 10,
        genderCategory: 'mixed',
        genderMaxFemale: 11,
      }),
    ).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID' },
    });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  // ─── "출전 인원" (lineup size) ──────────────────────────────────────────────

  it('create: sport without competition-config coverage + no lineupMaxPlayers → competitionConfigVersionId stays null (unchanged baseline)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1' }); // no `code` — e.g. 배드민턴 등 아직 미지원 종목
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow());

    await service.create(ownerAuthUser, { sportId: 'sport-1', title: 'x', teamCount: 8 });

    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ competitionConfigVersionId: null }) }),
    );
    expect(prisma.v1CompetitionConfigVersion.findFirst).not.toHaveBeenCalled();
  });

  it('create: explicit lineupMaxPlayers on an unsupported sport → 422 COMPETITION_CONFIG_SPORT_UNSUPPORTED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1', code: 'badminton' });

    await expect(
      service.create(ownerAuthUser, { sportId: 'sport-1', title: 'x', teamCount: 8, lineupMaxPlayers: 5 }),
    ).rejects.toMatchObject({ response: { code: 'COMPETITION_CONFIG_SPORT_UNSUPPORTED' } });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('create: unsupported lineupMaxPlayers value for a supported sport → 422 LINEUP_SIZE_UNSUPPORTED, listing valid options', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1', code: 'futsal' });

    await expect(
      service.create(ownerAuthUser, { sportId: 'sport-1', title: 'x', teamCount: 8, lineupMaxPlayers: 7 }),
    ).rejects.toMatchObject({
      response: { code: 'LINEUP_SIZE_UNSUPPORTED', message: expect.stringContaining('5명/6명') },
    });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('create: reuses an existing competition-config version when its content already matches (find-or-create hit)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1', code: 'futsal' });
    prisma.v1CompetitionConfigVersion.findFirst.mockResolvedValue({
      id: 'existing-config-version-6',
      version: 2,
      contentHash: 'hash-6',
    });
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow());

    await service.create(ownerAuthUser, {
      sportId: 'sport-1',
      title: 'x',
      teamCount: 8,
      lineupMaxPlayers: 6,
    });

    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ competitionConfigVersionId: 'existing-config-version-6' }),
      }),
    );
  });

  it('create: sport has competition-config coverage but lineupMaxPlayers omitted → defaults to the canonical maxPlayers', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1', code: 'futsal' });
    prisma.v1CompetitionConfigVersion.findFirst.mockResolvedValue({
      id: 'default-futsal-config-version',
      version: 1,
      contentHash: 'hash-default',
    });
    prisma.v1Tournament.create.mockResolvedValue(tournamentRow());

    await service.create(ownerAuthUser, { sportId: 'sport-1', title: 'x', teamCount: 8 });

    // futsal-v1의 canonical maxPlayers(6)로 조회했는지는 findFirst 호출 인자(where.contentHash)로
    // 직접 검증할 수 없으니(콘텐츠 해시라 불투명) 대신 find-or-create가 실제로 실행됐다는 것과
    // 그 결과가 대회에 반영됐다는 것을 검증한다 — canonical 기본값 파생 자체는
    // lineup-size.spec.ts가 순수 함수 단위로 이미 증명한다.
    expect(prisma.v1CompetitionConfigVersion.findFirst).toHaveBeenCalled();
    expect(prisma.v1Tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ competitionConfigVersionId: 'default-futsal-config-version' }),
      }),
    );
  });

  it('update: lineupMaxPlayers on an in_progress tournament → 409 TOURNAMENT_LINEUP_SIZE_LOCKED, no reads/writes', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'in_progress' }));

    await expect(
      service.update(ownerAuthUser, 'tournament-1', { lineupMaxPlayers: 6 }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_LINEUP_SIZE_LOCKED' } });
    expect(prisma.v1CompetitionConfigVersion.findFirst).not.toHaveBeenCalled();
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('update: lineupMaxPlayers on a completed tournament → 409 TOURNAMENT_LINEUP_SIZE_LOCKED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'completed' }));

    await expect(
      service.update(ownerAuthUser, 'tournament-1', { lineupMaxPlayers: 6 }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_LINEUP_SIZE_LOCKED' } });
  });

  it('update: changing sportId and lineupMaxPlayers in the same request → 400 TOURNAMENT_LINEUP_SIZE_SPORT_CHANGE_CONFLICT', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ sportId: 'sport-1', status: 'draft' }));

    await expect(
      service.update(ownerAuthUser, 'tournament-1', { sportId: 'sport-2', lineupMaxPlayers: 6 }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_LINEUP_SIZE_SPORT_CHANGE_CONFLICT' } });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('update: draft tournament + valid lineupMaxPlayers → resolves a version and pins it via TournamentCompetitionConfig.change()', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({
      sportId: 'sport-1',
      status: 'draft',
      competitionConfigVersionId: 'old-config-version',
    });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing) // update()'s own `existing` fetch
      .mockResolvedValueOnce({
        // get()'s re-fetch at the end of update() — includes the `sport` relation
        // (get()'s query asks for `sport: { select: { code: true } }`) and the
        // newly-pinned competitionConfigVersionId, both needed by loadLineupInfo().
        ...tournamentRow({ competitionConfigVersionId: 'new-config-version-6' }),
        sport: { code: 'futsal' },
        _count: { registrations: 0, fixtures: 0, announcements: 0 },
      });
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1', code: 'futsal' });
    prisma.v1CompetitionConfigVersion.findFirst.mockResolvedValue({
      id: 'new-config-version-6',
      version: 3,
      contentHash: 'hash-6-new',
    });
    prisma.v1CompetitionConfigVersion.findUnique.mockResolvedValue({
      lineup: { minPlayers: 3, maxPlayers: 6 },
    });
    prisma.v1Tournament.update.mockResolvedValue(tournamentRow());

    const changeSpy = jest.spyOn(TournamentCompetitionConfig.prototype, 'change').mockResolvedValue({
      changed: true,
      currentCompetitionConfigVersionId: 'new-config-version-6',
      expectedVersion: new Date().toISOString(),
      previewHash: 'hash-6-new',
      impact: { fixtureCount: 0, completedFixtureCount: 0, standingCount: 0, requiresRecalculation: false },
      confirmationRequired: false,
    });

    try {
      await service.update(ownerAuthUser, 'tournament-1', { lineupMaxPlayers: 6 });
      expect(changeSpy).toHaveBeenCalledWith(
        ownerAuthUser,
        'tournament-1',
        expect.objectContaining({
          competitionConfigVersionId: 'new-config-version-6',
          expectedVersion: existing.updatedAt.toISOString(),
        }),
      );
    } finally {
      changeSpy.mockRestore();
    }
  });

  it('update: lineupMaxPlayers blocked when change() reports confirmationRequired (already-recorded results)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({ sportId: 'sport-1', status: 'closed', competitionConfigVersionId: 'old-config-version' }),
    );
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1', code: 'futsal' });
    prisma.v1CompetitionConfigVersion.findFirst.mockResolvedValue({
      id: 'new-config-version-6',
      version: 3,
      contentHash: 'hash-6-new',
    });

    const changeSpy = jest.spyOn(TournamentCompetitionConfig.prototype, 'change').mockResolvedValue({
      changed: false,
      currentCompetitionConfigVersionId: 'old-config-version',
      requestedCompetitionConfigVersionId: 'new-config-version-6',
      expectedVersion: new Date().toISOString(),
      previewHash: 'hash-6-new',
      impact: { fixtureCount: 4, completedFixtureCount: 2, standingCount: 2, requiresRecalculation: true },
      confirmationRequired: true,
    });

    try {
      await expect(
        service.update(ownerAuthUser, 'tournament-1', { lineupMaxPlayers: 6 }),
      ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_LINEUP_SIZE_LOCKED' } });
      expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
    } finally {
      changeSpy.mockRestore();
    }
  });

  // ─── "교체 방식/횟수" (substitution policy) ─────────────────────────────────

  it('create: substitutionMode "rolling" together with an explicit maxSubstitutions → 400 TOURNAMENT_SUBSTITUTION_POLICY_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);

    await expect(
      service.create(ownerAuthUser, {
        sportId: 'sport-1',
        title: 'x',
        teamCount: 8,
        substitutionMode: 'rolling',
        maxSubstitutions: 5,
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_SUBSTITUTION_POLICY_INVALID' } });
    expect(prisma.v1Tournament.create).not.toHaveBeenCalled();
  });

  it('update: substitutionMode on an in_progress tournament → 409 TOURNAMENT_LINEUP_SIZE_LOCKED (same lock as lineup size)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'in_progress' }));

    await expect(
      service.update(ownerAuthUser, 'tournament-1', { substitutionMode: 'rolling' }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_LINEUP_SIZE_LOCKED' } });
    expect(prisma.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('update: changing only substitutionMode preserves the currently pinned lineup size instead of resetting it to canonical', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const existing = tournamentRow({
      sportId: 'sport-1',
      status: 'draft',
      competitionConfigVersionId: 'pinned-config-version',
    });
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(existing) // update()'s own `existing` fetch
      .mockResolvedValueOnce({
        ...tournamentRow({ competitionConfigVersionId: 'new-config-version' }),
        sport: { code: 'futsal' },
        _count: { registrations: 0, fixtures: 0, announcements: 0 },
      });
    prisma.v1Sport.findUnique.mockResolvedValue({ id: 'sport-1', code: 'futsal' });
    // 현재 pin된 버전은 canonical(6명/무제한)이 아니라 관리자가 이미 커스터마이즈한
    // 값(5명/제한 3회)이다 — substitutionMode만 바꿔도 이 5명이 그대로 유지돼야 한다.
    prisma.v1CompetitionConfigVersion.findUnique
      .mockResolvedValueOnce({
        lineup: { minPlayers: 3, maxPlayers: 5, substitutions: 'limited', maxSubstitutions: 3 },
      }) // update()가 override 병합 전에 읽는 "지금 pin된 값"
      .mockResolvedValueOnce(undefined) // findOrCreateVersion의 content_hash 충돌 검사(충돌 없음)
      .mockResolvedValue({
        lineup: { minPlayers: 3, maxPlayers: 5, substitutions: 'rolling', maxSubstitutions: null },
      }); // update() 끝의 get() 재조회(loadLineupInfo)용 — 이 테스트는 값 자체를 검증하지 않는다.
    prisma.v1CompetitionConfigVersion.findFirst
      .mockResolvedValueOnce(undefined) // find-or-create: 이 content_hash의 버전은 아직 없음
      .mockResolvedValueOnce({ id: 'latest-version-id' }); // 계열의 최신 버전(신규 버전의 base)
    prisma.v1Tournament.update.mockResolvedValue(tournamentRow());

    const createVersionSpy = jest
      .spyOn(CompetitionConfigRegistry.prototype, 'createVersion')
      .mockResolvedValue({
        id: 'new-config-version',
        version: 4,
        contentHash: 'hash-new',
      } as never);
    const changeSpy = jest.spyOn(TournamentCompetitionConfig.prototype, 'change').mockResolvedValue({
      changed: true,
      currentCompetitionConfigVersionId: 'new-config-version',
      expectedVersion: new Date().toISOString(),
      previewHash: 'hash-new',
      impact: { fixtureCount: 0, completedFixtureCount: 0, standingCount: 0, requiresRecalculation: false },
      confirmationRequired: false,
    });

    try {
      await service.update(ownerAuthUser, 'tournament-1', { substitutionMode: 'rolling' });
      expect(createVersionSpy).toHaveBeenCalledWith(
        ownerAuthUser,
        'latest-version-id',
        expect.objectContaining({
          config: expect.objectContaining({
            lineup: expect.objectContaining({
              maxPlayers: 5, // 그대로 유지 — canonical(6)로 리셋되지 않는다
              substitutions: 'rolling',
              maxSubstitutions: null,
            }),
          }),
        }),
      );
    } finally {
      createVersionSpy.mockRestore();
      changeSpy.mockRestore();
    }
  });
});
