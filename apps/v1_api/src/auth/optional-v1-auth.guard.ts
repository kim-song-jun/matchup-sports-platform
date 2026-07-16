import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPendingSocialSignupRoute,
  isPendingSocialSignupRequestAllowed,
} from './social-signup-access';
import { V1AuthUser } from './v1-auth-user';

type V1Request = Request & { v1User?: V1AuthUser };

@Injectable()
export class OptionalV1AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<V1Request>();
    const userId = getHeader(request, 'x-v1-user-id');
    const email = getHeader(request, 'x-v1-user-email');

    if (!userId && !email) {
      return true;
    }

    const user = await this.prisma.v1User.findFirst({
      where: userId ? { id: userId } : { email: email ?? undefined },
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

    if (['suspended', 'blocked', 'deleted'].includes(user.accountStatus)) {
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

function getHeader(request: Request, name: string): string | null {
  const value = request.header(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
