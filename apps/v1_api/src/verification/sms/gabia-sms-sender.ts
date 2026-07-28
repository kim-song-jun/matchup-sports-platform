import { Injectable, Logger } from '@nestjs/common';
import { SMS_EVENT_TYPE, SmsEventLogService, redactPhoneLike } from '../sms-event-log.service';
import type { SmsSender } from './sms-sender';

/** 실패 기록의 provider 컬럼에 남길 식별자 — 어드민에서 어느 provider 장애인지 구분한다. */
const PROVIDER = 'gabia';
const GABIA_TOKEN_URL = 'https://sms.gabia.com/oauth/token';
const GABIA_SEND_URL = 'https://sms.gabia.com/api/send/sms';
// 유료 SMS 발송 경로 — 응답이 지연되면 fetch 가 무기한 매달려 워커/커넥션이 고갈된다.
// 상한을 두고 초과 시 abort 하여 커넥션을 즉시 회수한다(솔라피 어댑터와 동일 방어).
const GABIA_TIMEOUT_MS = 8000;
// 토큰 만료 직전 재발급 안전마진 — expiresAt 도달과 발송 사이 레이스를 줄인다.
const TOKEN_EXPIRY_SKEW_MS = 60_000;

interface GabiaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  create_on: string;
}

interface GabiaSendSuccessResponse {
  code: '200';
  [key: string]: unknown;
}

interface GabiaSendFailureResponse {
  code: false | string;
  message?: string;
  code_detail?: string;
}

type GabiaSendResponse = GabiaSendSuccessResponse | GabiaSendFailureResponse;

interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * 가비아(Gabia) SMS 발송 어댑터.
 * OAuth 2단계(client_credentials 토큰 발급 → 토큰으로 발송) 구조 — 솔라피와 달리
 * 발급받은 access_token 을 캐시해 재사용하고, 만료 임박 시에만 재발급한다.
 *
 * ★함정: 가비아 발송 API는 인증/파라미터 실패에도 HTTP 200 을 반환한다. 성공 여부는
 * 반드시 응답 JSON body 의 `code` 필드로만 판별해야 한다 — `code: "200"` 이면 성공,
 * 그 외(`code: false` 또는 `code: "token_verification_failed"` 등 문자열)는 실패다.
 * HTTP status(res.ok)만 보고 성공 처리하면 실패한 발송을 성공으로 오판하게 된다.
 *
 * enabled 는 GABIA_SMS_ID/GABIA_API_KEY/GABIA_SENDER_NUMBER 3개 환경변수가 모두 있을
 * 때만 true — 하나라도 없으면 dispatcher 가 dev-echo 폴백으로 동작한다.
 */
@Injectable()
export class GabiaSmsSender implements SmsSender {
  private readonly logger = new Logger(GabiaSmsSender.name);
  private tokenCache: TokenCache | null = null;

  constructor(private readonly smsEventLog: SmsEventLogService) {}

  private get smsId(): string {
    return process.env.GABIA_SMS_ID ?? '';
  }

  private get apiKey(): string {
    return process.env.GABIA_API_KEY ?? '';
  }

  private get senderNumber(): string {
    return process.env.GABIA_SENDER_NUMBER ?? '';
  }

  get enabled(): boolean {
    return this.smsId.length > 0 && this.apiKey.length > 0 && this.senderNumber.length > 0;
  }

  private basicAuth(id: string, secret: string): string {
    return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GABIA_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        this.logger.warn(`gabia ${label} timed out after ${GABIA_TIMEOUT_MS}ms`);
        throw new Error(`Gabia ${label} timed out after ${GABIA_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async issueToken(): Promise<TokenCache> {
    const res = await this.fetchWithTimeout(
      GABIA_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          Authorization: this.basicAuth(this.smsId, this.apiKey),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      },
      'token issue',
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`gabia token issue failed: ${res.status} ${body.slice(0, 200)}`);
      throw new Error(`Gabia token issue failed: ${res.status}`);
    }
    const json = (await res.json()) as GabiaTokenResponse;
    const cache: TokenCache = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000 - TOKEN_EXPIRY_SKEW_MS,
    };
    this.tokenCache = cache;
    return cache;
  }

  private async getToken(): Promise<TokenCache> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache;
    }
    return this.issueToken();
  }

  private isTokenFailure(res: GabiaSendFailureResponse): boolean {
    if (res.code === 'token_verification_failed') return true;
    const detail = res.code_detail ?? '';
    return /token|auth/i.test(detail);
  }

  private async postSend(token: TokenCache, to: string, text: string): Promise<GabiaSendResponse> {
    const body = new URLSearchParams({
      phone: to,
      callback: this.senderNumber,
      message: text,
      refkey: token.refreshToken,
    });
    const res = await this.fetchWithTimeout(
      GABIA_SEND_URL,
      {
        method: 'POST',
        headers: {
          Authorization: this.basicAuth(this.smsId, token.accessToken),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
      'send',
    );
    // 가비아 앱 레벨 실패는 HTTP 200 + code 필드로 오지만, 프록시/WAF/LB 의 인프라 레벨
    // 오류(502/503/504)는 non-2xx + non-JSON(HTML) 본문으로 온다. res.ok 를 먼저 확인해
    // issueToken()·솔라피와 동일한 'Gabia send failed: <status>' 형태로 표면화한다
    // (그대로 res.json() 에 넘기면 통제되지 않은 SyntaxError 가 전파된다).
    if (!res.ok) {
      // provider 응답 본문이 수신자 번호를 에코할 수 있어 로그로도 새지 않게 가린다.
      const body = redactPhoneLike(await res.text().catch(() => ''));
      this.logger.warn(`gabia send failed(HTTP): ${res.status} ${body.slice(0, 200)}`);
      throw new Error(`Gabia send failed: ${res.status}`);
    }
    return (await res.json()) as GabiaSendResponse;
  }

  /**
   * 실패 기록은 send() 한 곳에서만 남긴다 — 실제 실패 지점(토큰 발급/타임아웃/HTTP/앱코드)이
   * 전화번호를 모르는 내부 헬퍼에 흩어져 있고, 토큰 만료 재시도 경로 때문에 지점마다 기록하면
   * 한 번의 발송 실패가 여러 건으로 중복 적재된다.
   */
  async send(to: string, text: string): Promise<void> {
    try {
      await this.sendOnce(to, text);
    } catch (err: unknown) {
      await this.smsEventLog.record({
        eventType: SMS_EVENT_TYPE.SEND_FAILED,
        resultCode: classifyGabiaFailure(err),
        phone: to,
        provider: PROVIDER,
        detail: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async sendOnce(to: string, text: string): Promise<void> {
    const token = await this.getToken();
    let result = await this.postSend(token, to, text);

    if (String(result.code) !== '200' && this.isTokenFailure(result as GabiaSendFailureResponse)) {
      this.tokenCache = null;
      const freshToken = await this.issueToken();
      result = await this.postSend(freshToken, to, text);
    }

    if (String(result.code) !== '200') {
      const failure = result as GabiaSendFailureResponse;
      this.logger.warn(
        `gabia send failed: code=${String(failure.code)} message=${redactPhoneLike(failure.message ?? '').slice(0, 200)}`,
      );
      throw new Error(`Gabia send failed: ${String(failure.code)}`);
    }
  }
}

/**
 * 실패 원인을 어드민 표에 뜨는 짧은 resultCode 로 압축한다. 여기서 파싱하는 메시지는
 * 모두 이 클래스가 직접 만든 문자열(`Gabia send failed: X` / `Gabia token issue failed: X`
 * / `Gabia <label> timed out after Yms`)이라 형식이 이 파일 안에서 고정된다.
 * 전문은 detail 컬럼에 그대로 남으므로, 분류에 실패해도 정보가 사라지지 않는다.
 */
export function classifyGabiaFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/timed out/i.test(message)) return 'TIMEOUT';
  if (/token issue failed: (\S+)/.test(message)) {
    return `TOKEN_${/token issue failed: (\S+)/.exec(message)![1]}`;
  }
  const sendFailure = /send failed: (\S+)/.exec(message);
  if (sendFailure) return sendFailure[1];
  return 'ERROR';
}
