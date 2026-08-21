import { describe, expect, it } from 'vitest';
import { isTeamOperatorRole } from './team-role';

describe('isTeamOperatorRole', () => {
  it('owner/manager/admin 은 운영 권한이 있다', () => {
    expect(isTeamOperatorRole('owner')).toBe(true);
    expect(isTeamOperatorRole('manager')).toBe(true);
    expect(isTeamOperatorRole('admin')).toBe(true);
  });

  it('member 와 값 없음은 권한이 없다', () => {
    expect(isTeamOperatorRole('member')).toBe(false);
    expect(isTeamOperatorRole(null)).toBe(false);
    expect(isTeamOperatorRole(undefined)).toBe(false);
  });
});
