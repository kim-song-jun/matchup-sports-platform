import {
  isPhoneVerificationEnforced,
  isPhoneVerificationExemptActor,
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

describe('isPhoneVerificationExemptActor', () => {
  it('exempts an active platform admin so the ops console is usable while unverified', () => {
    expect(isPhoneVerificationExemptActor({ adminUser: { status: 'active' } })).toBe(true);
  });

  it('does not exempt a revoked admin — the grant is what carries the trust, not the past', () => {
    expect(isPhoneVerificationExemptActor({ adminUser: { status: 'revoked' } })).toBe(false);
  });

  it('does not exempt an ordinary user, so identity-link and consent writes stay gated', () => {
    expect(isPhoneVerificationExemptActor({ adminUser: null })).toBe(false);
    expect(isPhoneVerificationExemptActor({})).toBe(false);
    expect(isPhoneVerificationExemptActor(null)).toBe(false);
    expect(isPhoneVerificationExemptActor(undefined)).toBe(false);
  });

  it('is what makes the ops console usable — those writes go to /games/*, which the path allowlist deliberately does not open', () => {
    // 운영 콘솔의 쓰기(commands/events/lineups/result-revisions/corrections)는 전부 /games/* 로
    // 나가고, /games/* 에는 일반 사용자의 신원연동·동의 쓰기도 있어 프리픽스로 열 수 없다.
    // 그래서 이 경로들은 경로 기준으로는 여전히 막혀야 하고, 면제는 신분으로만 이뤄져야 한다.
    for (const path of [
      '/games/g1/commands/start',
      '/games/g1/events',
      '/games/g1/result-revisions/r1/officialize',
      '/games/g1/corrections',
      '/games/g1/participants/p1/identity-link-requests',
    ]) {
      expect(isPhoneVerificationRequestAllowed('POST', path)).toBe(false);
    }
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
