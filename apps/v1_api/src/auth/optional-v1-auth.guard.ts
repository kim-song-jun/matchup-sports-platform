import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPendingSocialSignupRoute,
  isPendingSocialSignupRequestAllowed,
} from './social-signup-access';
import type { V1AuthUser } from './v1-auth-user';
import { currentRuntimeConfiguration, resolveV1RequestIdentity, type V1RequestIdentity } from './v1-session';

type V1Request = Request & { v1User?: V1AuthUser };

@Injectable()
export class OptionalV1AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<V1Request>();
    const identity = resolveV1RequestIdentity(
      request,
      currentRuntimeConfiguration(),
    );

    if (!identity) {
      return true;
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
      return true;
    }

    if (['suspended', 'blocked', 'deleted', 'withdrawal_pending'].includes(user.accountStatus)) {
      return true;
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
