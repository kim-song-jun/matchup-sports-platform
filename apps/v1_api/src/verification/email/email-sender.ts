export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  /** 필수 설정이 모두 있으면 true. false면 dev-echo 폴백으로 동작한다. */
  readonly enabled: boolean;
  /** 실패 시 throw — 발송 실패는 사용자에게 알려야 하므로 흡수하지 않는다(SmsSender 와 같은 계약). */
  send(to: string, subject: string, text: string): Promise<void>;
}

export const OTP_EMAIL_SUBJECT = '[Teameet] 인증번호';

/**
 * 인증 메일 본문. 링크 없이 코드만 담는다 — 링크형은 피싱과 구분이 어렵고,
 * 지금 흐름(코드 입력)과도 맞지 않는다.
 */
export function buildOtpEmailText(code: string): string {
  return [
    '[Teameet] 이메일 인증',
    '',
    `인증번호: ${code}`,
    '',
    '5분 안에 입력해 주세요.',
    '본인이 요청하지 않았다면 이 메일은 무시해도 됩니다.',
  ].join('\n');
}
