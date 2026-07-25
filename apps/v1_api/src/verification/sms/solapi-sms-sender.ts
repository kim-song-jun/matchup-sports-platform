import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import type { SmsSender } from './sms-sender';

const SOLAPI_SEND_URL = 'https://api.solapi.com/messages/v4/send';
// 유료 SMS 발송 경로 — 응답이 지연되면 fetch 가 무기한 매달려 워커/커넥션이 고갈된다.
// 상한을 두고 초과 시 abort 하여 커넥션을 즉시 회수한다(옥토모 클라이언트와 동일 방어).
const SOLAPI_TIMEOUT_MS = 8000;

/**
 * 솔라피(SOLAPI) SMS 발송 어댑터.
 * 인증문자 특화 provider — 서버가 인증번호를 즉시 발송(MT)한다. 옥토모 무료 MO(polling)의
 * 구조적 반영 지연을 제거하기 위한 교체 대상.
 * 인증: HMAC-SHA256(date+salt, apiSecret). 3개 환경변수(API_KEY/API_SECRET/SENDER_NUMBER)가
 * 모두 있어야 enabled — 하나라도 없으면 dispatcher가 dev-echo 폴백으로 동작한다.
 */
@Injectable()
export class SolapiSmsSender implements SmsSender {
  private readonly logger = new Logger(SolapiSmsSender.name);

  private get apiKey(): string {
    return process.env.SOLAPI_API_KEY ?? '';
  }

  private get apiSecret(): string {
    return process.env.SOLAPI_API_SECRET ?? '';
  }

  private get sender(): string {
    return process.env.SOLAPI_SENDER_NUMBER ?? '';
  }

  get enabled(): boolean {
    return this.apiKey.length > 0 && this.apiSecret.length > 0 && this.sender.length > 0;
  }

  private authorization(): string {
    const date = new Date().toISOString();
    const salt = randomBytes(32).toString('hex');
    const signature = createHmac('sha256', this.apiSecret).update(date + salt).digest('hex');
    return `HMAC-SHA256 apiKey=${this.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  }

  async send(to: string, text: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SOLAPI_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(SOLAPI_SEND_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: this.authorization(),
        },
        body: JSON.stringify({ message: { to, from: this.sender, text } }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        this.logger.warn(`solapi send timed out after ${SOLAPI_TIMEOUT_MS}ms`);
        throw new Error(`Solapi send timed out after ${SOLAPI_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`solapi send failed: ${res.status} ${body.slice(0, 200)}`);
      throw new Error(`Solapi send failed: ${res.status}`);
    }
  }
}
