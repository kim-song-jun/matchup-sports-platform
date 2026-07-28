import {
  getPendingSocialSignupRoute,
  isPendingSocialSignupRequestAllowed,
} from './social-signup-access';

describe('social signup access contract', () => {
  it('maps each pending status to its required signup route', () => {
    expect(getPendingSocialSignupRoute('social_terms_required')).toBe('/terms?mode=social');
    expect(getPendingSocialSignupRoute('social_profile_required')).toBe('/signup/social');
    expect(getPendingSocialSignupRoute('signup_done')).toBeNull();
  });

  it('allows only auth me, logout, and the required social completion endpoint', () => {
    expect(isPendingSocialSignupRequestAllowed('social_terms_required', '/api/v1/auth/me')).toBe(true);
    expect(isPendingSocialSignupRequestAllowed('social_terms_required', '/api/v1/auth/social-terms')).toBe(true);
    expect(isPendingSocialSignupRequestAllowed('social_terms_required', '/api/v1/auth/social-profile')).toBe(false);
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/auth/social-profile')).toBe(true);
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/home')).toBe(false);
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/auth/logout')).toBe(true);
  });

  it('allows the profile-completion helpers (nickname check + authed phone verification card) during social_profile_required', () => {
    // 옥토모 카카오 hard-block: 프로필 화면의 인증 카드가 authed verification 엔드포인트를 호출한다.
    // 이를 막으면 번호 입력 즉시 403(SIGNUP_INCOMPLETE)으로 소셜 가입이 원천 봉쇄된다(실사고).
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/auth/check-nickname')).toBe(true);
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/verification/phone/request')).toBe(true);
    expect(isPendingSocialSignupRequestAllowed('social_profile_required', '/api/v1/verification/phone/confirm')).toBe(true);
    // 단계 격리: 약관 단계에서는 프로필용 인증 경로를 허용하지 않는다.
    expect(isPendingSocialSignupRequestAllowed('social_terms_required', '/api/v1/verification/phone/request')).toBe(false);
    expect(isPendingSocialSignupRequestAllowed('social_terms_required', '/api/v1/auth/check-nickname')).toBe(false);
  });
});
