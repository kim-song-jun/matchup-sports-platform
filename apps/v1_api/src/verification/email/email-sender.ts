export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  /** 필수 설정이 모두 있으면 true. false면 dev-echo 폴백으로 동작한다. */
  readonly enabled: boolean;
  /**
   * 실패 시 throw — 발송 실패는 사용자에게 알려야 하므로 흡수하지 않는다(SmsSender 와 같은 계약).
   * html 은 선택 — 주면 멀티파트로 보내고, 없으면 text 만 보낸다.
   */
  send(to: string, subject: string, text: string, html?: string): Promise<void>;
}
