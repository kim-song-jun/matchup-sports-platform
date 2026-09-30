import { describe, expect, it } from 'vitest';
import { teamRoleLabel } from './v1-status-labels';

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
