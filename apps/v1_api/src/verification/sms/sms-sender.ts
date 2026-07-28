export const SMS_SENDER = Symbol('SMS_SENDER');

export interface SmsSender {
  /** 필수 시크릿이 모두 있으면 true. false면 dev-echo 폴백으로 동작한다. */
  readonly enabled: boolean;
  /** 실패 시 throw — 발송 실패는 사용자에게 알려야 하므로 흡수하지 않는다. */
  send(to: string, text: string): Promise<void>;
}

/** iOS SMS 자동완성 고려: '인증번호' + 6자리 코드가 본문에 또렷이 노출되도록 구성한다. */
export function buildOtpSmsText(code: string): string {
  return `[Teameet] 인증번호 ${code}\n5분 안에 입력해 주세요.`;
}
