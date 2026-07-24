import { Inject, Injectable, Logger } from '@nestjs/common';
import { V1VerificationChannel } from '@prisma/client';
import { SMS_SENDER, SmsSender, buildOtpSmsText } from './sms/sms-sender';

/**
 * 인증코드 발송기.
 * phone 채널은 SmsSender 어댑터(솔라피 등)로 실제 SMS 를 발송한다. 어댑터가 비활성(시크릿 미설정)
 * 이거나 email 채널이면 로그 스텁으로만 남기고, V1_VERIFICATION_DEV_ECHO=true 일 때 서비스가
 * 응답에 devCode 를 포함해 개발/검증 흐름을 가능하게 한다.
 * 발송 실패는 흡수하지 않고 throw 를 전파해 사용자에게 알린다(fire-and-forget 아님).
 */
@Injectable()
export class VerificationDispatcherService {
  private readonly logger = new Logger(VerificationDispatcherService.name);

  readonly devEcho = process.env.V1_VERIFICATION_DEV_ECHO === 'true';

  constructor(@Inject(SMS_SENDER) private readonly sms: SmsSender) {}

  /** phone 채널 실발송이 가능한지(provider 시크릿 설정 여부). */
  get smsEnabled(): boolean {
    return this.sms.enabled;
  }

  async send(channel: V1VerificationChannel, target: string, code: string): Promise<void> {
    const masked = target.length > 4 ? `${target.slice(0, 2)}***${target.slice(-2)}` : '***';
    if (channel === 'phone' && this.sms.enabled) {
      await this.sms.send(target, buildOtpSmsText(code));
      this.logger.log(`[verification:phone] SMS 발송 완료 → ${masked}`);
      return;
    }
    // provider 미설정(email 로그 스텁 포함): dev-echo 로만 코드 노출
    this.logger.log(
      `[verification:${channel}] dispatched code to ${masked}${this.devEcho ? ` (dev code=${code})` : ''}`,
    );
  }
}
