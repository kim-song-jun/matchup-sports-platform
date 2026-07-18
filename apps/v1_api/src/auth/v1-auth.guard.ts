import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
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

type V1Request = Request & { v1User?: V1AuthUser };

@Injectable()
export class V1AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<V1Request>();
    const identity = resolveV1RequestIdentity(
      request,
      currentRuntimeConfiguration(),
    );

    if (!identity) {
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

    if (['suspended', 'blocked', 'deleted'].includes(user.accountStatus)) {
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
