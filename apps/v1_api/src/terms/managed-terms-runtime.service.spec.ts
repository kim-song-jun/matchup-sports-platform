import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from './managed-terms-runtime.service';

describe('ManagedTermsRuntimeService', () => {
  const now = new Date('2026-07-22T03:00:00.000Z');
  const serviceDocumentId = '11111111-1111-4111-8111-111111111111';
  const privacyDocumentId = '22222222-2222-4222-8222-222222222222';
  const prisma = {
    v1ManagedTermsPolicy: { findMany: jest.fn() },
    v1ManagedTermsConsentEvent: { findMany: jest.fn(), createMany: jest.fn() },
  };
  let service: ManagedTermsRuntimeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.v1ManagedTermsConsentEvent.findMany.mockResolvedValue([]);
    prisma.v1ManagedTermsConsentEvent.createMany.mockResolvedValue({ count: 1 });
    const module = await Test.createTestingModule({
      providers: [
        ManagedTermsRuntimeService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ManagedTermsRuntimeService);
  });

  it('keeps previously accepted current terms checked and marks only the new required policy pending', async () => {
    prisma.v1ManagedTermsPolicy.findMany.mockResolvedValue([
      policy('service', serviceDocumentId, 0),
      policy('privacy_extra', privacyDocumentId, 1),
    ]);
    prisma.v1ManagedTermsConsentEvent.findMany.mockResolvedValue([
      event(serviceDocumentId, 'policy-service', 'accepted'),
    ]);

    const result = await service.currentSignupTerms('user-1', now);

    expect(result.items).toEqual([
      expect.objectContaining({ documentId: serviceDocumentId, accepted: true, requiresAction: false }),
      expect.objectContaining({ documentId: privacyDocumentId, accepted: false, requiresAction: true }),
    ]);
    expect(result.compliance).toEqual({
      compliant: false,
      pendingRequiredDocumentIds: [privacyDocumentId],
      nextRoute: '/terms?mode=renewal',
    });
  });

  it('allows an earlier policy-version acceptance when the current version does not require re-consent', async () => {
    const current = policy('service', serviceDocumentId, 0);
    current.documents[0].requiresReconsent = false;
    prisma.v1ManagedTermsPolicy.findMany.mockResolvedValue([current]);
    prisma.v1ManagedTermsConsentEvent.findMany.mockResolvedValue([
      event('33333333-3333-4333-8333-333333333333', 'policy-service', 'accepted'),
    ]);

    const result = await service.currentSignupTerms('user-1', now);

    expect(result.items[0]).toMatchObject({ accepted: true, requiresAction: false });
    expect(result.compliance?.compliant).toBe(true);
  });

  it('does not block existing users before the configured enforcement time', async () => {
    const current = policy('service', serviceDocumentId, 0);
    current.documents[0].enforcementAt = new Date('2026-07-23T00:00:00.000Z');
    prisma.v1ManagedTermsPolicy.findMany.mockResolvedValue([current]);

    const result = await service.currentSignupTerms('user-1', now);

    expect(result.items[0]).toMatchObject({ accepted: false, requiresAction: false });
    expect(result.compliance?.compliant).toBe(true);
  });

  it('queries only published versions whose effective time has arrived', async () => {
    prisma.v1ManagedTermsPolicy.findMany.mockResolvedValue([
      policy('service', serviceDocumentId, 0),
    ]);

    await service.currentSignupTerms(undefined, now);

    expect(prisma.v1ManagedTermsPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          documents: expect.objectContaining({
            where: {
              status: 'published',
              OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
            },
          }),
        }),
      }),
    );
  });

  it('rejects stale or incomplete document sets before a signup write', async () => {
    prisma.v1ManagedTermsPolicy.findMany.mockResolvedValue([
      policy('service', serviceDocumentId, 0),
      policy('privacy_extra', privacyDocumentId, 1),
    ]);

    await expect(service.assertSignupAcceptances([serviceDocumentId])).rejects.toMatchObject({
      response: { code: 'TERMS_REQUIRED' },
    });
    await expect(
      service.assertSignupAcceptances(['44444444-4444-4444-8444-444444444444']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.v1ManagedTermsConsentEvent.createMany).not.toHaveBeenCalled();
  });

  it('records only append-only verified web events for the selected current documents', async () => {
    prisma.v1ManagedTermsPolicy.findMany.mockResolvedValue([
      policy('service', serviceDocumentId, 0),
    ]);
    prisma.v1ManagedTermsConsentEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        event(serviceDocumentId, 'policy-service', 'accepted'),
      ]);

    const result = await service.acceptSignupTerms('user-1', [serviceDocumentId]);

    expect(prisma.v1ManagedTermsConsentEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        documentId: serviceDocumentId,
        userId: 'user-1',
        context: 'signup',
        decision: 'accepted',
        source: 'web',
        versionVerified: true,
      })],
      skipDuplicates: true,
    });
    expect(result.compliance?.compliant).toBe(true);
  });

  it('records an unchecked signup optional policy as not_accepted', async () => {
    prisma.v1ManagedTermsPolicy.findMany.mockResolvedValue([
      policy('service', serviceDocumentId, 0),
      policy('location', privacyDocumentId, 1, 'optional'),
    ]);
    prisma.v1ManagedTermsConsentEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        event(serviceDocumentId, 'policy-service', 'accepted'),
        event(privacyDocumentId, 'policy-location', 'not_accepted'),
      ]);

    await service.acceptSignupTerms('user-1', [serviceDocumentId]);

    expect(prisma.v1ManagedTermsConsentEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          documentId: serviceDocumentId,
          decision: 'accepted',
        }),
        expect.objectContaining({
          documentId: privacyDocumentId,
          decision: 'not_accepted',
        }),
      ],
      skipDuplicates: true,
    });
  });

  function policy(
    code: string,
    documentId: string,
    displayOrder: number,
    requirement: 'required' | 'optional' = 'required',
  ) {
    return {
      id: `policy-${code}`,
      code,
      name: code,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      placements: [{
        id: `placement-${code}`,
        policyId: `policy-${code}`,
        context: 'signup',
        requirement,
        displayOrder,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }],
      documents: [{
        id: documentId,
        policyId: `policy-${code}`,
        version: 'v1.1',
        title: code,
        subtitle: `${code} subtitle`,
        content: `${code} content`,
        contentHash: 'hash',
        changeSummary: null,
        requiresReconsent: true,
        enforcementAt: null as Date | null,
        status: 'published',
        effectiveAt: now,
        publishedAt: now,
        archivedAt: null,
        supersedesDocumentId: null,
        createdAt: now,
        updatedAt: now,
      }],
    };
  }

  function event(
    documentId: string,
    policyId: string,
    decision: 'accepted' | 'not_accepted' | 'revoked',
  ) {
    return {
      id: `event-${documentId}`,
      documentId,
      userId: 'user-1',
      context: 'signup',
      decision,
      decidedAt: now,
      recordedAt: now,
      source: 'web',
      versionVerified: true,
      legacyUserConsentId: null,
      tournamentRegistrationId: null,
      teamId: null,
      legacyBooleanValue: null,
      dedupeKey: null,
      createdAt: now,
      document: { policyId },
    };
  }
});
