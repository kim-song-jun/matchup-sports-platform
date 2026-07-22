import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminTermsListQueryDto,
  ChangeAdminTermsDocumentStatusDto,
  CreateAdminTermsPolicyDto,
  CreateAdminTermsVersionDto,
  UpdateAdminTermsDraftDto,
  UpdateAdminTermsPolicyDto,
} from './dto/admin-terms.dto';

const POLICY_INCLUDE = {
  placements: { orderBy: [{ context: 'asc' as const }, { displayOrder: 'asc' as const }] },
  documents: {
    orderBy: [{ createdAt: 'desc' as const }],
    include: { _count: { select: { consentEvents: true } } },
  },
} satisfies Prisma.V1ManagedTermsPolicyInclude;

type PolicyRecord = Prisma.V1ManagedTermsPolicyGetPayload<{ include: typeof POLICY_INCLUDE }>;

@Injectable()
export class AdminTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async list(user: V1AuthUser, query: AdminTermsListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const q = query.q?.trim();
    const where: Prisma.V1ManagedTermsPolicyWhereInput = {
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { documents: { some: { title: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      ...(query.context ? { placements: { some: { context: query.context } } } : {}),
      ...(query.status ? { documents: { some: { status: query.status } } } : {}),
    };
    const rows = await this.prisma.v1ManagedTermsPolicy.findMany({
      where,
      include: POLICY_INCLUDE,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return {
      items: rows.map((row) => this.serializePolicy(row)),
      summary: {
        total: rows.length,
        active: rows.filter((row) => row.isActive).length,
        draftDocuments: rows.reduce(
          (sum, row) => sum + row.documents.filter((document) => document.status === 'draft').length,
          0,
        ),
      },
    };
  }

  async detail(user: V1AuthUser, policyId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.serializePolicy(await this.getPolicy(policyId));
  }

  async createPolicy(user: V1AuthUser, dto: CreateAdminTermsPolicyDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    this.assertPlacements(dto.placements);
    const now = new Date();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const policy = await tx.v1ManagedTermsPolicy.create({
          data: {
            code: dto.code,
            name: dto.name.trim(),
            placements: {
              create: dto.placements.map((placement) => ({
                context: placement.context,
                requirement: placement.requirement,
                displayOrder: placement.displayOrder,
                isActive: placement.isActive,
              })),
            },
            documents: {
              create: {
                version: dto.version.trim(),
                title: dto.title.trim(),
                subtitle: dto.subtitle?.trim() || null,
                content: dto.content,
                contentHash: this.hash(dto.content),
                changeSummary: dto.changeSummary?.trim() || null,
                effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
                requiresReconsent: dto.requiresReconsent ?? true,
                enforcementAt: dto.enforcementAt ? new Date(dto.enforcementAt) : null,
                status: 'draft',
              },
            },
          },
          include: POLICY_INCLUDE,
        });
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'managed_terms.policy.create',
            targetType: 'managed_terms_policy',
            targetId: policy.id,
            afterJson: this.auditPolicy(policy),
          },
          tx,
        );
        return policy;
      });
      return this.serializePolicy(created);
    } catch (error) {
      this.rethrowUnique(error, '같은 정책 코드 또는 버전이 이미 있어요.');
    }
  }

  async updatePolicy(user: V1AuthUser, policyId: string, dto: UpdateAdminTermsPolicyDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    this.assertPlacements(dto.placements);
    const before = await this.getPolicy(policyId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.v1ManagedTermsPlacement.deleteMany({ where: { policyId } });
      const policy = await tx.v1ManagedTermsPolicy.update({
        where: { id: policyId },
        data: {
          name: dto.name.trim(),
          isActive: dto.isActive,
          placements: {
            create: dto.placements.map((placement) => ({
              context: placement.context,
              requirement: placement.requirement,
              displayOrder: placement.displayOrder,
              isActive: placement.isActive,
            })),
          },
        },
        include: POLICY_INCLUDE,
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'managed_terms.policy.update',
          targetType: 'managed_terms_policy',
          targetId: policyId,
          beforeJson: this.auditPolicy(before),
          afterJson: this.auditPolicy(policy),
        },
        tx,
      );
      return policy;
    });
    return this.serializePolicy(updated);
  }

  async createVersion(user: V1AuthUser, policyId: string, dto: CreateAdminTermsVersionDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const before = await this.getPolicy(policyId);
    const supersedes = this.currentPublishedDocument(before.documents) ?? null;
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const document = await tx.v1ManagedTermsDocument.create({
          data: {
            policyId,
            version: dto.version.trim(),
            title: dto.title.trim(),
            subtitle: dto.subtitle?.trim() || null,
            content: dto.content,
            contentHash: this.hash(dto.content),
            changeSummary: dto.changeSummary?.trim() || null,
            effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
            requiresReconsent: dto.requiresReconsent ?? true,
            enforcementAt: dto.enforcementAt ? new Date(dto.enforcementAt) : null,
            supersedesDocumentId: supersedes?.id ?? null,
            status: 'draft',
          },
        });
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'managed_terms.document.create',
            targetType: 'managed_terms_document',
            targetId: document.id,
            afterJson: this.auditDocument(document),
          },
          tx,
        );
        return tx.v1ManagedTermsPolicy.findUniqueOrThrow({
          where: { id: policyId },
          include: POLICY_INCLUDE,
        });
      });
      return this.serializePolicy(updated);
    } catch (error) {
      this.rethrowUnique(error, '이 정책에 같은 버전이 이미 있어요.');
    }
  }

  async updateDraft(
    user: V1AuthUser,
    policyId: string,
    documentId: string,
    dto: UpdateAdminTermsDraftDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const document = await this.getDocument(policyId, documentId);
    if (document.status !== 'draft') {
      throw new ConflictException({
        code: 'MANAGED_TERMS_PUBLISHED_IMMUTABLE',
        message: '발행·보관된 버전은 수정할 수 없어요. 새 버전을 만들어 주세요.',
      });
    }
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.v1ManagedTermsDocument.update({
          where: { id: documentId },
          data: {
            version: dto.version.trim(),
            title: dto.title.trim(),
            subtitle: dto.subtitle?.trim() || null,
            content: dto.content,
            contentHash: this.hash(dto.content),
            changeSummary: dto.changeSummary?.trim() || null,
            effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
            requiresReconsent: dto.requiresReconsent ?? true,
            enforcementAt: dto.enforcementAt ? new Date(dto.enforcementAt) : null,
          },
        });
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'managed_terms.document.update_draft',
            targetType: 'managed_terms_document',
            targetId: documentId,
            beforeJson: this.auditDocument(document),
            afterJson: this.auditDocument(result),
          },
          tx,
        );
        return tx.v1ManagedTermsPolicy.findUniqueOrThrow({
          where: { id: policyId },
          include: POLICY_INCLUDE,
        });
      });
      return this.serializePolicy(updated);
    } catch (error) {
      this.rethrowUnique(error, '이 정책에 같은 버전이 이미 있어요.');
    }
  }

  async changeStatus(
    user: V1AuthUser,
    policyId: string,
    documentId: string,
    dto: ChangeAdminTermsDocumentStatusDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const document = await this.getDocument(policyId, documentId);
    if (document.status === dto.status) return this.serializePolicy(await this.getPolicy(policyId));
    if (document.status === 'archived') {
      throw new ConflictException({
        code: 'MANAGED_TERMS_ARCHIVED_IMMUTABLE',
        message: '보관된 버전은 다시 상태를 변경할 수 없어요.',
      });
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const archivedIds: string[] = [];
      if (dto.status === 'published') {
        const scheduled = Boolean(document.effectiveAt && document.effectiveAt.getTime() > now.getTime());
        const published = await tx.v1ManagedTermsDocument.findMany({
          where: {
            policyId,
            status: 'published',
            id: { not: documentId },
            ...(scheduled
              ? { effectiveAt: { gt: now } }
              : { OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] }),
          },
          select: { id: true },
        });
        archivedIds.push(...published.map((item) => item.id));
        await tx.v1ManagedTermsDocument.updateMany({
          where: { id: { in: archivedIds } },
          data: { status: 'archived', archivedAt: now },
        });
      }
      const result = await tx.v1ManagedTermsDocument.update({
        where: { id: documentId },
        data:
          dto.status === 'published'
            ? { status: 'published', publishedAt: now, archivedAt: null }
            : { status: 'archived', archivedAt: now },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: `managed_terms.document.${dto.status}`,
          targetType: 'managed_terms_document',
          targetId: documentId,
          reason: dto.reason.trim(),
          beforeJson: this.auditDocument(document),
          afterJson: {
            ...this.auditDocument(result),
            automaticallyArchivedDocumentIds: archivedIds,
          },
          fromStatus: document.status,
          toStatus: dto.status,
        },
        tx,
      );
      return tx.v1ManagedTermsPolicy.findUniqueOrThrow({
        where: { id: policyId },
        include: POLICY_INCLUDE,
      });
    });
    return this.serializePolicy(updated);
  }

  private async getPolicy(policyId: string) {
    const policy = await this.prisma.v1ManagedTermsPolicy.findUnique({
      where: { id: policyId },
      include: POLICY_INCLUDE,
    });
    if (!policy) {
      throw new NotFoundException({
        code: 'MANAGED_TERMS_POLICY_NOT_FOUND',
        message: '약관 정책을 찾을 수 없어요.',
      });
    }
    return policy;
  }

  private async getDocument(policyId: string, documentId: string) {
    const document = await this.prisma.v1ManagedTermsDocument.findFirst({
      where: { id: documentId, policyId },
    });
    if (!document) {
      throw new NotFoundException({
        code: 'MANAGED_TERMS_DOCUMENT_NOT_FOUND',
        message: '약관 버전을 찾을 수 없어요.',
      });
    }
    return document;
  }

  private serializePolicy(policy: PolicyRecord) {
    const published = this.currentPublishedDocument(policy.documents);
    return {
      policyId: policy.id,
      code: policy.code,
      name: policy.name,
      isActive: policy.isActive,
      currentDocumentId: published?.id ?? null,
      placements: policy.placements.map((placement) => ({
        placementId: placement.id,
        context: placement.context,
        requirement: placement.requirement,
        displayOrder: placement.displayOrder,
        isActive: placement.isActive,
      })),
      documents: policy.documents.map((document) => ({
        documentId: document.id,
        version: document.version,
        title: document.title,
        subtitle: document.subtitle,
        content: document.content,
        contentHash: document.contentHash,
        changeSummary: document.changeSummary,
        requiresReconsent: document.requiresReconsent,
        enforcementAt: document.enforcementAt?.toISOString() ?? null,
        status: document.status,
        effectiveAt: document.effectiveAt?.toISOString() ?? null,
        publishedAt: document.publishedAt?.toISOString() ?? null,
        archivedAt: document.archivedAt?.toISOString() ?? null,
        supersedesDocumentId: document.supersedesDocumentId,
        consentEventCount: document._count.consentEvents,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      })),
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  private currentPublishedDocument<T extends {
    status: string;
    effectiveAt: Date | null;
    publishedAt: Date | null;
    createdAt: Date;
  }>(documents: T[], now = new Date()) {
    return documents
      .filter(
        (document) =>
          document.status === 'published'
          && (!document.effectiveAt || document.effectiveAt.getTime() <= now.getTime()),
      )
      .sort((a, b) => {
        const effective = (b.effectiveAt?.getTime() ?? 0) - (a.effectiveAt?.getTime() ?? 0);
        if (effective !== 0) return effective;
        return (b.publishedAt ?? b.createdAt).getTime() - (a.publishedAt ?? a.createdAt).getTime();
      })[0];
  }

  private auditPolicy(policy: PolicyRecord): Prisma.InputJsonObject {
    return {
      code: policy.code,
      name: policy.name,
      isActive: policy.isActive,
      placements: policy.placements.map((placement) => ({
        context: placement.context,
        requirement: placement.requirement,
        displayOrder: placement.displayOrder,
        isActive: placement.isActive,
      })),
      documentIds: policy.documents.map((document) => document.id),
    };
  }

  private auditDocument(document: {
    id: string;
    policyId: string;
    version: string;
    title: string;
    subtitle: string | null;
    contentHash: string;
    changeSummary: string | null;
    requiresReconsent: boolean;
    enforcementAt: Date | null;
    status: string;
    effectiveAt: Date | null;
    publishedAt: Date | null;
    archivedAt: Date | null;
    supersedesDocumentId: string | null;
  }): Prisma.InputJsonObject {
    return {
      policyId: document.policyId,
      version: document.version,
      title: document.title,
      subtitle: document.subtitle,
      contentHash: document.contentHash,
      changeSummary: document.changeSummary,
      requiresReconsent: document.requiresReconsent,
      enforcementAt: document.enforcementAt?.toISOString() ?? null,
      status: document.status,
      effectiveAt: document.effectiveAt?.toISOString() ?? null,
      publishedAt: document.publishedAt?.toISOString() ?? null,
      archivedAt: document.archivedAt?.toISOString() ?? null,
      supersedesDocumentId: document.supersedesDocumentId,
    };
  }

  private hash(content: string) {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private assertPlacements(
    placements: Array<{ context: string; requirement: string }>,
  ) {
    if (new Set(placements.map((placement) => placement.context)).size !== placements.length) {
      throw new BadRequestException({
        code: 'MANAGED_TERMS_DUPLICATE_CONTEXT',
        message: '같은 노출 위치를 한 정책에 두 번 지정할 수 없어요.',
      });
    }
    const invalid = placements.find(
      (placement) =>
        (placement.context === 'footer' && placement.requirement !== 'display_only') ||
        (placement.context !== 'footer' && placement.requirement === 'display_only'),
    );
    if (invalid) {
      throw new BadRequestException({
        code: 'MANAGED_TERMS_INVALID_REQUIREMENT',
        message: '하단 메뉴는 열람 전용, 회원가입과 대회 신청은 필수 또는 선택으로 설정해 주세요.',
      });
    }
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({ code: 'MANAGED_TERMS_DUPLICATE', message });
    }
    throw error;
  }
}
