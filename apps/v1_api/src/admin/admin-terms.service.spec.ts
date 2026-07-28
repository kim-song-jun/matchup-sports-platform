import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminTermsService } from './admin-terms.service';

describe('AdminTermsService', () => {
  const user = { id: 'user-1' } as never;
  const admin = { id: 'admin-1', userId: 'user-1', adminRole: 'ops', status: 'active' } as const;
  const now = new Date('2026-07-22T00:00:00.000Z');
  const placement = {
    id: 'placement-1',
    policyId: 'policy-1',
    context: 'signup',
    requirement: 'required',
    displayOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const document = {
    id: 'document-1',
    policyId: 'policy-1',
    version: 'v1.1',
    title: '서비스 이용약관',
    subtitle: '서비스 이용 기준',
    content: '본문',
    contentHash: 'hash',
    changeSummary: null,
    status: 'published',
    effectiveAt: now,
    requiresReconsent: true,
    enforcementAt: now,
    publishedAt: now,
    archivedAt: null,
    supersedesDocumentId: null,
    createdAt: now,
    updatedAt: now,
    _count: { consentEvents: 9 },
  };
  const policy = {
    id: 'policy-1',
    code: 'signup_service_terms',
    name: '회원가입 서비스 이용약관',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    placements: [placement],
    documents: [document],
  };

  const prisma = {
    v1ManagedTermsPolicy: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    v1ManagedTermsPlacement: {
      deleteMany: jest.fn(),
    },
    v1ManagedTermsDocument: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const adminContext = {
    getActiveAdmin: jest.fn(),
    getMutationAdmin: jest.fn(),
    logAdminAction: jest.fn(),
  };
  let service: AdminTermsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    adminContext.getActiveAdmin.mockResolvedValue(admin);
    adminContext.getMutationAdmin.mockResolvedValue(admin);
    adminContext.logAdminAction.mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null });
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const module = await Test.createTestingModule({
      providers: [
        AdminTermsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminContextService, useValue: adminContext },
      ],
    }).compile();
    service = module.get(AdminTermsService);
  });

  it('allows active support admins to read policies with versioned consent counts', async () => {
    prisma.v1ManagedTermsPolicy.findMany.mockResolvedValue([policy]);

    const result = await service.list(user, {});

    expect(adminContext.getActiveAdmin).toHaveBeenCalledWith('user-1');
    expect(adminContext.getMutationAdmin).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      policyId: 'policy-1',
      currentDocumentId: 'document-1',
      documents: [{ documentId: 'document-1', consentEventCount: 9 }],
    });
  });

  it('rejects edits to a published document before any write or audit log', async () => {
    prisma.v1ManagedTermsDocument.findFirst.mockResolvedValue(document);

    await expect(
      service.updateDraft(user, 'policy-1', 'document-1', {
        version: 'v1.1',
        title: '변경',
        content: '변경 본문',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });

  it('rejects display-only consent placements before any write', async () => {
    await expect(
      service.createPolicy(user, {
        code: 'invalid_signup_policy',
        name: '잘못된 회원가입 약관',
        placements: [
          {
            context: 'signup',
            requirement: 'display_only',
            displayOrder: 0,
            isActive: true,
          },
        ],
        version: 'v1.1',
        title: '잘못된 약관',
        content: '본문',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(adminContext.getMutationAdmin).toHaveBeenCalledWith('user-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('publishes a draft, archives the previous published version, and writes audit in one transaction', async () => {
    const draft = {
      ...document,
      id: 'document-2',
      version: 'v1.2',
      status: 'draft',
      publishedAt: null,
      effectiveAt: null,
      _count: undefined,
    };
    const publishedDraft = { ...draft, status: 'published', publishedAt: now };
    const updatedPolicy = {
      ...policy,
      documents: [{ ...document, status: 'archived', archivedAt: now }, { ...publishedDraft, _count: { consentEvents: 0 } }],
    };
    prisma.v1ManagedTermsDocument.findFirst.mockResolvedValue(draft);
    prisma.v1ManagedTermsDocument.findMany.mockResolvedValue([{ id: 'document-1' }]);
    prisma.v1ManagedTermsDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1ManagedTermsDocument.update.mockResolvedValue(publishedDraft);
    prisma.v1ManagedTermsPolicy.findUniqueOrThrow.mockResolvedValue(updatedPolicy);

    const result = await service.changeStatus(user, 'policy-1', 'document-2', {
      status: 'published',
      reason: '개인정보 항목 개정',
    });

    expect(adminContext.getMutationAdmin).toHaveBeenCalledWith('user-1');
    expect(prisma.v1ManagedTermsDocument.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['document-1'] } },
      data: { status: 'archived', archivedAt: expect.any(Date) },
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        action: 'managed_terms.document.published',
        reason: '개인정보 항목 개정',
        fromStatus: 'draft',
        toStatus: 'published',
      }),
      prisma,
    );
    expect(result.currentDocumentId).toBe('document-2');
  });

  it('creates new versions as drafts and never rewrites the published document', async () => {
    prisma.v1ManagedTermsPolicy.findUnique.mockResolvedValue(policy);
    const created = {
      ...document,
      id: 'document-2',
      version: 'v1.2',
      title: '개정 약관',
      content: '개정 본문',
      contentHash: 'new-hash',
      status: 'draft',
      publishedAt: null,
      effectiveAt: null,
      supersedesDocumentId: 'document-1',
      _count: undefined,
    };
    prisma.v1ManagedTermsDocument.create.mockResolvedValue(created);
    prisma.v1ManagedTermsPolicy.findUniqueOrThrow.mockResolvedValue({
      ...policy,
      documents: [document, { ...created, _count: { consentEvents: 0 } }],
    });

    await service.createVersion(user, 'policy-1', {
      version: 'v1.2',
      title: '개정 약관',
      content: '개정 본문',
      changeSummary: '영상 항목 추가',
      requiresReconsent: false,
      enforcementAt: '2026-07-30T00:00:00.000Z',
    });

    expect(prisma.v1ManagedTermsDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        policyId: 'policy-1',
        version: 'v1.2',
        status: 'draft',
        requiresReconsent: false,
        enforcementAt: new Date('2026-07-30T00:00:00.000Z'),
        supersedesDocumentId: 'document-1',
      }),
    });
    expect(prisma.v1ManagedTermsDocument.update).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'managed_terms.document.create' }),
      prisma,
    );
  });

  it('publishes a future-effective version without archiving the currently effective version', async () => {
    const future = new Date('2026-08-01T00:00:00.000Z');
    const draft = {
      ...document,
      id: 'document-2',
      version: 'v1.2',
      status: 'draft',
      effectiveAt: future,
      publishedAt: null,
      _count: undefined,
    };
    prisma.v1ManagedTermsDocument.findFirst.mockResolvedValue(draft);
    prisma.v1ManagedTermsDocument.findMany.mockResolvedValue([]);
    prisma.v1ManagedTermsDocument.updateMany.mockResolvedValue({ count: 0 });
    prisma.v1ManagedTermsDocument.update.mockResolvedValue({
      ...draft,
      status: 'published',
      publishedAt: now,
    });
    prisma.v1ManagedTermsPolicy.findUniqueOrThrow.mockResolvedValue({
      ...policy,
      documents: [
        document,
        { ...draft, status: 'published', publishedAt: now, _count: { consentEvents: 0 } },
      ],
    });

    const result = await service.changeStatus(user, 'policy-1', 'document-2', {
      status: 'published',
      reason: '예약 발행 검증',
    });

    expect(prisma.v1ManagedTermsDocument.findMany).toHaveBeenCalledWith({
      where: {
        policyId: 'policy-1',
        status: 'published',
        id: { not: 'document-2' },
        effectiveAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(prisma.v1ManagedTermsDocument.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [] } },
      data: { status: 'archived', archivedAt: expect.any(Date) },
    });
    expect(result.currentDocumentId).toBe('document-1');
  });
});
