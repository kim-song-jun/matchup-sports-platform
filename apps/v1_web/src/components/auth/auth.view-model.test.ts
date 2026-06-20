import { afterEach, describe, expect, it } from 'vitest';
import { getEmailLoginViewModel, getLoginViewModel, getSignupCompleteViewModel, getSignupFormViewModel } from './auth.view-model';

describe('auth view models', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
  });

  it('keeps the quick login entry path available for v1', () => {
    const model = getLoginViewModel();

    expect(model.emailHref).toBe('/login/email');
    expect(model.guestHref).toBe('/home');
    expect(model.signupHref).toBe('/terms');
    expect(model.providers.map(({ label, disabled }) => ({ label, disabled }))).toEqual([
      { label: '카카오', disabled: true },
      { label: '네이버', disabled: true },
      { label: 'Apple', disabled: true },
    ]);
    expect(model.providers.every((provider) => !('href' in provider))).toBe(true);
  });

  it('enables Kakao when Kakao OAuth env is configured', () => {
    process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID = 'kakao-rest-key';
    process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI = 'https://teameet.co.kr/v1/callback/kakao';

    const model = getLoginViewModel();

    expect(model.providers).toHaveLength(3);
    expect(model.providers[0]).toMatchObject({
      label: '카카오',
      background: 'var(--kakao-yellow)',
      color: 'var(--static-black)',
      disabled: false,
    });
    expect(model.providers[0].href).toBe(
      'https://kauth.kakao.com/oauth/authorize?client_id=kakao-rest-key&redirect_uri=https%3A%2F%2Fteameet.co.kr%2Fv1%2Fcallback%2Fkakao&response_type=code',
    );
    expect(model.providers.slice(1).every((provider) => provider.disabled === true)).toBe(true);
  });

  it('keeps email login on a submit-driven real API flow', () => {
    const model = getEmailLoginViewModel();

    expect(model.primary.disabled).toBeUndefined();
    expect(model.primary.href).toBeUndefined();
    expect(model.primary.label).toBe('로그인');
    expect(model.sub).toBe('');
    expect(model.notice).toBeUndefined();
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
    expect(model.secondary.href).toBe('/home');
  });
});
