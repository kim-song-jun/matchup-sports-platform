/** Explicit design samples only; never used by a runtime tournament route/API. */
import type { V1TournamentFixture, V1TournamentGroup } from '../../apps/v1_web/src/types/api';

export function bracketSample(size: 4 | 8 | 12) {
  const names = ['마포 레인저스', '한강 로버스', '강남 유나이티드', '서울 스파르탄', '송파 FC', '성수 어벤저스', '관악 타이거즈', '노원 이글스', '강동 FC', '종로 레오즈', '은평 스타즈', '서초 블루스'];
  const phases = size === 12 ? ['round12', 'quarter', 'semi', 'final'] : size === 8 ? ['quarter', 'semi', 'final'] : ['semi', 'final'];
  const labels: Record<string, string> = { round12: '12강', quarter: '8강', semi: '4강', final: '결승' };
  const groups: V1TournamentGroup[] = phases.map((phase) => ({ id: phase, name: labels[phase], phase: phase as V1TournamentGroup['phase'], sortOrder: 0, advanceCount: null, standings: [], groupTeams: phase === 'round12' ? names.slice(0, 4).map((teamName, index) => ({ id: `bye-${index}`, registrationId: `registration-${index}`, teamId: `team-${index}`, teamName, teamLogoUrl: null, sortOrder: index, isBye: true })) : [] }));
  const fixtures: V1TournamentFixture[] = [];
  const make = (round: string, number: number, home?: number, away?: number): V1TournamentFixture => ({ id: `${round}-${number}`, groupId: round, round: labels[round], fixtureNumber: number, legNumber: 1, scheduledAt: '2026-10-10T04:00:00.000Z', venue: '서울', status: 'scheduled', liveStatus: 'scheduled', homeRegistrationId: home === undefined ? null : `registration-${home}`, awayRegistrationId: away === undefined ? null : `registration-${away}`, homeTeamId: home === undefined ? null : `team-${home}`, awayTeamId: away === undefined ? null : `team-${away}`, homeTeamName: home === undefined ? 'TBD' : names[home], awayTeamName: away === undefined ? 'TBD' : names[away], homeTeamLogoUrl: null, awayTeamLogoUrl: null, result: null, videos: [], bracketSources: [] });
  let previous: V1TournamentFixture[] = [];
  for (const phase of phases) {
    const count = phase === 'round12' || phase === 'quarter' ? 4 : phase === 'semi' ? 2 : 1;
    const current = Array.from({ length: count }, (_, index) => {
      let fixture = make(phase, index + 1);
      if (phase === phases[0]) fixture = size === 12 ? make(phase, index + 1, index + 4, 11 - index) : make(phase, index + 1, index * 2, index * 2 + 1);
      else if (phase === 'quarter' && size === 12) {
        fixture = make(phase, index + 1, index);
        fixture.bracketSources = [{ fixtureId: previous[index].id, side: 'AWAY', outcome: 'WINNER' }];
      } else fixture.bracketSources = [{ fixtureId: previous[index * 2].id, side: 'HOME', outcome: 'WINNER' }, { fixtureId: previous[index * 2 + 1].id, side: 'AWAY', outcome: 'WINNER' }];
      fixtures.push(fixture); return fixture;
    });
    previous = current;
  }
  return { fixtures, groups };
}
