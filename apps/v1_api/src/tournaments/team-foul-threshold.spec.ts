import {
  DEFAULT_TEAM_FOUL_THRESHOLD,
  MAX_TEAM_FOUL_THRESHOLD,
  MIN_TEAM_FOUL_THRESHOLD,
  resolveTeamFoulThreshold,
} from './team-foul-threshold';

describe('resolveTeamFoulThreshold', () => {
  it('기본값은 5개이고 허용 범위는 1~20개다', () => {
    expect(DEFAULT_TEAM_FOUL_THRESHOLD).toBe(5);
    expect(MIN_TEAM_FOUL_THRESHOLD).toBe(1);
    expect(MAX_TEAM_FOUL_THRESHOLD).toBe(20);
  });

  it('저장된 개수를 그대로 쓴다', () => {
    expect(resolveTeamFoulThreshold(1)).toBe(1);
    expect(resolveTeamFoulThreshold(3)).toBe(3);
    expect(resolveTeamFoulThreshold(20)).toBe(20);
  });

  it('값이 없거나(null·undefined, 대회·리그에 속하지 않은 친선 경기 포함) 범위 밖이면 기본값(5개)이다', () => {
    for (const stored of [null, undefined, 0, -1, 21, 2.5, Number.NaN]) {
      expect(resolveTeamFoulThreshold(stored)).toBe(5);
    }
  });
});
