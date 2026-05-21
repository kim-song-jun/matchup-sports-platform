import { describe, expect, it } from 'vitest';
import { getEmailLoginViewModel, getLoginViewModel, getSignupCompleteViewModel, getSignupFormViewModel } from './auth.view-model';

describe('auth view models', () => {
  it('keeps the seeded mock login entry path available for v1 preview', () => {
    const model = getLoginViewModel();

    expect(model.emailHref).toBe('/login/email');
    expect(model.guestHref).toBe('/home');
    expect(model.signupHref).toBe('/terms');
  });

  it('keeps email login on a submit-driven real API flow', () => {
    const model = getEmailLoginViewModel();

    expect(model.primary.disabled).toBeUndefined();
    expect(model.primary.href).toBeUndefined();
    expect(model.primary.label).toBe('로그인');
    expect(model.notice.body).toContain('Mock login');
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
