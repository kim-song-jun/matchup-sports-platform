import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { V1VerificationChannel } from '@prisma/client';
import { EMAIL_SENDER, EmailSender } from './email/email-sender';
import { buildOtpEmailHtml, buildOtpEmailText, otpEmailSubject } from './email/otp-email-template';
import { SMS_EVENT_TYPE, SmsEventLogService } from './sms-event-log.service';
import { SMS_SENDER, SmsSender, buildOtpSmsText } from './sms/sms-sender';

/**
 * 인증코드 발송기.
 * phone 채널은 SmsSender 어댑터(솔라피 등)로 실제 SMS 를 발송한다. 어댑터가 비활성(시크릿 미설정)
 * 이고 dev-echo 이면 로그로만 남기고 응답에 devCode 를 노출해 개발/CI 검증을 가능하게 한다.
 * 어댑터도 dev-echo 도 없으면 실제 발송도 devCode 도 없어 인증을 진행할 수 없으므로, 설정 오류를
 * 성공(200)으로 숨기지 않고 503 으로 표면화한다.
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
  ) {}

  /**
   * devCode 를 응답에 노출해도 되는 유일한 경우: 실제 발송 수단이 하나도 없고(dev-echo 경로)
   * devEcho 가 켜진 개발/CI 환경. 실발송이 가능한 환경에서는 devEcho 설정 실수가 있어도 OTP 를
   * 노출하지 않는다.
   *
   * email 도 함께 본다 — 이 값은 채널과 무관하게 쓰이므로, 이메일만 설정된 환경에서 sms 만
   * 검사하면 실제로 메일을 보내면서 응답에 코드까지 실어 보내게 된다.
   */
  get devEchoActive(): boolean {
    return this.devEcho && !this.sms.enabled && !this.email.enabled;
  }

  async send(channel: V1VerificationChannel, target: string, code: string): Promise<void> {
    const masked = target.length > 4 ? `${target.slice(0, 2)}***${target.slice(-2)}` : '***';
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
      if (this.devEcho) {
        this.logger.log(`[verification:phone] dev-echo (실발송 없음) → ${masked} (dev code=${code})`);
        return;
      }
      await this.smsEventLog.record({
        eventType: SMS_EVENT_TYPE.NOT_CONFIGURED,
        phone: target,
        detail: 'SMS provider 시크릿 미설정 + dev-echo 비활성',
      });
      throw new ServiceUnavailableException({
        code: 'SMS_NOT_CONFIGURED',
        message: '문자 인증을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.',
      });
    }
    if (this.email.enabled) {
      try {
        await this.email.send(
          target,
          otpEmailSubject('verify'),
          buildOtpEmailText(code, 'verify'),
          buildOtpEmailHtml(code, 'verify'),
        );
      } catch (err) {
        this.logger.warn(
          `[verification:email] 메일 발송 실패 → ${masked}: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new ServiceUnavailableException({
          code: 'EMAIL_SEND_FAILED',
          message: '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.',
        });
      }
      this.logger.log(`[verification:email] 메일 발송 완료 → ${masked}`);
      return;
    }

    // provider 미설정 시에는 기존 동작(로그 스텁)을 유지한다 — 여기서 503 을 던지면 지금까지
    // 조용히 통과하던 이메일 인증 요청이 배포 순간 전부 실패로 바뀐다. dev code 는 실발송
    // 수단이 하나도 없을 때만 남겨, dev-echo 가 실수로 켜져도 OTP 가 로그로 새지 않게 한다.
    this.logger.log(
      `[verification:email] dispatched code to ${masked}${this.devEchoActive ? ` (dev code=${code})` : ''}`,
    );
  }
}
