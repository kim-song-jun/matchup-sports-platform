import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { OptionalV1AuthGuard } from './optional-v1-auth.guard';
import { V1AuthGuard } from './v1-auth.guard';
import { V1_SESSION_COOKIE_NAME, createV1SessionToken } from './v1-session';

const SECRET = 'guard-epoch-spec-session-secret-0123456789abcdef';
const USER = { id: 'user-1', email: 'user@teameet.test', accountStatus: 'active', onboardingStatus: 'completed', phoneVerifiedAt: new Date(), adminUser: null };

describe('session epoch in the HTTP guards', () => {
  const saved = { nodeEnv: process.env.NODE_ENV, secret: process.env.V1_SESSION_SECRET };
  beforeAll(() => {
    process.env.NODE_ENV = 'production';
    process.env.V1_SESSION_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.NODE_ENV = saved.nodeEnv;
    process.env.V1_SESSION_SECRET = saved.secret;
  });

  // The user's current epoch is 2: findFirst only finds the row when the cookie asks for that epoch.
  const prisma = {
    v1User: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; sessionEpoch?: number } }) =>
        where.id === USER.id && where.sessionEpoch === 2 ? USER : null),
    },
  };
  const managedTerms = { signupCompliance: jest.fn().mockResolvedValue({ compliant: true }) };

  function requestWith(sessionEpoch: number) {
    const cookie = `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({ userId: USER.id, sessionEpoch, secret: SECRET })}`;
    const request: Record<string, unknown> = { originalUrl: '/api/v1/auth/me', url: '/api/v1/auth/me', method: 'GET', headers: { cookie }, header: () => undefined };
    return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as never };
  }

  it('lets a cookie issued at the current epoch through', async () => {
    const { request, context } = requestWith(2);
    await expect(new V1AuthGuard(prisma as unknown as PrismaService, managedTerms as unknown as ManagedTermsRuntimeService).canActivate(context)).resolves.toBe(true);
    expect(request.v1User).toMatchObject({ id: USER.id });
  });

  it('rejects a cookie issued before the epoch was bumped with 401', async () => {
    const { context } = requestWith(1);
    await expect(new V1AuthGuard(prisma as unknown as PrismaService, managedTerms as unknown as ManagedTermsRuntimeService).canActivate(context))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('treats a revoked cookie as signed out on optional routes', async () => {
    const { request, context } = requestWith(1);
    await expect(new OptionalV1AuthGuard(prisma as unknown as PrismaService).canActivate(context)).resolves.toBe(true);
    expect(request.v1User).toBeUndefined();
  });
});
