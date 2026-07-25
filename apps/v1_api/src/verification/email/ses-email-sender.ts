import { Injectable, Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { EmailSender } from './email-sender';

/**
 * AWS SES(v2) 이메일 발송 어댑터. SolapiSmsSender 와 같은 계약 —
 * SES_REGION 과 EMAIL_FROM 이 모두 있어야 enabled 이고, 하나라도 없으면 dispatcher 가
 * dev-echo 폴백으로 동작한다(설정 없이 배포해도 기존 동작 그대로).
 *
 * 자격증명은 SDK 기본 체인(인스턴스 역할 → 환경변수)에 맡긴다. 배포 환경이 이미 IAM 역할을
 * 쓰고 있어 앱이 키를 들고 있을 이유가 없다.
 *
 * ★샌드박스: 프로덕션 액세스 승인 전에는 SES 에 검증해 둔 주소로만 전달된다. 이때 SES 는
 * 요청 자체를 거절하므로(MessageRejected) 실패가 조용히 묻히지 않고 그대로 표면화된다.
 */
@Injectable()
export class SesEmailSender implements EmailSender {
  private readonly logger = new Logger(SesEmailSender.name);
  private client: SESv2Client | null = null;

  private get region(): string {
    return process.env.SES_REGION ?? process.env.AWS_REGION ?? '';
  }

  private get from(): string {
    return process.env.EMAIL_FROM ?? '';
  }

  get enabled(): boolean {
    return this.region.length > 0 && this.from.length > 0;
  }

  /** 첫 발송 때 만들고 재사용한다 — 매 요청 새 클라이언트는 커넥션을 낭비한다. */
  private getClient(): SESv2Client {
    if (!this.client) this.client = new SESv2Client({ region: this.region });
    return this.client;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.getClient().send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: { Text: { Data: text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
    } catch (err) {
      // 수신자 주소는 로그에 남기지 않는다 — 실패 원인 파악에 필요한 건 SES 오류 쪽이다.
      this.logger.warn(`ses send failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }
}
