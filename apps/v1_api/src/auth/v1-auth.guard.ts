import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPendingSocialSignupRoute,
  isPendingSocialSignupRequestAllowed,
} from './social-signup-access';
import type { V1AuthUser } from './v1-auth-user';
import { currentRuntimeConfiguration, resolveV1RequestIdentity, type V1RequestIdentity } from './v1-session';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { isTermsReconsentRequestAllowed } from '../terms/terms-reconsent-access';

type V1Request = Request & { v1User?: V1AuthUser };

@Injectable()
export class V1AuthGuard implements CanActivate {
  private readonly logger = new Logger(V1AuthGuard.name);
  private readonly managedTerms: ManagedTermsRuntimeService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() managedTerms?: ManagedTermsRuntimeService,
  ) {
    this.managedTerms = managedTerms ?? new ManagedTermsRuntimeService(prisma);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<V1Request>();
    const identity = resolveV1RequestIdentity(
      request,
      currentRuntimeConfiguration(),
    );

    if (!identity) {
      // [authdrop-diag] 임시 진단 — /my 간헐 401 원인 확정용. 확정 후 제거.
      // sessionCookieCount: 0=쿠키 자체가 안 실림(브라우저/수명주기 유실), 1=쿠키는 있는데
      // 서명·만료 검증 실패(서버 secret/토큰 문제), 2+=중복(apex/host-only 충돌).
      const cookieHeader = request.headers?.cookie ?? '';
      const cookieNames = cookieHeader
        .split(';')
        .map((c) => c.split('=')[0].trim())
        .filter(Boolean);
      const sessionCookieCount = cookieNames.filter((name) => name === 'teameet_v1_session').length;
      this.logger.warn(
        `[authdrop-diag] 401 !identity path=${request.originalUrl ?? request.url} ` +
          `sessionCookieCount=${sessionCookieCount} cookieNames=[${cookieNames.join(',')}]`,
      );
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'V1 authentication is required',
      });
    }

    const user = await this.prisma.v1User.findFirst({
      where: identityWhere(identity),
      select: {
        id: true,
        email: true,
        accountStatus: true,
        onboardingStatus: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'V1 user was not found',
      });
    }

    if (['suspended', 'blocked', 'deleted', 'withdrawal_pending'].includes(user.accountStatus)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '이용이 제한된 계정이에요.',
      });
    }

    const pendingSignupRoute = getPendingSocialSignupRoute(user.onboardingStatus);
    if (
      pendingSignupRoute &&
      !isPendingSocialSignupRequestAllowed(user.onboardingStatus, request.originalUrl ?? request.url)
    ) {
      throw new ForbiddenException({
        code: 'SIGNUP_INCOMPLETE',
        message: 'Social signup must be completed before accessing this resource',
        details: { next: { route: pendingSignupRoute } },
      });
    }

    const requestUrl = request.originalUrl ?? request.url;
    if (!pendingSignupRoute && !isTermsReconsentRequestAllowed(requestUrl)) {
      const compliance = await this.managedTerms.signupCompliance(user.id);
      if (!compliance.compliant) {
        throw new ForbiddenException({
          code: 'TERMS_RECONSENT_REQUIRED',
          message: '새 필수 약관에 동의해야 계속할 수 있어요.',
          details: {
            pendingDocumentIds: compliance.pendingRequiredDocumentIds,
            next: { route: compliance.nextRoute },
          },
        });
      }
    }

    request.v1User = user;
    return true;
  }
}

function identityWhere(identity: V1RequestIdentity) {
  switch (identity.kind) {
    case 'user_id':
      return { id: identity.userId };
    case 'email':
      return { email: identity.email };
    default:
      return assertNever(identity);
  }
}

function assertNever(value: never): never {
  return value;
}
