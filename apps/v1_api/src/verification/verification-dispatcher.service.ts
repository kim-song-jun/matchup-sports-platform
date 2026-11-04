import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { V1VerificationChannel } from '@prisma/client';
import { normalizeEmail } from '../auth/normalize-email';
import { PrismaService } from '../prisma/prisma.service';
import { recordEmailDeliveryFailure } from './email/email-delivery-failure';
import { EMAIL_SENDER, EmailSender } from './email/email-sender';
import {
  buildOtpEmailHtml,
  buildOtpEmailText,
  otpEmailSubject,
  type OtpEmailPurpose,
} from './email/otp-email-template';
import { SMS_EVENT_TYPE, SmsEventLogService } from './sms-event-log.service';
import { SMS_SENDER, SmsSender, buildOtpSmsText } from './sms/sms-sender';

/**
 * 인증코드 발송기.
 * 실제 주소는 각 채널의 발송 어댑터가 필요하며 미설정이면 503 으로 표면화한다.
 * dev-echo 는 예약된 테스트 주소에만 실발송 없이 적용하며 인증코드는 로그에 남기지 않는다.
 * 발송 실패는 흡수하지 않고 throw 를 전파해 사용자에게 알린다(fire-and-forget 아님).
 */
@Injectable()
export class VerificationDispatcherService {
  private readonly logger = new Logger(VerificationDispatcherService.name);

  readonly devEcho = process.env.V1_VERIFICATION_DEV_ECHO === 'true';

  constructor(
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly smsEventLog: SmsEventLogService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 이 응답에 코드를 실어도 되는지. dev-echo 환경이라도 실제 사람에게 닿을 수 없는 주소(예약 테스트 도메인,
   * 배정되지 않는 010-0000 대역)에만 싣는다 — alpha 는 공개 환경이라, 아무 주소에나 실으면 남의 번호·가입
   * 이메일로 인증을 끝낼 수 있다. 코드는 비밀번호 재설정·소셜 연결 증명도 되므로 어드민·대회 스태프 계정에는 싣지 않는다.
   */
  async mayEchoCode(target: {
    channel: V1VerificationChannel;
    address: string;
    userId?: string | null;
  }): Promise<boolean> {
    if (!this.devEcho || !isTestAddress(target.channel, target.address)) return false;
    return !(await this.isPrivilegedAccount(target));
  }

  /** 사용자가 이메일 코드를 실제로 받을 수 있는지 — 메일 발송이 설정됐거나, 응답에 코드를 싣는 dev-echo 환경. */
  get emailDeliverable(): boolean {
    return this.email.enabled || this.devEcho;
  }

  /** 주소 종류와 발송 설정만 검사한다. 공개 계정 찾기에서는 가입 여부와 무관하게 호출한다. */
  assertDeliveryAvailable(channel: V1VerificationChannel, target: string): void {
    if ((this.devEcho && isTestAddress(channel, target)) || (channel === 'phone' ? this.sms.enabled : this.email.enabled)) return;
    if (channel === 'phone') {
      throw new ServiceUnavailableException({
        code: 'SMS_NOT_CONFIGURED',
        message: '문자 인증을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.',
      });
    }
    throw new ServiceUnavailableException({
      code: 'EMAIL_SEND_UNAVAILABLE',
      message: '지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.',
    });
  }

  /**
   * emailPurpose 는 email 채널의 메일 문구만 고른다(제목·머리말). 기본값은 기존 호출자가
   * 쓰던 이메일 인증 문구라, 넘기지 않던 곳의 동작은 그대로다.
   */
  async send(
    channel: V1VerificationChannel,
    target: string,
    code: string,
    emailPurpose: OtpEmailPurpose = 'verify',
    userId?: string,
  ): Promise<void> {
    const masked = target.length > 4 ? `${target.slice(0, 2)}***${target.slice(-2)}` : '***';
    if (this.devEcho && isTestAddress(channel, target)) {
      if (!(await this.mayEchoCode({ channel, address: target, userId }))) {
        throw new ServiceUnavailableException({
          code: 'TEST_VERIFICATION_UNAVAILABLE',
          message: '이 계정은 테스트 인증을 사용할 수 없어요.',
        });
      }
      this.logger.log(`[verification:${channel}] 테스트 발송 (실발송 없음) → ${masked}`);
      return;
    }
    if (channel === 'phone') {
      if (this.sms.enabled) {
        try {
          await this.sms.send(target, buildOtpSmsText(code));
        } catch (err) {
          // provider 오류(4xx/timeout/네트워크)를 도메인 HttpException 으로 감싸 일관된
          // 코드/한국어 메시지로 내려준다(그대로 던지면 Nest 기본 500 이 된다).
          this.logger.warn(
            `[verification:phone] SMS 발송 실패 → ${masked}: ${err instanceof Error ? err.message : String(err)}`,
          );
          throw new ServiceUnavailableException({
            code: 'SMS_SEND_FAILED',
            message: '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.',
          });
        }
        this.logger.log(`[verification:phone] SMS 발송 완료 → ${masked}`);
        return;
      }
      await this.smsEventLog.record({
        eventType: SMS_EVENT_TYPE.NOT_CONFIGURED,
        phone: target,
        detail: '실제 번호에 대한 SMS provider 시크릿 미설정',
      });
      this.assertDeliveryAvailable(channel, target);
    }
    if (this.email.enabled) {
      try {
        await this.email.send(
          target,
          otpEmailSubject(emailPurpose),
          buildOtpEmailText(code, emailPurpose),
          buildOtpEmailHtml(code, emailPurpose),
        );
      } catch (err) {
        this.logger.warn(
          `[verification:email] 메일 발송 실패 → ${masked}: ${err instanceof Error ? err.message : String(err)}`,
        );
        await this.reportEmailFailure(emailPurpose, err);
        throw new ServiceUnavailableException({
          code: 'EMAIL_SEND_FAILED',
          message: '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.',
        });
      }
      this.logger.log(`[verification:email] 메일 발송 완료 → ${masked}`);
      return;
    }

    this.assertDeliveryAvailable(channel, target);
  }

  /** The alert is best effort: failing to record it must not replace the 503 the caller is owed. */
  private async reportEmailFailure(purpose: OtpEmailPurpose, error: unknown): Promise<void> {
    try {
      await recordEmailDeliveryFailure(this.prisma, { purpose, error });
    } catch (recordError) {
      this.logger.error(
        `[verification:email] 발송 실패 알림을 기록하지 못했어요: ${recordError instanceof Error ? recordError.message : String(recordError)}`,
      );
    }
  }

  private async isPrivilegedAccount(target: {
    channel: V1VerificationChannel;
    address: string;
    userId?: string | null;
  }): Promise<boolean> {
    const owner = await this.prisma.v1User.findFirst({
      where: target.channel === 'email' ? { email: normalizeEmail(target.address) } : { phone: target.address },
      select: { id: true },
    });
    const userIds = [...new Set([target.userId, owner?.id].filter((id): id is string => Boolean(id)))];
    const now = new Date();
    for (const userId of userIds) {
      const [admins, staffAssignments] = await Promise.all([
        this.prisma.v1AdminUser.count({ where: { userId, status: 'active', revokedAt: null } }),
        this.prisma.v1TournamentStaffAssignment.count({
          where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        }),
      ]);
      if (admins > 0 || staffAssignments > 0) return true;
    }
    return false;
  }
}

// RFC 2606·6761 예약 도메인과, 어느 통신사에도 배정되지 않는 010-0000-xxxx(QA 가입 스크립트가 쓰는 대역).
const TEST_EMAIL_DOMAINS = ['test', 'example.com', 'example.net', 'example.org'];
const TEST_PHONE_PATTERN = /^0100000\d{4}$/;

export function isTestAddress(channel: V1VerificationChannel, address: string): boolean {
  if (channel === 'phone') return TEST_PHONE_PATTERN.test(address);
  const domain = normalizeEmail(address).split('@').pop() ?? '';
  return TEST_EMAIL_DOMAINS.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`));
}
