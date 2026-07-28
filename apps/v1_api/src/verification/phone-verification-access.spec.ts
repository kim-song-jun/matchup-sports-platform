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

  it('blocks writes that create or join something', () => {
    expect(
      isPhoneVerificationRequestAllowed('POST', '/api/v1/tournaments/t-1/registrations'),
    ).toBe(false);
    expect(isPhoneVerificationRequestAllowed('POST', '/api/v1/chat/rooms/r-1/messages')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('PATCH', '/api/v1/me/profile')).toBe(false);
    expect(isPhoneVerificationRequestAllowed('DELETE', '/api/v1/teams/team-1')).toBe(false);
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
