import { buildOtpEmailHtml, buildOtpEmailText, otpEmailSubject } from './otp-email-template';

describe('login_step_up mail', () => {
  it('carries the code and tells a non-requester to change the password, in text and html', () => {
    expect(otpEmailSubject('login_step_up')).toBe('[Teameet] 로그인 인증번호');

    const text = buildOtpEmailText('123456', 'login_step_up');
    const html = buildOtpEmailHtml('123456', 'login_step_up');
    for (const body of [text, html]) {
      expect(body).toContain('본인이 아니라면 바로 비밀번호를 바꿔 주세요.');
      expect(body).toContain('5분 안에 입력해 주세요.');
    }
    expect(text).toContain('인증번호: 123456');
    expect(html).toContain('123 456');
  });

  it('does not tell a login-code recipient to simply ignore the mail', () => {
    expect(buildOtpEmailText('123456', 'login_step_up')).not.toContain('무시해도');
    expect(buildOtpEmailHtml('123456', 'login_step_up')).not.toContain('무시해도');
  });

  it.each(['verify', 'password_reset'] as const)('keeps the "ignore if not you" note for %s', (purpose) => {
    expect(buildOtpEmailText('123456', purpose)).toContain('무시해도 됩니다');
    expect(buildOtpEmailHtml('123456', purpose)).toContain('무시해도 됩니다');
  });
});
