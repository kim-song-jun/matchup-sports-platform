import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { V1AuthGuard } from './v1-auth.guard';

describe('V1AuthGuard managed-terms gate', () => {
  const prisma = {
    v1User: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@teameet.v1',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      }),
    },
  };
  const managedTerms = { signupCompliance: jest.fn() };
  const guard = new V1AuthGuard(
    prisma as unknown as PrismaService,
    managedTerms as unknown as ManagedTermsRuntimeService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('blocks protected API access and returns the renewal route when a required document is pending', async () => {
    managedTerms.signupCompliance.mockResolvedValue({
      compliant: false,
      pendingRequiredDocumentIds: ['document-new'],
      nextRoute: '/terms?mode=renewal',
    });

    await expect(guard.canActivate(context('/api/v1/profile'))).rejects.toMatchObject({
      response: {
        code: 'TERMS_RECONSENT_REQUIRED',
        details: {
          pendingDocumentIds: ['document-new'],
          next: { route: '/terms?mode=renewal' },
        },
      },
    });
  });

  it('keeps auth/me and the consent endpoint reachable while renewal is pending', async () => {
    managedTerms.signupCompliance.mockRejectedValue(new ForbiddenException());

    await expect(guard.canActivate(context('/api/v1/auth/me'))).resolves.toBe(true);
    await expect(guard.canActivate(context('/api/v1/terms/consents'))).resolves.toBe(true);
    expect(managedTerms.signupCompliance).not.toHaveBeenCalled();
  });

  function context(url: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: url,
          url,
          headers: { 'x-v1-user-id': 'user-1' },
          header: (name: string) =>
            name.toLowerCase() === 'x-v1-user-id' ? 'user-1' : undefined,
        }),
      }),
    } as never;
  }
});
