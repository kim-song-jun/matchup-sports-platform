import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, V1ManagedTermsContext } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ConsentWriter = Pick<Prisma.TransactionClient, 'v1ManagedTermsConsentEvent'>;

@Injectable()
export class ManagedTermsRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async currentTerms(context: V1ManagedTermsContext, userId?: string, now = new Date()) {
    const policies = await this.prisma.v1ManagedTermsPolicy.findMany({
      where: {
        isActive: true,
        placements: { some: { context, isActive: true } },
      },
      include: {
        placements: {
          where: { context, isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
        documents: {
          where: {
            status: 'published',
            OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
          },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });

    const current = policies
      .map((policy) => ({ policy, placement: policy.placements[0], document: policy.documents[0] }))
      .filter((row) => row.placement && row.document)
      .sort((a, b) => a.placement.displayOrder - b.placement.displayOrder);

    const latestByDocument = new Map<string, { decision: string; at: number }>();
    const latestByPolicy = new Map<string, { decision: string; at: number }>();
    if (userId && context !== 'footer' && current.length > 0) {
      const events = await this.prisma.v1ManagedTermsConsentEvent.findMany({
        where: {
          userId,
          context,
          document: { policyId: { in: current.map((row) => row.policy.id) } },
        },
        include: { document: { select: { policyId: true } } },
      });
      for (const event of events) {
        const at = (event.decidedAt ?? event.recordedAt).getTime();
        setLatest(latestByDocument, event.documentId, event.decision, at);
        setLatest(latestByPolicy, event.document.policyId, event.decision, at);
      }
    }

    const items = current.map(({ policy, placement, document }) => {
      const exactAccepted = latestByDocument.get(document.id)?.decision === 'accepted';
      const policyAccepted = latestByPolicy.get(policy.id)?.decision === 'accepted';
      const accepted = document.requiresReconsent ? exactAccepted : policyAccepted;
      const enforced = !document.enforcementAt || document.enforcementAt.getTime() <= now.getTime();
      const requiresAction = Boolean(
        userId && placement.requirement === 'required' && enforced && !accepted,
      );
      return {
        policyId: policy.id,
        code: policy.code,
        documentId: document.id,
        version: document.version,
        title: document.title,
        subtitle: document.subtitle,
        content: document.content,
        changeSummary: document.changeSummary,
        requirement: placement.requirement,
        displayOrder: placement.displayOrder,
        requiresReconsent: document.requiresReconsent,
        enforcementAt: document.enforcementAt?.toISOString() ?? null,
        effectiveAt: document.effectiveAt?.toISOString() ?? null,
        accepted,
        requiresAction,
      };
    });
    const pendingRequiredDocumentIds = items
      .filter((item) => item.requiresAction)
      .map((item) => item.documentId);

    return {
      context,
      ready: context === 'footer' || items.some((item) => item.requirement === 'required'),
      items,
      compliance: userId && context === 'signup'
        ? {
            compliant: pendingRequiredDocumentIds.length === 0,
            pendingRequiredDocumentIds,
            nextRoute:
              pendingRequiredDocumentIds.length > 0 ? '/terms?mode=renewal' : null,
          }
        : null,
    };
  }

  currentSignupTerms(userId?: string, now = new Date()) {
    return this.currentTerms('signup', userId, now);
  }

  currentTournamentTerms(now = new Date()) {
    return this.currentTerms('tournament_application', undefined, now);
  }

  async signupCompliance(userId: string) {
    const current = await this.currentSignupTerms(userId);
    return current.compliance ?? {
      compliant: false,
      pendingRequiredDocumentIds: [],
      nextRoute: '/terms?mode=renewal',
    };
  }

  async assertSignupAcceptances(documentIds: string[], userId?: string) {
    const uniqueIds = [...new Set(documentIds)];
    const current = await this.currentSignupTerms(userId);
    if (!current.ready) {
      throw new ConflictException({
        code: 'TERMS_NOT_READY',
        message: '현재 발행된 회원가입 필수 약관이 없어요.',
      });
    }
    const currentIds = new Set(current.items.map((item) => item.documentId));
    const unknownIds = uniqueIds.filter((id) => !currentIds.has(id));
    if (unknownIds.length > 0) {
      throw new BadRequestException({
        code: 'TERMS_DOCUMENT_STALE',
        message: '현재 약관 목록과 일치하지 않아요. 약관을 다시 확인해 주세요.',
        details: { unknownDocumentIds: unknownIds },
      });
    }
    const missingRequiredDocumentIds = current.items
      .filter(
        (item) =>
          item.requirement === 'required' && !item.accepted && !uniqueIds.includes(item.documentId),
      )
      .map((item) => item.documentId);
    if (missingRequiredDocumentIds.length > 0) {
      throw new BadRequestException({
        code: 'TERMS_REQUIRED',
        message: '필수 약관에 모두 동의해야 계속할 수 있어요.',
        details: { pendingDocumentIds: missingRequiredDocumentIds },
      });
    }
    return {
      acceptedDocumentIds: uniqueIds,
      notAcceptedDocumentIds: current.items
        .filter(
          (item) =>
            item.requirement === 'optional'
            && !item.accepted
            && !uniqueIds.includes(item.documentId),
        )
        .map((item) => item.documentId),
    };
  }

  async acceptSignupTerms(userId: string, documentIds: string[]) {
    const decisions = await this.assertSignupAcceptances(documentIds, userId);
    await this.recordSignupDecisions(this.prisma, userId, decisions);
    return this.currentSignupTerms(userId);
  }

  async assertTournamentAcceptances(documentIds: string[]) {
    const uniqueIds = [...new Set(documentIds)];
    const current = await this.currentTournamentTerms();
    if (!current.ready) {
      throw new ConflictException({
        code: 'TERMS_NOT_READY',
        message: '현재 발행된 대회 신청 필수 약관이 없어요.',
      });
    }
    const currentIds = new Set(current.items.map((item) => item.documentId));
    const unknownDocumentIds = uniqueIds.filter((id) => !currentIds.has(id));
    if (unknownDocumentIds.length > 0) {
      throw new BadRequestException({
        code: 'TERMS_DOCUMENT_STALE',
        message: '현재 대회 약관 목록과 일치하지 않아요. 약관을 다시 확인해 주세요.',
        details: { unknownDocumentIds },
      });
    }
    const missingRequiredDocumentIds = current.items
      .filter((item) => item.requirement === 'required' && !uniqueIds.includes(item.documentId))
      .map((item) => item.documentId);
    if (missingRequiredDocumentIds.length > 0) {
      throw new BadRequestException({
        code: 'AGREEMENTS_REQUIRED',
        message: '필수 동의 항목에 모두 동의해 주세요.',
        details: { pendingDocumentIds: missingRequiredDocumentIds },
      });
    }
    return {
      current,
      acceptedDocumentIds: uniqueIds,
      notAcceptedDocumentIds: current.items
        .filter((item) => item.requirement === 'optional' && !uniqueIds.includes(item.documentId))
        .map((item) => item.documentId),
      acceptedCodes: new Set(
        current.items.filter((item) => uniqueIds.includes(item.documentId)).map((item) => item.code),
      ),
    };
  }

  async recordTournamentDecisions(
    writer: ConsentWriter,
    userId: string,
    registrationId: string,
    teamId: string,
    decisions: { acceptedDocumentIds: string[]; notAcceptedDocumentIds: string[] },
    decidedAt = new Date(),
  ) {
    const events = [
      ...decisions.acceptedDocumentIds.map((documentId) => ({
        documentId,
        decision: 'accepted' as const,
      })),
      ...decisions.notAcceptedDocumentIds.map((documentId) => ({
        documentId,
        decision: 'not_accepted' as const,
      })),
    ];
    if (events.length === 0) return;
    await writer.v1ManagedTermsConsentEvent.createMany({
      data: events.map((event) => ({
        documentId: event.documentId,
        userId,
        context: 'tournament_application',
        decision: event.decision,
        decidedAt,
        source: 'web',
        versionVerified: true,
        tournamentRegistrationId: registrationId,
        teamId,
        dedupeKey: `web:tournament_application:${registrationId}:${event.documentId}:${event.decision}`,
      })),
      skipDuplicates: true,
    });
  }

  async recordSignupDecisions(
    writer: ConsentWriter,
    userId: string,
    decisions: {
      acceptedDocumentIds: string[];
      notAcceptedDocumentIds: string[];
    },
    decidedAt = new Date(),
  ) {
    const events = [
      ...decisions.acceptedDocumentIds.map((documentId) => ({
        documentId,
        decision: 'accepted' as const,
      })),
      ...decisions.notAcceptedDocumentIds.map((documentId) => ({
        documentId,
        decision: 'not_accepted' as const,
      })),
    ];
    if (events.length === 0) return;
    await writer.v1ManagedTermsConsentEvent.createMany({
      data: events.map((event) => ({
        documentId: event.documentId,
        userId,
        context: 'signup',
        decision: event.decision,
        decidedAt,
        source: 'web',
        versionVerified: true,
        dedupeKey: `web:signup:${userId}:${event.documentId}:${event.decision}`,
      })),
      skipDuplicates: true,
    });
  }
}

function setLatest(
  target: Map<string, { decision: string; at: number }>,
  key: string,
  decision: string,
  at: number,
) {
  const previous = target.get(key);
  if (!previous || at >= previous.at) target.set(key, { decision, at });
}
