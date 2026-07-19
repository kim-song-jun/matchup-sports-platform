import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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
};

const activeSupportAdminRecord = {
  ...activeOpsAdminRecord,
  adminRole: 'support' as const,
};

const assetId = '123e4567-e89b-42d3-a456-426614174000';
const assetUrl = `/uploads/2026/07/${assetId}.webp`;

function makeContentAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: assetId,
    url: assetUrl,
    status: 'temporary',
    uploadedByAdminUserId: activeOpsAdminRecord.id,
    noticeId: null,
    popupId: null,
    ...overrides,
  };
}

function makeTiptapImageContent() {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'Managed popup image' }] },
      { type: 'paragraph' },
      {
        type: 'image',
        attrs: {
          assetId,
          src: assetUrl,
          alt: 'Managed popup image',
          title: null,
          width: null,
          height: null,
        },
      },
    ],
  };
}

function makeNoticeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notice-1',
    audience: 'public',
    category: '안내',
    title: '서비스 안내',
    body: '공지 본문',
    contentJson: null,
    contentVersion: 1,
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
    contentJson: null,
    contentVersion: 1,
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
    v1Notice: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; groupBy: jest.Mock };
    v1Popup: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; groupBy: jest.Mock };
    v1ContentAsset: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; updateMany: jest.Mock; deleteMany: jest.Mock; delete: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Notice: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      v1Popup: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      v1ContentAsset: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn(),
      },
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
    prisma.v1Notice.groupBy
      .mockResolvedValueOnce([
        { status: 'published', _count: { _all: 6 } },
        { status: 'draft', _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { audience: 'public', _count: { _all: 5 } },
        { audience: 'admins', _count: { _all: 1 } },
      ]);

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
    expect(result.summary).toEqual({
      total: 8,
      byStatus: { published: 6, draft: 2, archived: 0 },
      byAudience: { public: 5, users: 0, admins: 1 },
    });
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

  it('claims a managed image referenced by rich notice content', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Notice.create.mockImplementation(async ({ data }) => makeNoticeRow({ ...data, id: 'notice-rich' }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-rich-notice' });
    prisma.v1ContentAsset.findMany
      .mockResolvedValueOnce([{
        id: '123e4567-e89b-42d3-a456-426614174000',
        url: '/uploads/2026/07/123e4567-e89b-42d3-a456-426614174000.webp',
        status: 'temporary',
        uploadedByAdminUserId: activeOpsAdminRecord.id,
        noticeId: null,
        popupId: null,
      }])
      .mockResolvedValueOnce([]);
    prisma.v1ContentAsset.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.createNotice(adminAuthUser, {
      audience: 'public',
      category: '안내',
      title: 'Rich notice',
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Managed image' }] },
          {
            type: 'image',
            attrs: {
              assetId: '123e4567-e89b-42d3-a456-426614174000',
              src: '/uploads/2026/07/123e4567-e89b-42d3-a456-426614174000.webp',
              alt: 'QA image',
            },
          },
        ],
      },
      status: 'draft',
    });

    expect(prisma.v1ContentAsset.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['123e4567-e89b-42d3-a456-426614174000'] } },
      data: expect.objectContaining({
        status: 'attached',
        noticeId: 'notice-rich',
        popupId: null,
        attachedAt: expect.any(Date),
      }),
    });
  });

  it('creates a popup with actual Tiptap image defaults and stores canonical content', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.create.mockImplementation(async ({ data }) => makePopupRow({ ...data, id: 'popup-rich' }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-rich-popup' });
    prisma.v1ContentAsset.findMany
      .mockResolvedValueOnce([makeContentAsset()])
      .mockResolvedValueOnce([]);
    prisma.v1ContentAsset.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.createPopup(adminAuthUser, {
      audience: 'public',
      title: 'Rich popup',
      content: makeTiptapImageContent(),
      targetScreens: ['home'],
      status: 'draft',
    });

    expect(prisma.v1Popup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentJson: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Managed popup image' }] },
            { type: 'paragraph', content: [] },
            { type: 'image', attrs: { assetId, src: assetUrl, alt: 'Managed popup image' } },
          ],
        },
      }),
    });
    expect(prisma.v1ContentAsset.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [assetId] } },
      data: expect.objectContaining({ status: 'attached', noticeId: null, popupId: 'popup-rich' }),
    });
  });

  it('rejects a managed image whose stored URL differs from the document URL', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.create.mockImplementation(async ({ data }) => makePopupRow({ ...data, id: 'popup-rich' }));
    prisma.v1ContentAsset.findMany.mockResolvedValueOnce([makeContentAsset({ url: '/uploads/2026/07/different.webp' })]);

    await expect(service.createPopup(adminAuthUser, {
      audience: 'public',
      title: 'URL mismatch',
      content: makeTiptapImageContent(),
      targetScreens: ['home'],
      status: 'draft',
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CONTENT_ASSET_URL_MISMATCH' }) });
    expect(prisma.v1ContentAsset.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an image uploaded by another admin or attached to another entity', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.create.mockImplementation(async ({ data }) => makePopupRow({ ...data, id: 'popup-rich' }));
    prisma.v1ContentAsset.findMany.mockResolvedValueOnce([
      makeContentAsset({ status: 'attached', uploadedByAdminUserId: 'other-admin', noticeId: 'notice-other' }),
    ]);

    await expect(service.createPopup(adminAuthUser, {
      audience: 'public',
      title: 'Unavailable image',
      content: makeTiptapImageContent(),
      targetScreens: ['home'],
      status: 'draft',
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CONTENT_ASSET_UNAVAILABLE' }) });
    expect(prisma.v1ContentAsset.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an image attachment race when not every requested asset is claimed', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.create.mockImplementation(async ({ data }) => makePopupRow({ ...data, id: 'popup-rich' }));
    prisma.v1ContentAsset.findMany
      .mockResolvedValueOnce([makeContentAsset()])
      .mockResolvedValueOnce([]);
    prisma.v1ContentAsset.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.createPopup(adminAuthUser, {
      audience: 'public',
      title: 'Attachment race',
      content: makeTiptapImageContent(),
      targetScreens: ['home'],
      status: 'draft',
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CONTENT_ASSET_UNAVAILABLE' }) });
  });

  it('removes a detached popup image record and stored file after update', async () => {
    const removeStoredUrl = jest.fn().mockResolvedValue(undefined);
    const imageService = new AdminService(prisma as unknown as PrismaService, { removeStoredUrl } as any);
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.findUnique.mockResolvedValue(makePopupRow());
    prisma.v1Popup.update.mockImplementation(async ({ data }) => makePopupRow({ ...data }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-remove-popup-image' });
    prisma.v1ContentAsset.findMany.mockResolvedValueOnce([{ id: assetId, url: assetUrl }]);
    prisma.v1ContentAsset.deleteMany.mockResolvedValueOnce({ count: 1 });

    await imageService.updatePopup(adminAuthUser, 'popup-1', {
      audience: 'public',
      title: 'Image removed',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text only' }] }] },
      targetScreens: ['home'],
      status: 'draft',
    });

    expect(prisma.v1ContentAsset.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [assetId] } } });
    expect(removeStoredUrl).toHaveBeenCalledWith(assetUrl);
  });

  it('keeps an image already attached to the popup during an update', async () => {
    const removeStoredUrl = jest.fn().mockResolvedValue(undefined);
    const imageService = new AdminService(prisma as unknown as PrismaService, { removeStoredUrl } as any);
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.findUnique.mockResolvedValue(makePopupRow());
    prisma.v1Popup.update.mockImplementation(async ({ data }) => makePopupRow({ ...data }));
    prisma.v1AdminActionLog.create.mockResolvedValue({ id: 'log-keep-popup-image' });
    prisma.v1ContentAsset.findMany
      .mockResolvedValueOnce([makeContentAsset({ status: 'attached', popupId: 'popup-1' })])
      .mockResolvedValueOnce([]);
    prisma.v1ContentAsset.updateMany.mockResolvedValueOnce({ count: 1 });

    await imageService.updatePopup(adminAuthUser, 'popup-1', {
      audience: 'public',
      title: 'Image kept',
      content: makeTiptapImageContent(),
      targetScreens: ['home'],
      status: 'draft',
    });

    expect(prisma.v1ContentAsset.deleteMany).not.toHaveBeenCalled();
    expect(removeStoredUrl).not.toHaveBeenCalled();
  });

  it('stores a temporary content asset and removes the file if DB persistence fails', async () => {
    const storeFiles = jest.fn().mockResolvedValue({ urls: [assetUrl] });
    const removeStoredUrl = jest.fn().mockResolvedValue(undefined);
    const imageService = new AdminService(prisma as unknown as PrismaService, { storeFiles, removeStoredUrl } as any);
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1ContentAsset.findMany.mockResolvedValueOnce([]);
    prisma.v1ContentAsset.create.mockRejectedValueOnce(new Error('db failed'));

    await expect(imageService.createContentAsset(adminAuthUser, [{
      fieldname: 'files',
      originalname: 'popup.webp',
      encoding: '7bit',
      mimetype: 'image/webp',
      size: 128,
      destination: 'uploads',
      filename: 'temporary',
      path: 'uploads/temporary',
    }])).rejects.toThrow('db failed');

    expect(storeFiles).toHaveBeenCalledTimes(1);
    expect(removeStoredUrl).toHaveBeenCalledWith(assetUrl);
  });

  it('prevents direct deletion of an attached content image', async () => {
    const imageService = new AdminService(prisma as unknown as PrismaService, { removeStoredUrl: jest.fn() } as any);
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1ContentAsset.findUnique.mockResolvedValue(makeContentAsset({ status: 'attached', popupId: 'popup-1' }));

    await expect(imageService.deleteContentAsset(adminAuthUser, assetId)).rejects.toThrow(ConflictException);
    expect(prisma.v1ContentAsset.delete).not.toHaveBeenCalled();
  });

  it('cleans only stale temporary assets successfully claimed for deletion', async () => {
    const removeStoredUrl = jest.fn().mockResolvedValue(undefined);
    const cleanupService = new AdminService(
      prisma as unknown as PrismaService,
      { removeStoredUrl } as any,
    );
    prisma.v1ContentAsset.findMany.mockResolvedValueOnce([
      { id: 'temporary-1', url: '/uploads/2026/07/temporary-1.webp' },
      { id: 'attached-during-cleanup', url: '/uploads/2026/07/attached.webp' },
    ]);
    prisma.v1ContentAsset.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await (cleanupService as any).cleanupStaleTemporaryAssets();

    expect(prisma.v1ContentAsset.deleteMany).toHaveBeenCalledTimes(2);
    expect(removeStoredUrl).toHaveBeenCalledTimes(1);
    expect(removeStoredUrl).toHaveBeenCalledWith('/uploads/2026/07/temporary-1.webp');
  });

  it('lists popups from the independent popup table', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdminRecord);
    prisma.v1Popup.findMany.mockResolvedValue([makePopupRow()]);
    prisma.v1Popup.groupBy.mockResolvedValue([
      { status: 'published', _count: { _all: 3 } },
      { status: 'archived', _count: { _all: 1 } },
    ]);

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
    expect(result.summary).toEqual({
      total: 4,
      byStatus: { published: 3, archived: 1, draft: 0 },
    });
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
