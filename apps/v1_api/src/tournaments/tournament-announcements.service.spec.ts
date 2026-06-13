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
import { TournamentAnnouncementsService } from './tournament-announcements.service';

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
};
const supportAdminRecord = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
};

function announcementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ann-1',
    tournamentId: 'tournament-1',
    title: '경기 일정 공지',
    body: '7월 1일 오전 10시 시작합니다.',
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
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentAnnouncement: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      v1AdminActionLog: {
        create: jest.fn().mockResolvedValue({ id: 'action-log-1' }),
      },
      v1StatusChangeLog: {
        create: jest.fn().mockResolvedValue({ id: 'status-log-1' }),
      },
      $transaction: jest.fn(),
    };
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof p) => Promise<unknown>) => cb(p),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentAnnouncementsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentAnnouncementsService);
  });

  afterEach(() => jest.clearAllMocks());

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
  });
});
