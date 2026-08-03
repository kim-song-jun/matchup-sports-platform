import {
  isPhoneVerificationEnforced,
  isPhoneVerificationRequestAllowed,
} from './phone-verification-access';

describe('isPhoneVerificationRequestAllowed', () => {
  it('allows every read so unverified users can still browse', () => {
    expect(isPhoneVerificationRequestAllowed('GET', '/api/v1/tournaments')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('get', '/api/v1/home')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('HEAD', '/api/v1/tournaments/t-1')).toBe(true);
  });

  it('blocks writes that reach another user', () => {
    expect(
      isPhoneVerificationRequestAllowed('POST', '/api/v1/tournaments/t-1/registrations'),
    ).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/chat/rooms/r-1/messages')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('DELETE', '/api/v1/teams/team-1')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/teams')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/matches/m-1/applications')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/team-matches')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/reviews')).toBe(false);
    expect(
      isPhoneVerificationRequestAllowed('POST', '/api/v1/teams/team-1/join-applications'),
    ).toBe(false);
  });

  /**
   * 인증 도입 이전에 가입한 레거시 미인증 계정이 자기 계정을 건사할 수 있어야 한다.
   * 이걸 막으면 로그인은 되는데 프로필 사진 한 장 못 바꾸는 상태로 갇힌다.
   */
  it('lets an unverified account manage its own account', () => {
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/me/profile')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/me/settings')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/me/regions')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/me/preferences')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/onboarding/preferences')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/onboarding/complete')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/uploads')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/uploads/videos')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/notifications/n-1/read')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/notifications/read-all')).toBe(true);
    expect(
      isPhoneVerificationRequestAllowed('POST', '/api/v1/notifications/push-subscribe'),
    ).toBe(true);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/notification-preferences')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/inquiries')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/search/recent')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/logs/client-error')).toBe(true);
    expect(
      isPhoneVerificationRequestAllowed('POST', '/api/v1/master/regions/resolve-location'),
    ).toBe(true);
  });

  it('keeps the verification endpoints writable — otherwise the account can never unlock', () => {
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/verification/phone/request')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/verification/phone/confirm')).toBe(true);
  });

  it('keeps signup, logout, withdrawal, terms re-consent and the admin console writable', () => {
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/auth/social-profile')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/auth/logout')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/me/withdrawal-request')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/terms/consents')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/admin/tournaments/t-1')).toBe(true);
  });

  it('does not let a lookalike path inherit an allowlisted prefix', () => {
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/admins/promote')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/authorship/claim')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/terms/consents/bulk')).toBe(false);
    // 짧은 접두사일수록 이웃을 삼키기 쉽다 — /me 는 특히 위험하다.
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/mercenary')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/members/m-1/kick')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/team-memberships/tm-1/remove')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/matches')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/uploadsx')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/searchable/x')).toBe(false);
  });

  /**
   * /notification-preferences 는 /notifications 의 하위 경로가 아니다 — 접두사 매칭에 기대면
   * 조용히 빠지므로 정확 일치 목록에 따로 들어가 있어야 한다.
   */
  it('opens notification-preferences by exact match, not by the notifications prefix', () => {
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/notification-preferences')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/notification-preferences/bulk')).toBe(false);
  });

  it('normalizes query strings and trailing slashes before matching', () => {
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/verification/phone/confirm?x=1')).toBe(true);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/me/withdrawal-request/')).toBe(true);
  });

  it('treats a missing method as a write (fail-closed)', () => {
    expect(isPhoneVerificationRequestAllowed(undefined, '/api/v1/tournaments')).toBe(false);
    expect(isPhoneVerificationRequestAllowed(undefined, '/api/v1/verification/phone/confirm')).toBe(true);
  });
});

describe('isPhoneVerificationEnforced', () => {
  const original = process.env.V1_PHONE_VERIFICATION_DISABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.V1_PHONE_VERIFICATION_DISABLED;
    else process.env.V1_PHONE_VERIFICATION_DISABLED = original;
  });

  it('enforces by default and only opts out on the explicit flag', () => {
    delete process.env.V1_PHONE_VERIFICATION_DISABLED;
    expect(isPhoneVerificationEnforced()).toBe(true);

    process.env.V1_PHONE_VERIFICATION_DISABLED = 'false';
    expect(isPhoneVerificationEnforced()).toBe(true);

    process.env.V1_PHONE_VERIFICATION_DISABLED = 'true';
    expect(isPhoneVerificationEnforced()).toBe(false);
  });
});
