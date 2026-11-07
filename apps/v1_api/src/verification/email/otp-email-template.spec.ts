import { buildOtpEmailHtml, buildOtpEmailText, otpEmailSubject } from './otp-email-template';

describe('account recovery mail', () => {
  it('describes email ownership without implying that social account lookup sets a password', () => {
    expect(otpEmailSubject('password_reset')).toBe('[Teameet] 계정 확인 인증번호');
    for (const body of [buildOtpEmailText('123456', 'password_reset'), buildOtpEmailHtml('123456', 'password_reset')]) {
      expect(body).toContain('이메일 주소를 확인해 주세요');
      expect(body).not.toContain('새 비밀번호를 정할 수');
    }
  });
});

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

  it.each(['verify', 'password_reset', 'login_email_link', 'email_change'] as const)('keeps the "ignore if not you" note for %s', (purpose) => {
    expect(buildOtpEmailText('123456', purpose)).toContain('무시해도 됩니다');
    expect(buildOtpEmailHtml('123456', purpose)).toContain('무시해도 됩니다');
  });
});

describe('login_email_link mail', () => {
  it('says what the code is for, so it is not mistaken for the generic email verification', () => {
    expect(otpEmailSubject('login_email_link')).toBe('[Teameet] 로그인 이메일 연결 인증번호');
    expect(otpEmailSubject('login_email_link')).not.toBe(otpEmailSubject('verify'));

    const text = buildOtpEmailText('123456', 'login_email_link');
    const html = buildOtpEmailHtml('123456', 'login_email_link');
    for (const body of [text, html]) {
      expect(body).toContain('로그인 이메일 연결');
      expect(body).toContain('로그인할 수 있게 연결돼요');
    }
    expect(text).toContain('인증번호: 123456');
    expect(html).toContain('123 456');
  });
});

describe('email_change mail', () => {
  it('says the code is for changing the account email, so it is not mistaken for the other email codes', () => {
    expect(otpEmailSubject('email_change')).toBe('[Teameet] 이메일 변경 인증번호');
    for (const other of ['verify', 'password_reset', 'login_email_link'] as const) {
      expect(otpEmailSubject('email_change')).not.toBe(otpEmailSubject(other));
    }

    const text = buildOtpEmailText('123456', 'email_change');
    const html = buildOtpEmailHtml('123456', 'email_change');
    for (const body of [text, html]) {
      expect(body).toContain('이메일 변경');
      expect(body).toContain('계정의 이메일로 쓸 수 있어요');
    }
    expect(text).toContain('인증번호: 123456');
    expect(html).toContain('123 456');
  });
});
