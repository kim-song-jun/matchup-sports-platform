import { CanActivate, ExecutionContext, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Request } from 'express';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';

type V1Request = Request & { v1User?: V1AuthUser };

export async function assertCreatorProfileComplete(prisma: PrismaService, userId?: string) {
  const user = userId
    ? await prisma.v1User.findUnique({
        where: { id: userId },
        select: {
          phone: true,
          profile: { select: { realName: true, gender: true } },
        },
      })
    : null;

  const missingFields: Array<'realName' | 'phone' | 'gender'> = [];
  if (!user?.profile?.realName?.trim()) missingFields.push('realName');
  if (!user?.phone?.trim()) missingFields.push('phone');
  if (user?.profile?.gender !== 'male' && user?.profile?.gender !== 'female') missingFields.push('gender');

  if (missingFields.length > 0) {
    throw new UnprocessableEntityException({
      code: 'PROFILE_COMPLETION_REQUIRED',
      message: 'Complete your profile before creating this resource',
      details: {
        missingFields,
        next: { route: '/my/profile/edit' },
      },
    });
  }
}

@Injectable()
export class CreatorProfileGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<V1Request>();
    await assertCreatorProfileComplete(this.prisma, request.v1User?.id);
    return true;
  }
}