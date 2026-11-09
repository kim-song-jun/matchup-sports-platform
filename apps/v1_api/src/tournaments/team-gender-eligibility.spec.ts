import { teamMembershipCountFake, teamProfileGenderRuleFake, type FakeTeamMember } from '../../test/helpers/team-membership-gender-fake';
import { findTeamGenderBlocker, teamGenderBlockerMessage, teamGenderRuleMatchesDivision } from './team-gender-eligibility';

describe('teamGenderRuleMatchesDivision', () => {
  it.each([
    ['여', 'female', true],
    ['남', 'male', true],
    ['남', 'female', false],
    ['여', 'male', false],
    ['성별 무관', 'female', false],
    ['무관', 'male', false],
    ['any', 'female', false],
    ['여성', 'female', false],
    [null, 'female', false],
    [undefined, 'male', false],
  ] as const)('팀 성별 %s · 부문 %s → %s', (rule, division, expected) => {
    expect(teamGenderRuleMatchesDivision(rule, division)).toBe(expected);
  });
});

describe('findTeamGenderBlocker', () => {
  const TEAM_ID = 'team-1';

  function arrange(members: FakeTeamMember[], genderRuleByTeamId: Record<string, string | null> = {}) {
    const db = {
      v1TeamMembership: { count: teamMembershipCountFake(members) },
      v1TeamProfile: { findUnique: teamProfileGenderRuleFake(genderRuleByTeamId) },
    };
    return { db, find: (genderCategory: 'male' | 'female' | 'mixed' | null) => findTeamGenderBlocker(db as never, { teamId: TEAM_ID, genderCategory }) };
  }

  it.each(['mixed', null] as const)('부문이 %s 이면 아무것도 읽지 않고 통과한다', async (genderCategory) => {
    const { db, find } = arrange([]);
    await expect(find(genderCategory)).resolves.toBeNull();
    expect(db.v1TeamMembership.count).not.toHaveBeenCalled();
    expect(db.v1TeamProfile.findUnique).not.toHaveBeenCalled();
  });

  it('프로필 성별이 맞는 활성 팀원이 있으면 팀 성별 설정은 읽지 않는다', async () => {
    const { db, find } = arrange([{ teamId: TEAM_ID, status: 'active', gender: 'female' }]);
    await expect(find('female')).resolves.toBeNull();
    expect(db.v1TeamProfile.findUnique).not.toHaveBeenCalled();
  });

  it('팀원 프로필에 성별이 없어도 팀 성별이 부문과 같으면 통과한다', async () => {
    const { find } = arrange([{ teamId: TEAM_ID, status: 'active', gender: null }], { [TEAM_ID]: '여' });
    await expect(find('female')).resolves.toBeNull();
  });

  it('팀원도 없고 팀 성별도 부문과 다르면 막는다 — 팀 프로필 행이 없는 팀도 같다', async () => {
    await expect(arrange([], { [TEAM_ID]: '남' }).find('female')).resolves.toEqual({ requiredGender: 'female' });
    await expect(arrange([], { [TEAM_ID]: '성별 무관' }).find('female')).resolves.toEqual({ requiredGender: 'female' });
    await expect(arrange([]).find('male')).resolves.toEqual({ requiredGender: 'male' });
  });
});

describe('teamGenderBlockerMessage', () => {
  it('팀 성별로도 들어올 수 있다는 것까지 알려 준다', () => {
    expect(teamGenderBlockerMessage({ requiredGender: 'female' }, '대회', '신청')).toBe(
      '여성부 대회는 팀 성별이 여성이거나 프로필 성별이 여성인 팀원이 있는 팀만 신청할 수 있어요.',
    );
    expect(teamGenderBlockerMessage({ requiredGender: 'male' }, '리그', '참가')).toBe(
      '남성부 리그는 팀 성별이 남성이거나 프로필 성별이 남성인 팀원이 있는 팀만 참가할 수 있어요.',
    );
  });
});
