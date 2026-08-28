import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

/**
 * 발송 총량 상한(24시간 이동 창).
 *
 * 쿨다운은 **간격**만 벌릴 뿐 **총량**을 막지 못한다 -- 30초마다 계속 부르면 하루
 * 2,800건이 나간다. `requestPhone` 은 대상 번호가 요청자 소유인지 확인하지 않으므로
 * (소유 증명은 코드 입력 단계에서만 이뤄진다) 계정 하나로 임의의 제3자 번호에 유료
 * SMS 를 무제한 보낼 수 있었다.
 *
 * 컨트롤러의 `@Throttle` 만으로는 부족하다: IP 기준이라 회선을 바꾸면 우회되고,
 * `V1ThrottlerGuard` 가 NODE_ENV !== 'production' 이면 통째로 스킵한다. 그래서 실제
 * 방어선은 발송 기록(v1_verification_tokens) 을 세는 이 상한이고, `@Throttle` 은
 * 같은 형제 경로(auth/phone/issue)와 맞춘 1차 방어일 뿐이다.
 *
 * 값의 근거: 정상 사용자는 오타 정정·수신 실패를 감안해도 하루 몇 건이면 충분하다.
 * 번호를 바꿔 가며 뿌리는 것을 막으려면 요청자 기준 상한도 함께 있어야 한다.
 */
const SEND_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_SENDS_PER_TARGET = 5;
const MAX_SENDS_PER_USER = 10;

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
    // 상한은 issue() 안에서 잠금 아래 확인한다 — 이메일도 같은 상한을 쓴다(유료는
    // 아니지만 발신 도메인 평판을 태우고, 남의 주소로 반복 발송하는 괴롭힘 경로는 동일).
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

  /**
   * 24시간 이동 창 기준 발송 총량 확인. 대상(피해자가 될 수 있는 번호)과 요청자
   * 양쪽을 본다 -- 대상만 세면 번호를 바꿔 가며 뿌리는 것을 못 막고, 요청자만 세면
   * 여러 계정으로 한 번호를 때리는 것을 못 막는다.
   *
   * 세는 대상은 실제로 나간 발송이다: `issue()` 는 발송이 실패하면 방금 만든 토큰을
   * 지우므로(같은 파일), 남아 있는 행 = 실제로 보낸 건이다.
   */
  private async assertSendQuota(
    tx: Prisma.TransactionClient,
    channel: V1VerificationChannel,
    userId: string,
    target: string,
  ) {
    const since = new Date(Date.now() - SEND_QUOTA_WINDOW_MS);
    const [targetSends, userSends] = await Promise.all([
      tx.v1VerificationToken.count({ where: { channel, target, createdAt: { gte: since } } }),
      tx.v1VerificationToken.count({ where: { channel, userId, createdAt: { gte: since } } }),
    ]);
    if (targetSends < MAX_SENDS_PER_TARGET && userSends < MAX_SENDS_PER_USER) return;

    await this.smsEventLog.record({
      eventType: SMS_EVENT_TYPE.SEND_QUOTA_EXCEEDED,
      phone: target,
      detail: `channel=${channel} 24시간 발송 상한 도달 (대상 ${targetSends}/${MAX_SENDS_PER_TARGET}, 요청자 ${userSends}/${MAX_SENDS_PER_USER})`,
    });
    throw new HttpException(
      {
        code: 'VERIFICATION_SEND_QUOTA_EXCEEDED',
        // 24시간 "이동 창"이라 실제 대기는 가장 오래된 발송이 창에서 빠질 때까지다 —
        // 항상 24시간을 기다려야 하는 것처럼 적으면 사실과 다르다.
        message: '인증번호를 너무 많이 요청했어요. 최대 24시간 뒤에 다시 시도할 수 있어요.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
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
    const created = await this.prisma.$transaction(async (tx) => {
      // 상한 확인과 토큰 생성 사이에 다른 요청이 끼어들면 상한이 무의미해진다 --
      // 병렬로 N 개를 던지면 전부 "아직 여유 있음"을 읽고 통과한다. 대상 번호 기준으로
      // 직렬화해 확인과 기록을 한 트랜잭션에 묶는다(형제 레인들과 같은 방식:
      // attendance.service.ts / guest-recruitment.service.ts 의 lockIdempotencyScope).
      const scope = JSON.stringify(['verification-send', channel, target]);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
      await this.assertSendQuota(tx, channel, userId, target);
      await tx.v1VerificationToken.updateMany({
        where: { userId, channel, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return tx.v1VerificationToken.create({
        data: { userId, channel, target, codeHash, expiresAt },
      });
    });

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
