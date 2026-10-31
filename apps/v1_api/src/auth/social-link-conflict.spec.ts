import { isLinkableSocialProvider, signInThenLinkConflict } from './social-link-conflict';

describe('signInThenLinkConflict', () => {
  it.each([
    ['kakao', '카카오'],
    ['apple', 'Apple'],
  ] as const)('tells a %s user to sign in with the original method and link from settings', (provider, label) => {
    const error = signInThenLinkConflict('SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', provider);

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL',
      message: `이미 팀밋 계정이 있어요. 원래 가입한 방법으로 로그인한 뒤 설정에서 ${label} 로그인을 연결해 주세요.`,
      details: { next: 'sign_in_then_link', provider },
    });
  });

  it('keeps the code it is given', () => {
    expect(signInThenLinkConflict('PHONE_CONFLICT', 'kakao').getResponse()).toMatchObject({ code: 'PHONE_CONFLICT' });
  });
});

describe('isLinkableSocialProvider', () => {
  it('accepts the two providers that can be linked while signed in and nothing else', () => {
    expect(isLinkableSocialProvider('kakao')).toBe(true);
    expect(isLinkableSocialProvider('apple')).toBe(true);
    expect(isLinkableSocialProvider('email')).toBe(false);
    expect(isLinkableSocialProvider('naver')).toBe(false);
  });
});
