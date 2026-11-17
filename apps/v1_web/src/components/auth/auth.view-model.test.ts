import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEmailLoginViewModel, getLoginViewModel, getSignupCompleteViewModel, getSignupFormViewModel } from './auth.view-model';

describe('auth view models', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
  });

  it('keeps the quick login entry path available for v1', () => {
    const model = getLoginViewModel();

    expect(model.emailHref).toBe('/login/email');
    expect(model.guestHref).toBe('/home');
    expect(model.signupHref).toBe('/terms?mode=signup');
    // Apple 은 목록에 없다 — 네이티브 셸에서만 동작하므로 AppleLoginButton 이 브리지를 보고
    // 스스로 나타난다. 네이버는 버튼 없이 안내 줄로만 알린다.
    expect(model.providers).toEqual([{ label: '카카오 로그인', disabled: true }]);
    // 카카오 로그인 설정이 없는 빌드는 카카오도 준비 중으로 함께 알린다.
    expect(model.preparingProviderNames).toEqual(['카카오', '네이버']);
  });

  it('enables Kakao when Kakao OAuth env is configured', () => {
    process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID = 'kakao-rest-key';
    process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI = 'https://teameet.co.kr/callback/kakao';

    const model = getLoginViewModel();

    expect(model.providers).toHaveLength(1);
    expect(model.providers[0]).toEqual({
      label: '카카오 로그인',
      href: 'https://kauth.kakao.com/oauth/authorize?client_id=kakao-rest-key&redirect_uri=https%3A%2F%2Fteameet.co.kr%2Fcallback%2Fkakao&response_type=code',
      disabled: false,
    });
    expect(model.preparingProviderNames).toEqual(['네이버']);
  });

  it('keeps email login on a submit-driven real API flow', () => {
    const model = getEmailLoginViewModel();

    expect(model.primary.disabled).toBeUndefined();
    expect(model.primary.href).toBeUndefined();
    expect(model.primary.label).toBe('로그인');
    expect(model.sub).toBe('');
    expect(model.notice).toBeUndefined();
  });

  it('carries the redirect on the email login back target and nothing else without one', () => {
    expect(getEmailLoginViewModel('/tournaments/t1/my').backHref).toBe('/login?redirect=%2Ftournaments%2Ft1%2Fmy');
    expect(getEmailLoginViewModel(null).backHref).toBe('/login');
  });

  it('keeps signup on a submit-driven real API flow', () => {
    const model = getSignupFormViewModel();

    expect(model.primary.disabled).toBeUndefined();
    expect(model.primary.href).toBeUndefined();
    expect(model.primary.label).toBe('회원가입하고 계속');
  });

  it('marks signup completion as a real post-registration state', () => {
    const model = getSignupCompleteViewModel();

    expect(model.title).toContain('완료');
    expect(model.steps.every((step) => step.done === true)).toBe(true);
    expect(model.primary.href).toBe('/onboarding/sport');
    expect(model.secondary?.href).toBe('/home');
  });
});
