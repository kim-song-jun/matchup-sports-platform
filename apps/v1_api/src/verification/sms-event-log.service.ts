import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 기록 대상 실패 이벤트 종류. 성공 이벤트는 기록하지 않는다(실패·이슈 중심 스코프).
 * 문자열 상수로 고정해 훅 삽입 지점과 어드민 표면이 같은 어휘를 쓰게 한다.
 */
export const SMS_EVENT_TYPE = {
  /** provider(솔라피) 발송 실패 — timeout / 네트워크 / non-2xx */
  SEND_FAILED: 'SMS_SEND_FAILED',
  /** 시크릿 미설정으로 발송 자체가 불가능 — 설정 오류 */
  NOT_CONFIGURED: 'SMS_NOT_CONFIGURED',
  /** 인증번호 불일치 */
  CODE_MISMATCH: 'VERIFICATION_CODE_MISMATCH',
  /** 시도 횟수 초과 */
  TOO_MANY_ATTEMPTS: 'VERIFICATION_TOO_MANY_ATTEMPTS',
  /** 재발송 쿨다운 위반 */
  RESEND_COOLDOWN: 'VERIFICATION_RESEND_COOLDOWN',
} as const;

export type SmsEventType = (typeof SMS_EVENT_TYPE)[keyof typeof SMS_EVENT_TYPE];

export interface SmsEventLogInput {
  eventType: SmsEventType;
  /** provider 응답 코드(HTTP status 등) 또는 'TIMEOUT'/'NETWORK' 같은 분류 토큰 */
  resultCode?: string | null;
  /** 원본 대상 문자열. 끝 4자리만 추출해 저장하며 전체 값은 절대 기록하지 않는다. */
  phone: string;
  provider?: string | null;
  detail?: string | null;
}

/** detail 은 provider 응답 본문 등 길이를 통제할 수 없는 값을 받으므로 상한을 둔다. */
const DETAIL_MAX_LENGTH = 500;

/** 전화번호로 인정하는 문자만 — 숫자와 구분자(+, -, 공백, 괄호). */
const PHONE_SHAPED = /^[0-9+\-\s()]+$/;

/**
 * 대상 식별자를 끝 4자리 숫자로만 축약한다. '010-1234-5678' → '5678'.
 *
 * 전화번호 형태가 아닌 대상(이메일 등)은 숫자를 뽑지 않고 항상 '****' 로 만든다 —
 * 단순히 숫자만 추출하면 'user2026@example.com' 의 로컬파트에서 '2026' 이 뽑혀
 * phoneMasked 컬럼에 전화번호가 아닌 개인정보 조각이 남는다(email 채널의 인증 실패도
 * 이 테이블에 기록되므로 실제로 도달하는 경로다).
 */
export function maskPhoneTail(phone: string): string {
  const raw = phone ?? '';
  if (!PHONE_SHAPED.test(raw)) return '****';
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '****';
}

/**
 * 전화번호로 볼 만한 긴 숫자열(구분자 포함 9자리 이상)을 끝 4자리만 남기고 가린다.
 *
 * detail 에는 provider 응답 본문이 그대로 들어오는데, SMS provider 는 실패 사유에
 * 수신자 번호를 그대로 에코하는 경우가 많다("invalid receiver 01012345678").
 * 그대로 저장하면 phoneMasked 로 지킨 "끝 4자리만" 보장이 detail 로 우회돼 무너진다.
 *
 * 9자리 기준: 국내/국제 번호는 10자리 이상이라 걸리고, 'YYYY-MM-DD'(8자리)나
 * '8000ms' 같은 진단값은 그대로 남아 detail 의 쓸모가 유지된다.
 *
 * 구분자는 넓게(공백·하이픈·점·괄호·+) 잡는다 — '(010)1234-5678', '010.1234.5678',
 * '+82-10-1234-5678' 처럼 표기가 조금만 달라도 못 잡으면 마스킹이 무의미해지기 때문이다.
 * 그 대가로 '2026-07-25 (400)' 처럼 서로 다른 숫자가 이어져 9자리를 넘으면 함께 가려질
 * 수 있는데, 진단 편의보다 번호 유출 차단을 우선한다.
 */
const PHONE_LIKE_RUN = /\d[\d\s().+-]*\d/g;
const PHONE_LIKE_MIN_DIGITS = 9;

export function redactPhoneLike(text: string): string {
  return text.replace(PHONE_LIKE_RUN, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < PHONE_LIKE_MIN_DIGITS) return match;
    return `***${digits.slice(-4)}`;
  });
}

/**
 * SMS/인증 실패 이벤트 기록기.
 *
 * **계약: record() 는 어떤 경우에도 throw 하지 않는다.** 인증은 서비스 진입 경로라
 * 관측용 로깅 실패가 가입·로그인 자체를 깨뜨리면 안 된다 — DB 장애/스키마 드리프트로
 * insert 가 실패해도 흡수하고 error 로그만 남긴다(web-push.service 의 실패 기록 패턴과 동일).
 * 이 계약이 깨지면 "로그를 남기려다 인증이 죽는" 최악의 실패 모드가 되므로,
 * sms-event-log.service.spec.ts 가 이를 회귀 테스트로 고정한다.
 */
@Injectable()
export class SmsEventLogService {
  private readonly logger = new Logger(SmsEventLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: SmsEventLogInput): Promise<void> {
    try {
      await this.prisma.v1SmsEventLog.create({
        data: {
          eventType: input.eventType,
          resultCode: input.resultCode ?? null,
          phoneMasked: maskPhoneTail(input.phone),
          provider: input.provider ?? null,
          // 자르기 전에 가린다 — 잘라낸 뒤에 가리면 경계에 걸린 번호가 그대로 남는다.
          detail: input.detail ? redactPhoneLike(input.detail).slice(0, DETAIL_MAX_LENGTH) : null,
        },
      });
    } catch (err: unknown) {
      // 여기서 다시 throw 하면 위 계약이 깨진다 — 흡수하고 로그로만 알린다.
      this.logger.error(
        `SMS 이벤트 로그 기록 실패 [eventType=${input.eventType}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
