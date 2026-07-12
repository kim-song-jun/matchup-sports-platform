import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

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

const activeOpsAdminRecord = {
  id: 'admin-record-id',
  userId: 'admin-user-id',
  adminRole: 'ops' as const,
  status: 'active' as const,
};

const activeSupportAdminRecord = {
  ...activeOpsAdminRecord,
  adminRole: 'support' as const,
};

function makeNoticeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notice-1',
    audience: 'public',
    category: '고정',
    title: '이번 주 고정 공지',
    body: '체크인 안내',
    status: 'published',
    publishedAt: new Date('2026-05-18T00:00:00.000Z'),
    archivedAt: null,
    createdAt: new Date('2026-05-18T00:00:00.000Z'),
    updatedAt: new Date('2026-05-18T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AdminService — notices', () => {
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Notice: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Notice: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      v1AdminActionLog: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  it('listNotices throws 403 for non-admin', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(service.listNotices(nonAdminAuthUser, {})).rejects.toThrow(ForbiddenException);
  });

  it('listNotices returns admin notice rows with pinned state', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Notice.findMany.mockResolvedValue([makeNoticeRow()]);

    const result = await service.listNotices(adminAuthUser, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      noticeId: 'notice-1',
      audience: 'public',
      category: '고정',
      pinned: true,
      title: '이번 주 고정 공지',
      status: 'published',
    });
    expect(result.pageInfo).toEqual({ nextCursor: null, hasNext: false });
  });

  it('listNotices passes filters, search and cursor to Prisma', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Notice.findMany.mockResolvedValue([]);

    await service.listNotices(adminAuthUser, {
      status: 'published',
      audience: 'public',
      category: '고정',
      q: '체크인',
      cursor: 'notice-cursor',
      limit: 10,
    });

    expect(prisma.v1Notice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'published',
          audience: 'public',
          category: '고정',
          OR: expect.any(Array),
        }),
        cursor: { id: 'notice-cursor' },
        skip: 1,
        take: 11,
      }),
    );
  });

  it('createNotice throws 403 for support admins', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeSupportAdminRecord);

    await expect(
      service.createNotice(adminAuthUser, {
        audience: 'public',
        category: '안내',
        pinned: false,
        title: '초안',
        body: '본문',
        status: 'draft',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('createNotice stores pinned notices as category 고정 and writes an admin action log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Notice.create.mockImplementation(async ({ data }) => makeNoticeRow({ ...data, id: 'notice-new' }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-1' });

    const result = await service.createNotice(adminAuthUser, {
      audience: 'public',
      category: '안내',
      pinned: true,
      title: ' 새 고정 공지 ',
      body: ' 공지 본문 ',
      status: 'published',
    });

    expect(prisma.v1Notice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        audience: 'public',
        category: '고정',
        title: '새 고정 공지',
        body: '공지 본문',
        status: 'published',
        publishedAt: expect.any(Date),
      }),
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: 'admin-record-id',
        action: 'notice.create',
        targetType: 'notice',
        targetId: 'notice-new',
      }),
    });
    expect(result.notice).toMatchObject({
      noticeId: 'notice-new',
      category: '고정',
      pinned: true,
      title: '새 고정 공지',
    });
  });

  it('updateNotice updates notice content, pinned category, and writes an admin action log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Notice.findUnique.mockResolvedValue(makeNoticeRow({ category: '안내', status: 'draft', publishedAt: null }));
    prisma.v1Notice.update.mockImplementation(async ({ data }) => makeNoticeRow({ ...data, id: 'notice-1' }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-2' });

    const result = await service.updateNotice(adminAuthUser, 'notice-1', {
      audience: 'public',
      category: '안내',
      pinned: true,
      title: ' 수정 공지 ',
      body: ' 첫 줄\n둘째 줄 ',
      status: 'published',
    });

    expect(prisma.v1Notice.update).toHaveBeenCalledWith({
      where: { id: 'notice-1' },
      data: expect.objectContaining({
        audience: 'public',
        category: '고정',
        title: '수정 공지',
        body: '첫 줄\n둘째 줄',
        status: 'published',
        publishedAt: expect.any(Date),
        archivedAt: null,
      }),
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: 'admin-record-id',
        action: 'notice.update',
        targetType: 'notice',
        targetId: 'notice-1',
      }),
    });
    expect(result.notice).toMatchObject({
      noticeId: 'notice-1',
      category: '고정',
      pinned: true,
      title: '수정 공지',
      body: '첫 줄\n둘째 줄',
    });
  });

  it('updateNotice throws 404 when notice is missing', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Notice.findUnique.mockResolvedValue(null);

    await expect(
      service.updateNotice(adminAuthUser, 'missing', {
        audience: 'public',
        category: '안내',
        pinned: false,
        title: '수정 공지',
        body: '본문',
        status: 'draft',
      }),
    ).rejects.toThrow('Notice was not found');
  });
});
