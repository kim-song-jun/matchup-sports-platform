import { describe, expect, it } from 'vitest';
import { compareRosterPlayers, rosterDisplayName } from './roster-presentation';

describe('참가·경기 명단의 공통 표시', () => {
  it('번호 0을 포함한 번호순, 번호 없는 선수의 표시 이름순을 유지한다', () => {
    const rows = [
      { userId: '3', jerseyNumber: null, displayName: '하늘' },
      { userId: '2', jerseyNumber: 10, displayName: '가람' },
      { userId: '1', jerseyNumber: 0, displayName: '바다' },
      { userId: '4', jerseyNumber: null, displayName: '가람' },
    ];
    expect(rows.sort(compareRosterPlayers).map((row) => row.userId)).toEqual(['1', '2', '4', '3']);
  });
  it('서버의 경기 표시 이름을 우선하고 프로필이 없을 때 실명을 추정하지 않는다', () => {
    expect(rosterDisplayName({ displayName: '경기표시이름', nickname: '닉네임' })).toBe('경기표시이름');
    expect(rosterDisplayName({ nickname: '닉네임' })).toBe('닉네임');
    expect(rosterDisplayName({ nickname: null })).toBe('팀원');
  });
});
