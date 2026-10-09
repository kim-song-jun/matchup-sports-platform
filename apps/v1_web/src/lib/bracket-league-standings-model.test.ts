import { describe, expect, it } from 'vitest';
import { makeGroup, makeStanding } from '@/test/bracket-canvas-fixtures';
import { buildLeagueStandings } from './bracket-league-standings-model';

const team = (groupId: string, registrationId: string, teamName: string, sortOrder: number) => ({
  id: `gt-${registrationId}`, groupId, registrationId, teamName, sortOrder, createdAt: '',
});
const gA = makeGroup({
  id: 'gA', name: 'A조', phase: 'group', sortOrder: 0,
  groupTeams: [team('gA', 'r1', '송파', 0), team('gA', 'r2', '마포', 1), team('gA', 'r3', '한강', 2)],
});
const gB = makeGroup({
  id: 'gB', name: 'B조', phase: 'group', sortOrder: 1,
  groupTeams: [team('gB', 'r4', '알파8', 0), team('gB', 'r5', '알파7', 1)],
});

describe('buildLeagueStandings', () => {
  const standings = [
    makeStanding({ groupId: 'gA', registrationId: 'r2', teamName: '마포', position: 2, wins: 1, losses: 1, goalsFor: 2, goalsAgainst: 2, goalDifference: 0, points: 3 }),
    makeStanding({ groupId: 'gA', registrationId: 'r1', teamName: '송파', position: 1, wins: 2, goalsFor: 3, goalsAgainst: 0, goalDifference: 3, points: 6 }),
    makeStanding({ groupId: 'gB', registrationId: 'r4', teamName: '알파8', position: 1, wins: 1, draws: 1, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 4 }),
  ];

  it('서버 값을 그대로 옮기고 경기 수만 승무패 합으로 만든다', () => {
    const [a] = buildLeagueStandings({ groups: [gA, gB], standings });
    expect(a.rows[0]).toEqual({
      registrationId: 'r1', teamName: '송파', rank: 1, played: 2, wins: 2, draws: 0, losses: 0, goalDifference: 3, points: 6,
    });
  });

  it('position 순으로 정렬하고 다른 조 순위가 섞이지 않는다', () => {
    const result = buildLeagueStandings({ groups: [gA, gB], standings });
    expect(result.map((g) => g.name)).toEqual(['A조', 'B조']);
    expect(result[0].rows.slice(0, 2).map((r) => r.registrationId)).toEqual(['r1', 'r2']);
    expect(result[1].rows.map((r) => r.registrationId)).toEqual(['r4', 'r5']);
  });

  it('순위 행이 아직 없는 편성 팀은 0 으로 뒤에 붙는다(여전히 포함된다)', () => {
    const [a, b] = buildLeagueStandings({ groups: [gA, gB], standings });
    expect(a.rows.map((r) => [r.registrationId, r.rank, r.played, r.points])).toEqual([['r1', 1, 2, 6], ['r2', 2, 2, 3], ['r3', 3, 0, 0]]);
    expect(b.rows[1]).toMatchObject({ registrationId: 'r5', teamName: '알파7', rank: 2, played: 0, points: 0 });
  });

  it('standings 가 통째로 비어도 편성 팀 순서대로 0 표가 나온다', () => {
    const [a] = buildLeagueStandings({ groups: [gA], standings: [] });
    expect(a.rows.map((r) => [r.teamName, r.rank, r.points])).toEqual([['송파', 1, 0], ['마포', 2, 0], ['한강', 3, 0]]);
  });

  it('팀이 하나도 없는 조는 빠지고, 팀 이름이 없는 편성 행(registrationId null)은 건너뛴다', () => {
    const empty = makeGroup({ id: 'gE', name: 'C조', phase: 'group', sortOrder: 2 });
    const unnamed = makeGroup({
      id: 'gU', name: 'D조', phase: 'group', sortOrder: 3,
      groupTeams: [{ id: 'gt-x', groupId: 'gU', registrationId: null, teamName: null, sortOrder: 0, createdAt: '' }],
    });
    expect(buildLeagueStandings({ groups: [gA, empty, unnamed], standings: [] }).map((g) => g.name)).toEqual(['A조']);
  });
});
