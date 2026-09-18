import { describe, expect, it } from 'vitest';
import { isTeamOperatorRole, normalizeMyTeamsResponse } from './team-role';

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

describe('normalizeMyTeamsResponse', () => {
  it('undefined 는 빈 배열로 정규화한다', () => {
    expect(normalizeMyTeamsResponse(undefined)).toEqual([]);
  });

  it('items 래핑이 있으면 items 를 꺼낸다', () => {
    const team = { teamId: 't1', name: '팀1', role: 'owner' } as never;
    const wrapped = Object.assign([team], { items: [team] });
    expect(normalizeMyTeamsResponse(wrapped)).toEqual([team]);
  });
});
