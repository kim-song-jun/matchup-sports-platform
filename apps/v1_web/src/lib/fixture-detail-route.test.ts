import { describe, expect, it } from 'vitest';
import { fixtureDetailHref } from './fixture-detail-route';

describe('fixtureDetailHref', () => {
  it('대회는 대회 경기 상세로 간다', () => {
    expect(fixtureDetailHref({ isRegularLeague: false, competitionId: 't-1', fixtureId: 'f-1' })).toBe(
      '/tournaments/t-1/matches/f-1',
    );
  });

  /**
   * 이 갈림이 없으면 리그 일정·대진표의 모든 경기 카드가 **죽은 링크**가 된다. 서버가
   * 리그 대진을 대회 일정 행으로 변환해 내려주기 때문에 `fixtureId` 에는 팀 매치 id 가
   * 들어 있고, 대회 패턴으로 링크하면 `GET /tournaments/:id/matches/:fixtureId` 가
   * 404 다(리그는 `V1TournamentFixture` 가 0행이다).
   */
  it('정규 리그는 리그 경기 상세로 간다 — 같은 값이 팀 매치 id 다', () => {
    expect(fixtureDetailHref({ isRegularLeague: true, competitionId: 'l-1', fixtureId: 'tm-1' })).toBe(
      '/league-matches/l-1/fixtures/tm-1',
    );
  });

  it('경로 조각을 인코딩한다', () => {
    expect(fixtureDetailHref({ isRegularLeague: true, competitionId: 'a/b', fixtureId: 'c d' })).toBe(
      '/league-matches/a%2Fb/fixtures/c%20d',
    );
  });
});
