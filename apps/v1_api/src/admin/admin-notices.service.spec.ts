import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

const adminAuthUser = {
  id: 'admin-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const activeOpsAdminRecord = {
  id: 'admin-record-id',
  userId: 'admin-user-id',
  adminRole: 'ops' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

const activeSupportAdminRecord = {
  ...activeOpsAdminRecord,
  adminRole: 'support' as const,
};

function makeNoticeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notice-1',
    audience: 'public',
    category: '안내',
    title: '서비스 안내',
    body: '공지 본문',
    status: 'published',
    publishedAt: new Date('2026-07-13T00:00:00.000Z'),
    archivedAt: null,
    createdAt: new Date('2026-07-13T00:00:00.000Z'),
    updatedAt: new Date('2026-07-13T00:00:00.000Z'),
    ...overrides,
  };
}

function makePopupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'popup-1',
    audience: 'public',
    title: '서비스 점검',
    body: '팝업 본문',
    targetScreens: ['home'],
    linkUrl: null,
    linkLabel: null,
    status: 'published',
    publishedAt: new Date('2026-07-13T00:00:00.000Z'),
    archivedAt: null,
    displayStartAt: new Date('2026-07-14T00:00:00.000Z'),
    displayEndAt: new Date('2026-07-20T00:00:00.000Z'),
    createdAt: new Date('2026-07-13T00:00:00.000Z'),
    updatedAt: new Date('2026-07-13T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AdminService — notices and popups', () => {
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Notice: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    v1Popup: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Notice: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      v1Popup: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      v1AdminActionLog: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  it('lists notices without popup display-window state', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Notice.findMany.mockResolvedValue([makeNoticeRow()]);

    const result = await service.listNotices(adminAuthUser, { category: '안내' });

    expect(prisma.v1Notice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ category: '안내' }),
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      noticeId: 'notice-1',
      category: '안내',
      title: '서비스 안내',
    }));
    expect(result.items[0]).not.toHaveProperty('popupId');
    expect(result.items[0]).not.toHaveProperty('displayStartAt');
  });

  it('creates a notice only in v1_notices', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Notice.create.mockImplementation(async ({ data }) => makeNoticeRow({ ...data, id: 'notice-new' }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-notice' });

    await service.createNotice(adminAuthUser, {
      audience: 'public',
      category: '업데이트',
      title: ' 새 공지 ',
      body: ' 공지 본문 ',
      status: 'published',
    });

    expect(prisma.v1Notice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ category: '업데이트', title: '새 공지', body: '공지 본문' }),
    });
    expect(prisma.v1Popup.create).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'notice.create', targetType: 'notice' }),
    });
  });

  it('lists popups from the independent popup table', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.findMany.mockResolvedValue([makePopupRow()]);

    const result = await service.listPopups(adminAuthUser, { status: 'published', q: '점검' });

    expect(prisma.v1Popup.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'published', OR: expect.any(Array) }),
    }));
    expect(prisma.v1Notice.findMany).not.toHaveBeenCalled();
    expect(result.items[0]).toEqual(expect.objectContaining({
      popupId: 'popup-1',
      title: '서비스 점검',
      displayStartAt: new Date('2026-07-14T00:00:00.000Z'),
    }));
  });

  it('creates a popup only in v1_popups and records a popup audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.create.mockImplementation(async ({ data }) => makePopupRow({ ...data, id: 'popup-new' }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-popup' });

    const result = await service.createPopup(adminAuthUser, {
      audience: 'public',
      title: ' 새 팝업 ',
      body: ' 팝업 본문 ',
      targetScreens: ['matches', 'teams'],
      linkUrl: '/matches',
      linkLabel: '매치 보기',
      status: 'published',
      displayStartAt: '2026-07-14T00:00:00.000Z',
      displayEndAt: '2026-07-20T00:00:00.000Z',
    });

    expect(prisma.v1Popup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '새 팝업',
        body: '팝업 본문',
        targetScreens: ['matches', 'teams'],
        linkUrl: '/matches',
        linkLabel: '매치 보기',
        displayStartAt: new Date('2026-07-14T00:00:00.000Z'),
        displayEndAt: new Date('2026-07-20T00:00:00.000Z'),
      }),
    });
    expect(prisma.v1Notice.create).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'popup.create', targetType: 'popup', targetId: 'popup-new' }),
    });
    expect(result.popup.popupId).toBe('popup-new');
  });

  it('rejects an invalid popup display window', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);

    await expect(service.createPopup(adminAuthUser, {
      audience: 'public',
      title: '잘못된 기간',
      body: '본문',
      targetScreens: ['home'],
      status: 'published',
      displayStartAt: '2026-07-20T00:00:00.000Z',
      displayEndAt: '2026-07-20T00:00:00.000Z',
    })).rejects.toThrow(BadRequestException);

    expect(prisma.v1Popup.create).not.toHaveBeenCalled();
  });

  it('updates popup state without mutating notices', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.findUnique.mockResolvedValue(makePopupRow());
    prisma.v1Popup.update.mockImplementation(async ({ data }) => makePopupRow({ ...data }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-update' });

    await service.updatePopup(adminAuthUser, 'popup-1', {
      audience: 'public',
      title: '비공개 팝업',
      body: '본문',
      targetScreens: ['home'],
      linkUrl: null,
      linkLabel: null,
      status: 'archived',
      displayStartAt: null,
      displayEndAt: null,
    });

    expect(prisma.v1Popup.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'popup-1' },
      data: expect.objectContaining({ status: 'archived', publishedAt: null, archivedAt: expect.any(Date) }),
    }));
    expect(prisma.v1Notice.update).not.toHaveBeenCalled();
  });

  it('rejects a popup without any target screen', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);

    await expect(service.createPopup(adminAuthUser, {
      audience: 'public',
      title: '대상 없는 팝업',
      body: '본문',
      targetScreens: [],
      status: 'published',
      displayStartAt: null,
      displayEndAt: null,
    })).rejects.toThrow(BadRequestException);

    expect(prisma.v1Popup.create).not.toHaveBeenCalled();
  });

  it('rejects an unsafe popup link scheme', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);

    await expect(service.createPopup(adminAuthUser, {
      audience: 'public',
      title: '잘못된 링크',
      body: '본문',
      targetScreens: ['home'],
      linkUrl: 'javascript:alert(1)',
      linkLabel: '열기',
      status: 'published',
      displayStartAt: null,
      displayEndAt: null,
    })).rejects.toThrow(BadRequestException);

    expect(prisma.v1Popup.create).not.toHaveBeenCalled();
  });

  it('denies popup mutations to support admins', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeSupportAdminRecord);

    await expect(service.deletePopup(adminAuthUser, 'popup-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.v1Popup.delete).not.toHaveBeenCalled();
  });

  it('deletes a popup with a popup-specific audit record', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.findUnique.mockResolvedValue(makePopupRow());
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-delete' });
    prisma.v1Popup.delete.mockResolvedValue(makePopupRow());

    await expect(service.deletePopup(adminAuthUser, 'popup-1')).resolves.toEqual({
      popupId: 'popup-1',
      deleted: true,
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'popup.delete', targetType: 'popup', targetId: 'popup-1' }),
    });
  });
});
