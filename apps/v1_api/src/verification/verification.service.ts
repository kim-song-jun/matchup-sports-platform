import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1AuthProvider, V1VerificationChannel } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../auth/password-hash';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PhoneVerificationService } from './phone-verification.service';
import { VerificationDispatcherService } from './verification-dispatcher.service';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: VerificationDispatcherService,
    private readonly phoneVerification: PhoneVerificationService,
  ) {}

  async requestEmail(authUser: V1AuthUser) {
    const user = await this.loadUser(authUser.id);
    if (!user.email) {
      throw new BadRequestException({
        code: 'EMAIL_REQUIRED',
        message: '인증할 이메일이 없어요. 이메일을 먼저 등록해 주세요.',
      });
    }
    if (user.emailVerifiedAt) {
      return { sent: false, alreadyVerified: true, channel: 'email' as const };
    }
    return this.issue('email', user.id, user.email);
  }

  async requestPhone(authUser: V1AuthUser, phone: string, channel: 'mobile' | 'desktop') {
    const user = await this.loadUser(authUser.id);
    const owner = await this.prisma.v1User.findFirst({
      where: { phone, id: { not: user.id } },
      select: { id: true },
    });
    if (owner) {
      throw new ConflictException({
        code: 'PHONE_CONFLICT',
        message: '이미 다른 계정에서 사용 중인 번호예요.',
      });
    }
    if (user.phoneVerifiedAt && user.phone === phone) {
      return { sent: false, alreadyVerified: true, channel: 'phone' as const };
    }
    return this.phoneVerification.issueChallenge(phone, channel);
  }

  async confirmPhoneArrived(authUser: V1AuthUser, phone: string) {
    const arrived = await this.phoneVerification.pollArrived(phone);
    if (!arrived) return { verified: false as const };

    const owner = await this.prisma.v1User.findFirst({ where: { phone, id: { not: authUser.id } }, select: { id: true } });
    if (owner) {
      throw new ConflictException({ code: 'PHONE_CONFLICT', message: '이미 다른 계정에서 사용 중인 번호예요.' });
    }
    await this.prisma.v1User.update({ where: { id: authUser.id }, data: { phoneVerifiedAt: new Date(), phone } });
    return { verified: true as const, verification: { phoneVerified: true } };
  }

  async confirm(authUser: V1AuthUser, channel: V1VerificationChannel, code: string) {
    const token = await this.prisma.v1VerificationToken.findFirst({
      where: { userId: authUser.id, channel, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) {
      throw new BadRequestException({
        code: 'VERIFICATION_NO_PENDING',
        message: '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.',
      });
    }
    if (token.attemptCount >= MAX_ATTEMPTS) {
      throw new BadRequestException({
        code: 'VERIFICATION_TOO_MANY_ATTEMPTS',
        message: '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.',
      });
    }

    await this.prisma.v1VerificationToken.update({
      where: { id: token.id },
      data: { attemptCount: { increment: 1 } },
    });

    const matches = await verifyPassword(code, token.codeHash);
    if (!matches) {
      throw new BadRequestException({
        code: 'VERIFICATION_CODE_MISMATCH',
        message: '인증번호가 올바르지 않아요.',
      });
    }

    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        if (channel === 'email') {
          const bound = await tx.v1User.updateMany({
            where: { id: authUser.id, email: token.target },
            data: { emailVerifiedAt: now },
          });
          if (bound.count !== 1) {
            throw new BadRequestException({
              code: 'VERIFICATION_TARGET_CHANGED',
              message: '인증할 이메일이 변경됐어요. 인증번호를 다시 받아 주세요.',
            });
          }
          await tx.v1AuthIdentity.updateMany({
            where: { userId: authUser.id, provider: V1AuthProvider.email, status: 'active' },
            data: { email: token.target, providerUserKey: token.target },
          });
        } else {
          await tx.v1User.update({
            where: { id: authUser.id },
            data: { phoneVerifiedAt: now, phone: token.target },
          });
        }
        const consumed = await tx.v1VerificationToken.updateMany({
          where: { id: token.id, consumedAt: null },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) {
          throw new ConflictException({
            code: 'ALREADY_PROCESSED',
            message: '이미 사용된 인증번호예요. 인증번호를 다시 받아 주세요.',
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: channel === 'email' ? 'EMAIL_CONFLICT' : 'PHONE_CONFLICT',
          message: channel === 'email'
            ? '이미 다른 계정에서 사용 중인 이메일이에요.'
            : '이미 다른 계정에서 사용 중인 번호예요.',
        });
      }
      throw error;
    }

    const refreshed = await this.loadUser(authUser.id);
    return {
      verified: true,
      channel,
      verification: {
        emailVerified: Boolean(refreshed.emailVerifiedAt),
        phoneVerified: Boolean(refreshed.phoneVerifiedAt),
      },
    };
  }

  private async issue(channel: V1VerificationChannel, userId: string, target: string) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashPassword(code);

    await this.prisma.$transaction([
      this.prisma.v1VerificationToken.updateMany({
        where: { userId, channel, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.v1VerificationToken.create({
        data: { userId, channel, target, codeHash, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
      }),
    ]);

    this.dispatcher.send(channel, target, code);

    return {
      sent: true,
      channel,
      target: maskTarget(channel, target),
      ...(this.dispatcher.devEcho ? { devCode: code } : {}),
    };
  }

  private async loadUser(id: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { id },
      select: { id: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true },
    });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '사용자를 찾을 수 없어요.' });
    }
    return user;
  }
}

function maskTarget(channel: V1VerificationChannel, target: string) {
  if (channel === 'email') {
    const [local, domain] = target.split('@');
    if (!domain) return '***';
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return target.length >= 4 ? `***${target.slice(-4)}` : '***';
}
