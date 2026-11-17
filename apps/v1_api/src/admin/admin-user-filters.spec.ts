import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminUserListQueryDto } from './dto/admin.dto';
import { phoneSearchDigits, signupStage } from './admin-user-filters';

describe('admin member signup classification', () => {
  const profile = { nickname: 'member', deletedAt: null };
  it.each([
    ['social_terms_required', profile, [], 'terms_required'],
    ['not_started', null, [], 'terms_required'],
    ['not_started', null, [{}], 'profile_required'],
    ['terms_done', null, [{}], 'profile_required'],
    ['social_profile_required', null, [{}], 'profile_required'],
    ['social_profile_deferred', profile, [{}], 'profile_deferred'],
    ['signup_done', profile, [{}], 'required_complete'],
    ['deferred', profile, [{}], 'required_complete'],
    ['completed', profile, [{}], 'onboarding_complete'],
    ['completed', null, [{}], 'profile_required'],
    ['completed', { ...profile, nickname: '' }, [{}], 'profile_required'],
    ['completed', { ...profile, nickname: 'deleted-member', deletedAt: new Date() }, [{}], 'onboarding_complete'],
  ])('%s classifies incomplete and completed profiles correctly', (onboardingStatus, userProfile, termsConsents, expected) => {
    expect(signupStage({ onboardingStatus, profile: userProfile, termsConsents })).toBe(expected);
  });
});

describe('admin member filter DTO', () => {
  it('accepts CSV and repeated parameters while preserving the existing single status', async () => {
    const query = plainToInstance(AdminUserListQueryDto, { signup: 'incomplete,profile_deferred', providers: ['kakao', 'apple'], status: 'active', page: '2' });
    expect(await validate(query)).toEqual([]);
    expect(query.signup).toEqual(['incomplete', 'profile_deferred']);
    expect(query.providers).toEqual(['kakao', 'apple']);
    expect(query.page).toBe(2);
  });
  it.each([
    { signup: 'invalid' }, { signup: '' }, { providers: 'naver' },
    { providers: ['kakao', 'invalid'] }, { providers: 2 },
    { providers: ['email', 'kakao', 'apple', 'email'] },
  ])('rejects invalid filters %j', async (values) => {
    expect((await validate(plainToInstance(AdminUserListQueryDto, values))).length).toBeGreaterThan(0);
  });
});

describe('admin member phone search digits', () => {
  it.each([
    ['010-0000-1234', '01000001234'],
    ['01000001234', '01000001234'],
    [' 010 0000 1234 ', '01000001234'],
    ['0000-1234', '00001234'],
    ['1234', '1234'],
  ])('%s -> %s', (q, expected) => {
    expect(phoneSearchDigits(q)).toBe(expected);
  });

  it.each(['123', '', '길동', 'user1234', 'a@b.c', '010-abcd-1234'])('%s is not a phone query', (q) => {
    expect(phoneSearchDigits(q)).toBeNull();
  });
});
