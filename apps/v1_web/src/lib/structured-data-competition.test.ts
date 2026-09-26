import { describe, expect, it } from 'vitest';
import type { PublicMatchDetail } from '@/components/public-game-records/types';
import { buildSportsEventLd, buildSportsTeamLd } from '@/lib/structured-data';
import { buildFixtureEventLd, buildLeagueEventLd } from '@/lib/structured-data-competition';
import type { V1TeamDetail, V1TournamentDetail } from '@/types/api';
import type { V1LeagueStandingsResponse, V1PublicLeagueDetail } from '@/types/league-match';

const league = {
  leagueId: 'lg1', title: '송파 풋살 리그 1시즌', startsOn: '2026-09-17T00:00:00.000Z', endsOn: '2026-12-16T00:00:00.000Z',
} as V1PublicLeagueDetail;

const fixture = (over: Partial<PublicMatchDetail> = {}) => ({
  tournamentId: 't1', tournamentTitle: '가을 풋살컵', fixtureId: 'f1', round: '결승',
  scheduledAt: '2026-10-03T01:00:00.000Z', venue: '송파 풋살파크', fieldName: 'A코트', status: 'completed',
  home: { registrationId: 'r1', teamId: 'team-a', teamName: '송파 유나이티드' },
  away: { registrationId: 'r2', teamId: 'team-b', teamName: '한강 로버스' },
  scoreStatus: 'official', score: { home: 2, away: 1, penalties: null },
  ...over,
}) as PublicMatchDetail;

describe('buildLeagueEventLd', () => {
  it('순위표의 팀을 팀 상세 LD 와 같은 @id 로 참가 팀에 연결한다', () => {
    const standings = { standings: [{ teamId: 'team-a', teamName: '송파 유나이티드' }] } as V1LeagueStandingsResponse;
    const teamPageLd = buildSportsTeamLd({ id: 'team-a', name: '송파 유나이티드' } as V1TeamDetail);

    const ld = buildLeagueEventLd(league, standings);

    expect(ld.competitor).toEqual([expect.objectContaining({ '@id': teamPageLd['@id'], name: '송파 유나이티드' })]);
    expect(ld).toMatchObject({ startDate: league.startsOn, endDate: league.endsOn });
  });

  it('순위표가 없거나 비어 있으면 참가 팀을 지어내지 않는다', () => {
    expect(buildLeagueEventLd(league, null)).not.toHaveProperty('competitor');
    expect(buildLeagueEventLd(league, { standings: [] } as unknown as V1LeagueStandingsResponse)).not.toHaveProperty('competitor');
  });
});

describe('buildFixtureEventLd', () => {
  it('상위 대회는 대회 상세 LD 와 같은 @id 로, 두 팀은 팀 상세 @id 로 잇는다', () => {
    const tournamentLd = buildSportsEventLd({
      id: 't1', title: '가을 풋살컵', scheduledAt: '2026-10-03T01:00:00.000Z', status: 'open',
      sport: { code: 'futsal', name: '풋살' }, entryFee: 0,
    } as V1TournamentDetail);

    const ld = buildFixtureEventLd(fixture());

    expect(ld?.superEvent).toEqual({ '@id': tournamentLd?.['@id'] });
    expect(ld?.homeTeam).toMatchObject({ '@id': 'https://teameet.co.kr/teams/team-a#team' });
    expect(ld?.location).toMatchObject({ name: '송파 풋살파크 A코트' });
  });

  it('확정된 점수만 싣고, 진행 중·확정 전 점수는 싣지 않는다', () => {
    expect(buildFixtureEventLd(fixture())?.description).toBe('최종 스코어 송파 유나이티드 2 : 1 한강 로버스');
    expect(buildFixtureEventLd(fixture({ scoreStatus: 'pending' }))).not.toHaveProperty('description');
    expect(buildFixtureEventLd(fixture({ scoreStatus: 'live' }))).not.toHaveProperty('description');
  });

  it('일정 미정 경기는 LD 를 내지 않고, 취소 경기는 취소 상태로 적는다', () => {
    expect(buildFixtureEventLd(fixture({ scheduledAt: null }))).toBeNull();
    expect(buildFixtureEventLd(fixture({ status: 'cancelled' }))?.eventStatus).toBe('https://schema.org/EventCancelled');
  });
});
