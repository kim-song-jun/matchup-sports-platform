import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminUserListQueryDto } from './dto/admin.dto';
import { signupStage } from './admin-user-filters';

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
    ['completed', { ...profile, deletedAt: new Date() }, [{}], 'profile_required'],
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
