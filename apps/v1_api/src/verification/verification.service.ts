import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1AuthProvider, V1VerificationChannel } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../auth/password-hash';
import { V1AuthUser } from '../auth/v1-auth-user';
import { SMS_EVENT_TYPE, SmsEventLogService } from './sms-event-log.service';
import { VerificationDispatcherService } from './verification-dispatcher.service';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// 동일 번호로 유료 SMS 를 반복 발송하지 못하게 막는 재발송 쿨다운(대상 번호 기준).
const RESEND_COOLDOWN_MS = 30 * 1000;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: VerificationDispatcherService,
    private readonly smsEventLog: SmsEventLogService,
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

  async requestPhone(authUser: V1AuthUser, phone: string) {
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
    // 대상 번호 기준 재발송 쿨다운 — 로그인 사용자가 임의 번호로 유료 SMS 를 반복 발송하는 남용 차단.
    const recent = await this.prisma.v1VerificationToken.findFirst({
      where: { channel: 'phone', target: phone },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 1000);
      await this.smsEventLog.record({
        eventType: SMS_EVENT_TYPE.RESEND_COOLDOWN,
        phone,
        detail: `channel=phone 재발송 쿨다운 ${retryAfter}초 남음`,
      });
      throw new BadRequestException({
        code: 'VERIFICATION_RESEND_COOLDOWN',
        message: `잠시 후 다시 시도해 주세요. (${retryAfter}초 뒤에 다시 받을 수 있어요)`,
      });
    }
    return this.issue('phone', user.id, phone);
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
    // 인증 실패 기록은 email 채널에서도 남긴다("인증 실패" 트래킹이 목적) — 다만 저장
    // 컬럼은 번호 끝 4자리(phoneMasked)라, 전화번호 형태가 아닌 이메일 대상은 항상
    // '****' 로 마스킹된다(로컬파트 숫자 유출 방지). 어느 채널인지는 detail 로 구분한다.
    if (token.attemptCount >= MAX_ATTEMPTS) {
      await this.smsEventLog.record({
        eventType: SMS_EVENT_TYPE.TOO_MANY_ATTEMPTS,
        phone: token.target,
        detail: `channel=${channel} 인증 시도 ${token.attemptCount}회 초과`,
      });
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
      await this.smsEventLog.record({
        eventType: SMS_EVENT_TYPE.CODE_MISMATCH,
        phone: token.target,
        detail: `channel=${channel} 인증 시도 ${token.attemptCount + 1}/${MAX_ATTEMPTS}`,
      });
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

    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    const [, created] = await this.prisma.$transaction([
      this.prisma.v1VerificationToken.updateMany({
        where: { userId, channel, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.v1VerificationToken.create({
        data: { userId, channel, target, codeHash, expiresAt },
      }),
    ]);

    try {
      await this.dispatcher.send(channel, target, code);
    } catch (err) {
      // 발송 실패 시 방금 만든 토큰을 삭제해, 사용자가 재발송 쿨다운(대상 번호 기준)에 걸리지 않고 즉시 재요청할 수 있게 한다.
      await this.prisma.v1VerificationToken.deleteMany({ where: { id: created.id } });
      throw err;
    }

    return {
      sent: true,
      channel,
      target: maskTarget(channel, target),
      // 프론트가 서버 TTL 기준으로 카운트다운하도록 만료 시각을 내려준다(클라이언트 하드코딩 드리프트 방지).
      expiresAt: expiresAt.toISOString(),
      ...(this.dispatcher.devEchoActive ? { devCode: code } : {}),
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
