import { describe, expect, it } from 'vitest';
import { namedFinalGroups } from '@/test/named-final-groups';
import type { V1TournamentGroup } from '@/types/api';
import { bracketGroupLabel, isNamedBracketTrack, orderedBracketTracks, sortByBracketTrackOrder } from './bracket-track';

describe('bracketGroupLabel', () => {
  it('트랙 이름으로 이미 시작하는 그룹 이름에는 다시 붙이지 않는다', () => {
    expect(bracketGroupLabel('프리미어', '프리미어 · 12강')).toBe('프리미어 · 12강');
    expect(bracketGroupLabel('프리미어', '프리미어')).toBe('프리미어');
  });
  it('트랙 이름이 없거나 그룹 이름이 다르면 기존처럼 앞에 붙인다', () => {
    expect(bracketGroupLabel('upper', '상위 8강')).toBe('상위 결선 · 상위 8강');
    expect(bracketGroupLabel('lower', 'B조')).toBe('하위 결선 · B조');
    expect(bracketGroupLabel('overall', '8강')).toBe('8강');
    expect(bracketGroupLabel(null, 'A조')).toBe('A조');
  });
});

describe('isNamedBracketTrack', () => {
  it('운영자가 이름을 붙인 트랙만 true 다', () => {
    expect(isNamedBracketTrack('프리미어')).toBe(true);
    for (const track of ['overall', 'upper', 'lower', null, undefined] as const) expect(isNamedBracketTrack(track)).toBe(false);
  });
});

describe('orderedBracketTracks', () => {
  it('프리미어·챌린지는 만든 순서대로 나온다 (가나다순이 아니다)', () => {
    const groups = namedFinalGroups([{ name: '프리미어', teams: 12 }, { name: '챌린지', teams: 12 }]);
    expect(orderedBracketTracks(groups)).toEqual(['프리미어', '챌린지']);
  });

  it('만든 순서를 뒤집으면 따라 뒤집힌다', () => {
    const groups = namedFinalGroups([{ name: '챌린지', teams: 12 }, { name: '프리미어', teams: 12 }]);
    expect(orderedBracketTracks(groups)).toEqual(['챌린지', '프리미어']);
  });

  it('팀 수가 달라 서버 응답에서 큰 토너먼트가 먼저 나와도 만든 순서를 지킨다 (8팀 + 12팀)', () => {
    const groups = namedFinalGroups([{ name: '프리미어', teams: 8 }, { name: '챌린지', teams: 12 }]);
    // 응답은 phase 우선 정렬이라 12팀 토너먼트의 첫 단계(round16)가 8팀 토너먼트의 quarter 보다 앞선다.
    expect(groups.find(group => group.bracketTrack !== 'overall')?.bracketTrack).toBe('챌린지');
    expect(orderedBracketTracks(groups)).toEqual(['프리미어', '챌린지']);
  });

  it('기존 상·하위 결선은 sortOrder 가 같아도 상위가 먼저다', () => {
    const base = { advanceCount: null, groupTeams: [], standings: [], qualification: null };
    const groups: V1TournamentGroup[] = [
      { ...base, id: 'lower-semi', name: '하위 4강', phase: 'semi', sortOrder: 0, bracketTrack: 'lower' },
      { ...base, id: 'upper-semi', name: '상위 4강', phase: 'semi', sortOrder: 0, bracketTrack: 'upper' },
      { ...base, id: 'lower-final', name: '하위 결승', phase: 'final', sortOrder: 1, bracketTrack: 'lower' },
      { ...base, id: 'upper-final', name: '상위 결승', phase: 'final', sortOrder: 1, bracketTrack: 'upper' },
    ];
    expect(orderedBracketTracks(groups)).toEqual(['upper', 'lower']);
  });

  it('전체(overall)·트랙 없는 그룹은 뺀다', () => {
    const groups = namedFinalGroups([{ name: '프리미어', teams: 8 }]);
    const withoutTrack: V1TournamentGroup = { ...groups[0], id: 'legacy', bracketTrack: undefined };
    expect(orderedBracketTracks([withoutTrack, ...groups])).toEqual(['프리미어']);
    expect(orderedBracketTracks([])).toEqual([]);
  });
});

describe('sortByBracketTrackOrder', () => {
  const groups = namedFinalGroups([{ name: '프리미어', teams: 8 }, { name: '챌린지', teams: 12 }]);

  it('서버가 가나다순으로 준 시상 묶음을 결선 그룹 순서로 다시 세운다', () => {
    const awardSets = [{ bracketTrack: '챌린지' }, { bracketTrack: '프리미어' }];
    expect(sortByBracketTrackOrder(awardSets, groups, set => set.bracketTrack).map(set => set.bracketTrack)).toEqual(['프리미어', '챌린지']);
  });

  it('결선 그룹에 없는 트랙은 받은 순서를 지킨 채 맨 뒤로 보낸다', () => {
    const rows = [{ id: 'a', track: '없는트랙B' }, { id: 'b', track: '챌린지' }, { id: 'c', track: '없는트랙A' }, { id: 'd', track: '프리미어' }];
    expect(sortByBracketTrackOrder(rows, groups, row => row.track).map(row => row.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('같은 트랙 항목은 받은 순서를 지킨다', () => {
    const rows = [{ id: '1', track: '챌린지' }, { id: '2', track: '프리미어' }, { id: '3', track: '챌린지' }, { id: '4', track: '프리미어' }];
    expect(sortByBracketTrackOrder(rows, groups, row => row.track).map(row => row.id)).toEqual(['2', '4', '1', '3']);
  });
});
