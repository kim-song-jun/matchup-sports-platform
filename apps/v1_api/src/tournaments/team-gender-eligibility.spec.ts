import { teamProfileGenderRuleFake } from '../../test/helpers/team-membership-gender-fake';
import { assertTeamGenderEligible, findTeamGenderBlocker, teamGenderBlockerMessage } from './team-gender-eligibility';

describe('team gender admission matrix', () => {
  const divisions = ['male', 'female', 'mixed', null] as const;
  const rules = ['남', '여', '성별 무관', '무관', 'any', null, '', 'unknown'] as const;
  for (const division of divisions) {
    it.each(rules)('%s team in ' + division, async (rule) => {
      const db = {
        v1TeamProfile: { findUnique: teamProfileGenderRuleFake({ 'team-1': rule }) },
        // A gendered member must never override the team setting.
        v1TeamMembership: { count: jest.fn().mockResolvedValue(10) },
      };
      const unset = rule === null || rule === '' || rule === 'unknown';
      const opposite = (division === 'male' && rule === '여') || (division === 'female' && rule === '남');
      await expect(findTeamGenderBlocker(db as never, { teamId: 'team-1', genderCategory: division }))
        .resolves.toEqual(unset ? { requiredGender: null } : opposite ? { requiredGender: division } : null);
      expect(db.v1TeamProfile.findUnique).toHaveBeenCalledWith({ where: { teamId: 'team-1' }, select: { genderRule: true } });
      expect(db.v1TeamMembership.count).not.toHaveBeenCalled();
    });
  }

  it('rejects a missing team profile with the existing conflict code', async () => {
    const db = { v1TeamProfile: { findUnique: teamProfileGenderRuleFake() } };
    await expect(assertTeamGenderEligible(db as never, { teamId: 'missing', genderCategory: 'mixed', noun: '대회', verb: '신청' }))
      .rejects.toMatchObject({ status: 409, response: { code: 'TEAM_GENDER_INELIGIBLE' } });
  });

  it('explains mismatches and the missing setting', () => {
    expect(teamGenderBlockerMessage({ requiredGender: 'female' }, '대회', '신청')).toBe('여성부 대회에는 남성팀이 신청할 수 없어요.');
    expect(teamGenderBlockerMessage({ requiredGender: 'male' }, '리그', '참가')).toBe('남성부 리그에는 여성팀이 참가할 수 없어요.');
    expect(teamGenderBlockerMessage({ requiredGender: null }, '대회', '신청')).toContain('팀 성별을 설정한 뒤');
  });
});
