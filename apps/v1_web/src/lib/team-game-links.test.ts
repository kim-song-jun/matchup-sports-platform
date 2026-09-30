import { describe, expect, it } from 'vitest';
import { teamGameDetailHref, teamGameRosterHref } from './team-game-links';

const base = { competitionId: 'c-1', teamMatchId: 'tm-1' } as const;

describe('teamGameDetailHref', () => {
  it('대회·리그·친선은 라우트가 서로 다르다', () => {
    expect(teamGameDetailHref({ ...base, competitionKind: 'TOURNAMENT' })).toBe('/tournaments/c-1/matches/tm-1');
    expect(teamGameDetailHref({ ...base, competitionKind: 'LEAGUE' })).toBe('/league-matches/c-1/fixtures/tm-1');
    expect(teamGameDetailHref({ ...base, competitionKind: 'FRIENDLY', competitionId: null })).toBe('/team-matches/tm-1');
  });

  it('경기를 가리킬 식별자가 없으면 링크를 내지 않는다', () => {
    expect(teamGameDetailHref({ competitionKind: 'LEAGUE', competitionId: 'c-1', teamMatchId: null })).toBeNull();
    expect(teamGameDetailHref({ competitionKind: 'LEAGUE', competitionId: null, teamMatchId: 'tm-1' })).toBeNull();
  });
});

describe('teamGameRosterHref', () => {
  const roster = { ...base, teamId: 't-1', gameId: 'g-1' };

  it('대회·리그는 기준 명단이 있을 때만, 팀원도 열 수 있는 경기 명단 화면으로', () => {
    expect(teamGameRosterHref({ ...roster, competitionKind: 'LEAGUE', rosterAvailable: true, canManage: false })).toBe(
      '/teams/t-1/games/g-1/roster',
    );
    expect(teamGameRosterHref({ ...roster, competitionKind: 'TOURNAMENT', rosterAvailable: false, canManage: true })).toBeNull();
  });

  it('친선 참석명단은 팀장·매니저만 열 수 있어 팀원에게는 링크가 없다', () => {
    const friendly = { ...roster, competitionKind: 'FRIENDLY' as const, rosterAvailable: false };
    expect(teamGameRosterHref({ ...friendly, canManage: true })).toBe('/team-matches/tm-1/lineup');
    expect(teamGameRosterHref({ ...friendly, canManage: false })).toBeNull();
  });
});
