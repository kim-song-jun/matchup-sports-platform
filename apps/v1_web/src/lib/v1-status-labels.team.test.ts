import { describe, expect, it } from 'vitest';
import { teamRecruitmentLabel, teamRoleLabel } from './v1-status-labels';

// H2: 같은 manager 역할이 화면마다 운영진·관리자·감독으로 불리던 것을 세 낱말로 통일했다.
describe('teamRoleLabel', () => {
  it('팀 역할은 팀장 / 매니저 / 멤버 세 낱말뿐이다', () => {
    expect(teamRoleLabel('owner')).toBe('팀장');
    expect(teamRoleLabel('manager')).toBe('매니저');
    expect(teamRoleLabel('member')).toBe('멤버');
  });

  it('옛 멤버십 값 admin 은 매니저와 같은 권한이라 같은 이름이다', () => {
    expect(teamRoleLabel('admin')).toBe('매니저');
  });

  it('역할이 아닌 값은 이름을 지어내지 않고 null 이다 — 화면이 자기 맥락의 말로 채운다', () => {
    expect(teamRoleLabel('none')).toBeNull();
    expect(teamRoleLabel(null)).toBeNull();
    expect(teamRoleLabel(undefined)).toBeNull();
  });
});

// H2 S-1·S-2: 4/24명인데 '마감'으로 읽히던 것 — 팀장이 닫은 것과 정원이 찬 것을 다른 낱말로.
describe('teamRecruitmentLabel', () => {
  it('자리가 남은 열린 팀은 가입 가능이다(정원이 없어도)', () => {
    expect(teamRecruitmentLabel({ joinPolicy: 'approval_required', memberCount: 4, memberGoalCount: 24 })).toBe('가입 가능');
    expect(teamRecruitmentLabel({ joinPolicy: 'approval_required', memberCount: 40, memberGoalCount: null })).toBe('가입 가능');
  });

  it('팀장이 닫은 팀은 인원과 상관없이 가입 닫힘이다', () => {
    expect(teamRecruitmentLabel({ joinPolicy: 'closed', memberCount: 4, memberGoalCount: 24 })).toBe('가입 닫힘');
    expect(teamRecruitmentLabel({ joinPolicy: 'closed', memberCount: 24, memberGoalCount: 24 })).toBe('가입 닫힘');
  });

  it('열려 있어도 정원이 차면 정원 마감이다', () => {
    expect(teamRecruitmentLabel({ joinPolicy: 'approval_required', memberCount: 24, memberGoalCount: 24 })).toBe('정원 마감');
  });
});
