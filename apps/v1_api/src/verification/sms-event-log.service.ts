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

/**
 * 대상 식별자를 끝 4자리 숫자로만 축약한다. 숫자만 남기므로 '010-1234-5678' →
 * '5678' 이 되고, 이메일처럼 숫자가 4자 미만인 대상은 '****' 로 떨어져 원본이
 * 어떤 형태여도 전체 값이 저장되지 않는다.
 */
export function maskPhoneTail(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '****';
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
          detail: input.detail ? input.detail.slice(0, DETAIL_MAX_LENGTH) : null,
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
