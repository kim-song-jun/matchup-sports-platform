/**
 * tournament-announcements.service.spec.ts
 *
 * Contract tests for tournament announcement admin operations.
 * Verifies: admin-role gates (non-admin 403, support 403), tournament existence
 * check, create with publish flag, publish idempotency (alreadyPublished),
 * 404 on unknown announcement, and audit log emission.
 * Asserts observable behaviour only — no mock-for-mock assertions.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TournamentAnnouncementsService } from './tournament-announcements.service';
import { kindAwareFindFirst } from '../../test/helpers/kind-aware-find-first';

const ownerAuthUser = {
  id: 'owner-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const supportAuthUser = {
  id: 'support-user-id',
  email: 'support@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const plainUser = {
  id: 'plain-user-id',
  email: 'user@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const ownerAdminRecord = {
  id: 'owner-admin-id',
  userId: 'owner-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};
const supportAdminRecord = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

function announcementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ann-1',
    tournamentId: 'tournament-1',
    title: '경기 일정 공지',
    body: '7월 1일 오전 10시 시작합니다.',
    category: 'general',
    audience: 'all_registered',
    publishedAt: null,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    updatedAt: new Date('2026-06-14T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TournamentAnnouncementsService', () => {
  let service: TournamentAnnouncementsService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentAnnouncement: {
      create: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    v1TournamentRegistration: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { emitNotification: jest.Mock; emitToManyDeferred: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentAnnouncement: {
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      v1AdminActionLog: {
        create: jest.fn().mockResolvedValue({ id: 'action-log-1' }),
      },
      v1StatusChangeLog: {
        create: jest.fn().mockResolvedValue({ id: 'status-log-1' }),
      },
      v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof p) => Promise<unknown>) => cb(p),
    );

    notifications = {
      emitNotification: jest.fn().mockResolvedValue(undefined),
      emitToManyDeferred: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentAnnouncementsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(TournamentAnnouncementsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listForParticipant ───────────────────────────────────────────────────────
  //
  // 알림 수신 자격(notifyAnnouncementPublished가 registrationStatusesForAudience로 정하는
  // 대상)과 열람 자격이 갈리면 "알림은 왔는데 못 읽는다"가 재현된다 — 아래는 audience별
  // 4갈래(public/confirmed_only/waitlist/all_registered) 분기를 각각 실측한다.

  it('listForParticipant: 삭제된 대회 → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(service.listForParticipant(plainUser, 'ghost')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
    expect(prisma.v1TournamentAnnouncement.findMany).not.toHaveBeenCalled();
  });

  // 통합 백필(R3)이 `v1_tournaments` 에 정규 리그 시즌을 만들면서, 예전엔 없던 id 가 이
  // 조회를 통과하기 시작했다(#863 이 공개 경로에서 실측). 공지는 읽기지만 **존재 오라클**이
  // 되고, 어드민 생성 경로와 이어지면 리그 공지가 대회 공지로 나간다.
  // **부수효과가 있는 자리라 404 만으로는 부족하다.** 공지 생성은 성공하면 알림이 나가고,
  // 나간 알림은 되돌릴 수 없다 — 404 는 부수효과가 **이미 일어난 뒤에도** 반환될 수 있으므로
  // "공지 행이 안 만들어졌는가" 와 "알림이 안 나갔는가" 를 함께 단언한다.
  it('create(어드민): 리그 id 는 공지 생성도 알림 발송도 하지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'league-1', kind: 'regular_league' }),
    );
    // **봉쇄가 없으면 이 흐름이 실제로 성공하도록** 나머지 mock 을 채운다. 비워 두면 봉쇄를
    // 지웠을 때 downstream 이 TypeError 로 죽어, `create 안 불림` 단언이 **게이트가 아니라
    // 깨진 mock 덕에** 통과한다 — 그러면 부수효과 단언이 아무것도 증명하지 못한다.
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(
      announcementRow({ id: 'ann-league', audience: 'all_registered', publishedAt: new Date() }),
    );

    await expect(
      service.create(ownerAuthUser, 'league-1', { title: '공지', body: '본문', publish: true }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });

    expect(prisma.v1TournamentAnnouncement.create).not.toHaveBeenCalled();
    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
    expect(notifications.emitNotification).not.toHaveBeenCalled();
  });

  it('create(어드민): 대회 id 는 그대로 생성되고 알림도 나간다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    // 음성만 보면 **전부 404 로 만들어도 통과**한다. 봉쇄를 지웠을 때 알림이 실제로
    // 나가는지(= 위 단언이 무의미하지 않은지)를 이 양성 케이스가 보장한다.
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'tournament-1', kind: 'regular_tournament' }),
    );
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(
      announcementRow({ id: 'ann-new', audience: 'all_registered', publishedAt: new Date() }),
    );

    await expect(
      service.create(ownerAuthUser, 'tournament-1', { title: '공지', body: '본문', publish: true }),
    ).resolves.toBeDefined();
    expect(prisma.v1TournamentAnnouncement.create).toHaveBeenCalled();
  });

  it('listForParticipant: 리그 id 로는 열리지 않는다', async () => {
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'league-1', kind: 'regular_league' }),
    );
    await expect(service.listForParticipant(plainUser, 'league-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
    expect(prisma.v1TournamentAnnouncement.findMany).not.toHaveBeenCalled();
  });

  it('listForParticipant: 대회 id 와 kind=null(R1 이전 행)은 그대로 열린다', async () => {
    // 막는 것만 보면 **전부 404 로 만들어도 통과**한다. 통과해야 할 것도 확인한다.
    for (const kind of ['regular_tournament', null]) {
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst({ id: 'tournament-1', kind }),
      );
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);
      prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([
        announcementRow({ id: 'ann-public', audience: 'public', publishedAt: new Date() }),
      ]);
      const result = await service.listForParticipant(plainUser, 'tournament-1');
      expect(result.items.map((i) => i.id)).toEqual(['ann-public']);
    }
  });

  it('listForParticipant: audience=public 공지는 신청 내역이 전혀 없어도 보인다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]); // 미신청자
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([
      announcementRow({ id: 'ann-public', audience: 'public', publishedAt: new Date() }),
    ]);

    const result = await service.listForParticipant(plainUser, 'tournament-1');

    expect(result.items.map((i) => i.id)).toEqual(['ann-public']);
  });

  it('listForParticipant: audience=confirmed_only은 confirmed 신청자에게만 보인다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ status: 'confirmed' }]);
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([
      announcementRow({ id: 'ann-confirmed', audience: 'confirmed_only', publishedAt: new Date() }),
    ]);

    const result = await service.listForParticipant(plainUser, 'tournament-1');

    expect(result.items.map((i) => i.id)).toEqual(['ann-confirmed']);
  });

  it('listForParticipant: audience=confirmed_only은 waitlisted 신청자에게는 안 보인다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ status: 'waitlisted' }]);
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([
      announcementRow({ id: 'ann-confirmed', audience: 'confirmed_only', publishedAt: new Date() }),
    ]);

    const result = await service.listForParticipant(plainUser, 'tournament-1');

    expect(result.items).toEqual([]);
  });

  it('listForParticipant: audience=waitlist은 waitlisted 신청자에게만 보인다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ status: 'waitlisted' }]);
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([
      announcementRow({ id: 'ann-waitlist', audience: 'waitlist', publishedAt: new Date() }),
    ]);

    const result = await service.listForParticipant(plainUser, 'tournament-1');

    expect(result.items.map((i) => i.id)).toEqual(['ann-waitlist']);
  });

  it('listForParticipant: audience=waitlist은 confirmed 신청자에게는 안 보인다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ status: 'confirmed' }]);
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([
      announcementRow({ id: 'ann-waitlist', audience: 'waitlist', publishedAt: new Date() }),
    ]);

    const result = await service.listForParticipant(plainUser, 'tournament-1');

    expect(result.items).toEqual([]);
  });

  it('listForParticipant: audience=all_registered은 활성 신청 상태(예: paid)면 보인다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ status: 'paid' }]);
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([
      announcementRow({ id: 'ann-all', audience: 'all_registered', publishedAt: new Date() }),
    ]);

    const result = await service.listForParticipant(plainUser, 'tournament-1');

    expect(result.items.map((i) => i.id)).toEqual(['ann-all']);
  });

  it('listForParticipant: audience=all_registered이라도 활성 신청 내역이 없으면(신청 자체가 없거나 취소만 있으면) 안 보인다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    // ACTIVE_TOURNAMENT_REGISTRATION_STATUSES에 cancelled는 없으므로 조회 자체가 빈 배열을 반환한다.
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([
      announcementRow({ id: 'ann-all', audience: 'all_registered', publishedAt: new Date() }),
    ]);

    const result = await service.listForParticipant(plainUser, 'tournament-1');

    expect(result.items).toEqual([]);
  });

  // ─── listByTournament ─────────────────────────────────────────────────────────

  it('listByTournament: non-admin → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(
      service.listByTournament(plainUser, 'tournament-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentAnnouncement.findMany).not.toHaveBeenCalled();
  });

  it('listByTournament: support admin can read (read-only gate)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([]);
    const result = await service.listByTournament(supportAuthUser, 'tournament-1');
    expect(result).toEqual({ items: [] });
  });

  it('listByTournament: unknown tournament → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(
      service.listByTournament(ownerAuthUser, 'ghost'),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect(prisma.v1TournamentAnnouncement.findMany).not.toHaveBeenCalled();
  });

  it('listByTournament: returns drafts and published ordered newest-first', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });

    const draft = announcementRow({
      id: 'ann-draft',
      publishedAt: null,
      createdAt: new Date('2026-06-14T10:00:00.000Z'),
      updatedAt: new Date('2026-06-14T10:00:00.000Z'),
    });
    const published = announcementRow({
      id: 'ann-pub',
      publishedAt: new Date('2026-06-13T09:00:00.000Z'),
      createdAt: new Date('2026-06-13T08:00:00.000Z'),
      updatedAt: new Date('2026-06-13T09:00:00.000Z'),
    });
    // Prisma returns newest-first; we trust the orderBy and just mock that order.
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([draft, published]);

    const result = await service.listByTournament(ownerAuthUser, 'tournament-1');

    expect(result.items).toHaveLength(2);
    // Newest first: draft (createdAt 10:00) before published (createdAt 08:00)
    expect(result.items[0].id).toBe('ann-draft');
    expect(result.items[0].publishedAt).toBeNull();
    expect(result.items[1].id).toBe('ann-pub');
    expect(result.items[1].publishedAt).toBe('2026-06-13T09:00:00.000Z');
  });

  it('listByTournament: scoped to the given tournamentId only', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([]);

    await service.listByTournament(ownerAuthUser, 'tournament-1');

    expect(prisma.v1TournamentAnnouncement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tournamentId: 'tournament-1' }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('listByTournament: serializes all required fields including category', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    const row = announcementRow({
      category: 'venue',
      publishedAt: new Date('2026-06-14T12:00:00.000Z'),
    });
    prisma.v1TournamentAnnouncement.findMany.mockResolvedValue([row]);

    const result = await service.listByTournament(ownerAuthUser, 'tournament-1');

    const item = result.items[0];
    expect(item).toMatchObject({
      id: 'ann-1',
      title: '경기 일정 공지',
      body: '7월 1일 오전 10시 시작합니다.',
      category: 'venue',
      audience: 'all_registered',
      publishedAt: '2026-06-14T12:00:00.000Z',
      createdAt: '2026-06-14T00:00:00.000Z',
    });
  });

  // ─── admin-role gates ─────────────────────────────────────────────────────────

  it('create: non-admin → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(
      service.create(plainUser, 'tournament-1', { title: 'x', body: 'y' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentAnnouncement.create).not.toHaveBeenCalled();
  });

  it('create: support admin cannot mutate → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    await expect(
      service.create(supportAuthUser, 'tournament-1', { title: 'x', body: 'y' }),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('publish: non-admin → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.publish(plainUser, 'ann-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  it('create: tournament not found → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(
      service.create(ownerAuthUser, 'ghost', { title: 'x', body: 'y' }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect(prisma.v1TournamentAnnouncement.create).not.toHaveBeenCalled();
  });

  it('create: publish=false → publishedAt is null (draft)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    const row = announcementRow();
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(row);

    const result = await service.create(ownerAuthUser, 'tournament-1', {
      title: '경기 일정 공지',
      body: '내용',
      publish: false,
    });

    expect(result).toMatchObject({ id: 'ann-1', publishedAt: null });
    const createArgs = prisma.v1TournamentAnnouncement.create.mock.calls[0][0];
    expect(createArgs.data.publishedAt).toBeNull();
  });

  it('create: publish=true → publishedAt is set to a date string (immediate publish)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    const now = new Date();
    const row = announcementRow({ publishedAt: now });
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(row);

    const result = await service.create(ownerAuthUser, 'tournament-1', {
      title: '경기 일정 공지',
      body: '내용',
      publish: true,
    });

    expect(result.publishedAt).toBe(now.toISOString());
    const createArgs = prisma.v1TournamentAnnouncement.create.mock.calls[0][0];
    expect(createArgs.data.publishedAt).toBeInstanceOf(Date);
  });

  it('create: publish=true emits tournament_announcement_published to matching registrants', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(
      announcementRow({ publishedAt: new Date(), audience: 'confirmed_only' }),
    );

    await service.create(ownerAuthUser, 'tournament-1', {
      title: '경기 일정 공지',
      body: '내용',
      audience: 'confirmed_only',
      publish: true,
    });

    expect(notifications.emitToManyDeferred).toHaveBeenCalledTimes(1);
    const [resolveUserIds, type, targetId, body] = notifications.emitToManyDeferred.mock.calls[0];
    expect(type).toBe('tournament_announcement_published');
    expect(targetId).toBe('tournament-1');
    expect(body).toContain('경기 일정 공지');

    await resolveUserIds();
    expect(prisma.v1TournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tournamentId: 'tournament-1', status: { in: ['confirmed'] } }),
      }),
    );
  });

  it('create: publish=false does NOT emit a notification', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(announcementRow({ publishedAt: null }));

    await service.create(ownerAuthUser, 'tournament-1', { title: 'x', body: 'y', publish: false });

    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });

  it('create: audience defaults to all_registered when not supplied', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(announcementRow());

    await service.create(ownerAuthUser, 'tournament-1', {
      title: 'x',
      body: 'y',
    });

    const createArgs = prisma.v1TournamentAnnouncement.create.mock.calls[0][0];
    expect(createArgs.data.audience).toBe('all_registered');
  });

  it('create: stores and returns the supplied announcement category', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(
      announcementRow({ category: 'sponsor' }),
    );
    const dto = {
      title: '협찬 이벤트',
      body: '현장 이벤트는 이 공지에서만 안내합니다.',
      category: 'sponsor' as const,
    };

    const result = await service.create(ownerAuthUser, 'tournament-1', dto);

    expect(result).toMatchObject({ id: 'ann-1', category: 'sponsor' });
    const createArgs = prisma.v1TournamentAnnouncement.create.mock.calls[0][0];
    expect(createArgs.data.category).toBe('sponsor');
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          afterJson: expect.objectContaining({ category: 'sponsor' }),
        }),
      }),
    );
  });

  it('create: accepts public audience for logged-out tournament detail visibility', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(
      announcementRow({ audience: 'public' }),
    );

    await service.create(ownerAuthUser, 'tournament-1', {
      title: 'public',
      body: 'body',
      audience: 'public',
    });

    const createArgs = prisma.v1TournamentAnnouncement.create.mock.calls[0][0];
    expect(createArgs.data.audience).toBe('public');
  });

  it('create: writes audit log with action=tournament_announcement.create', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentAnnouncement.create.mockResolvedValue(announcementRow());

    await service.create(ownerAuthUser, 'tournament-1', { title: 'x', body: 'y' });

    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament_announcement.create',
          targetType: 'tournament_announcement',
        }),
      }),
    );
  });

  // ─── publish ──────────────────────────────────────────────────────────────────

  it('publish: unknown announcementId → 404 ANNOUNCEMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(null);
    await expect(service.publish(ownerAuthUser, 'ghost')).rejects.toMatchObject({
      response: { code: 'ANNOUNCEMENT_NOT_FOUND' },
    });
  });

  it('publish: already published → alreadyPublished=true (idempotent, no DB write)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    const publishedRow = announcementRow({
      publishedAt: new Date('2026-06-10T00:00:00Z'),
    });
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(publishedRow);

    const result = await service.publish(ownerAuthUser, 'ann-1');

    expect(result.alreadyPublished).toBe(true);
    expect(prisma.v1TournamentAnnouncement.update).not.toHaveBeenCalled();
  });

  it('publish: unpublished → publishedAt set, alreadyPublished=false, audit log written', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(announcementRow());
    const updatedRow = announcementRow({ publishedAt: new Date() });
    prisma.v1TournamentAnnouncement.update.mockResolvedValue(updatedRow);

    const result = await service.publish(ownerAuthUser, 'ann-1');

    expect(result.alreadyPublished).toBe(false);
    expect(result.publishedAt).not.toBeNull();
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament_announcement.publish',
          targetType: 'tournament_announcement',
        }),
      }),
    );
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function),
      'tournament_announcement_published',
      'tournament-1',
      expect.stringContaining('경기 일정 공지'),
    );
  });

  it('publish: already published → no duplicate notification', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(
      announcementRow({ publishedAt: new Date('2026-06-10T00:00:00Z') }),
    );

    await service.publish(ownerAuthUser, 'ann-1');

    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });
  it('update: support admin cannot mutate', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    await expect(
      service.update(supportAuthUser, 'ann-1', { title: 'x', body: 'y' }),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('update: unknown announcementId returns ANNOUNCEMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(null);

    await expect(
      service.update(ownerAuthUser, 'ghost', { title: 'updated', body: 'body' }),
    ).rejects.toMatchObject({ response: { code: 'ANNOUNCEMENT_NOT_FOUND' } });
  });

  it('update: edits content and can publish a draft', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(announcementRow());
    prisma.v1TournamentAnnouncement.update.mockResolvedValue(
      announcementRow({
        title: 'updated',
        body: 'updated body',
        audience: 'confirmed_only',
        publishedAt: new Date(),
      }),
    );

    const result = await service.update(ownerAuthUser, 'ann-1', {
      title: 'updated',
      body: 'updated body',
      audience: 'confirmed_only',
      publish: true,
    });

    expect(result).toMatchObject({
      id: 'ann-1',
      title: 'updated',
      body: 'updated body',
      audience: 'confirmed_only',
    });
    const updateArgs = prisma.v1TournamentAnnouncement.update.mock.calls[0][0];
    expect(updateArgs.data.publishedAt).toBeInstanceOf(Date);
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament_announcement.update',
          targetType: 'tournament_announcement',
        }),
      }),
    );
  });

  it('update: category is persisted when provided', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(announcementRow());
    prisma.v1TournamentAnnouncement.update.mockResolvedValue(
      announcementRow({ category: 'venue' }),
    );

    await service.update(ownerAuthUser, 'ann-1', {
      title: '경기 일정 공지',
      body: '수정된 본문',
      category: 'venue',
    });

    const updateArgs = prisma.v1TournamentAnnouncement.update.mock.calls[0][0];
    expect(updateArgs.data.category).toBe('venue');
  });

  it('update: category omitted keeps the existing category', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(
      announcementRow({ category: 'sponsor' }),
    );
    prisma.v1TournamentAnnouncement.update.mockResolvedValue(
      announcementRow({ category: 'sponsor' }),
    );

    await service.update(ownerAuthUser, 'ann-1', {
      title: '경기 일정 공지',
      body: '수정된 본문',
    });

    const updateArgs = prisma.v1TournamentAnnouncement.update.mock.calls[0][0];
    expect(updateArgs.data.category).toBe('sponsor');
  });

  it('update: can move a published announcement back to draft', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(
      announcementRow({ publishedAt: new Date('2026-06-10T00:00:00Z') }),
    );
    prisma.v1TournamentAnnouncement.update.mockResolvedValue(
      announcementRow({ title: 'draft again', body: 'body', publishedAt: null }),
    );

    await service.update(ownerAuthUser, 'ann-1', {
      title: 'draft again',
      body: 'body',
      publish: false,
    });

    const updateArgs = prisma.v1TournamentAnnouncement.update.mock.calls[0][0];
    expect(updateArgs.data.publishedAt).toBeNull();
    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });

  it('update: draft → publish=true (newly published) emits notification', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(
      announcementRow({ publishedAt: null }),
    );
    prisma.v1TournamentAnnouncement.update.mockResolvedValue(
      announcementRow({ publishedAt: new Date() }),
    );

    await service.update(ownerAuthUser, 'ann-1', {
      title: '경기 일정 공지',
      body: '내용',
      publish: true,
    });

    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function),
      'tournament_announcement_published',
      'tournament-1',
      expect.any(String),
    );
  });

  it('update: already-published announcement re-saved with publish=true does NOT re-notify', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(
      announcementRow({ publishedAt: new Date('2026-06-10T00:00:00Z') }),
    );
    prisma.v1TournamentAnnouncement.update.mockResolvedValue(
      announcementRow({ title: 'edited', publishedAt: new Date('2026-06-10T00:00:00Z') }),
    );

    await service.update(ownerAuthUser, 'ann-1', {
      title: 'edited',
      body: 'body',
      publish: true,
    });

    expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
  });

  it('remove: unknown announcementId returns ANNOUNCEMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(null);

    await expect(service.remove(ownerAuthUser, 'ghost')).rejects.toMatchObject({
      response: { code: 'ANNOUNCEMENT_NOT_FOUND' },
    });
    expect(prisma.v1TournamentAnnouncement.delete).not.toHaveBeenCalled();
  });

  it('remove: deletes announcement and writes audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAnnouncement.findUnique.mockResolvedValue(announcementRow());
    prisma.v1TournamentAnnouncement.delete.mockResolvedValue(announcementRow());

    const result = await service.remove(ownerAuthUser, 'ann-1');

    expect(result).toEqual({
      id: 'ann-1',
      tournamentId: 'tournament-1',
      deleted: true,
    });
    expect(prisma.v1TournamentAnnouncement.delete).toHaveBeenCalledWith({
      where: { id: 'ann-1' },
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament_announcement.delete',
          targetType: 'tournament_announcement',
        }),
      }),
    );
  });
});
