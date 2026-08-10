/**
 * tournament-group-standings.spec.ts
 *
 * 승부차기 트랙 B의 마지막 요구사항: "승부차기가 조별 순위의 승/무/패를 바꾸지 않는다".
 * `standingsFixturesFromGroup()`이 실제로 `resolveTournamentFixtureOfficialScore()`가
 * 돌려주는 `TournamentFixtureOfficialScore`에서 `homeScore`/`awayScore`만 뽑아 쓰고
 * `hasPenalty`/`homePenaltyScore`/`awayPenaltyScore`는 아예 읽지 않는다는 사실을 실제
 * 함수 호출로 증명한다(필드 존재만 확인하는 것이 아니라, 승부차기로 결정된 무승부 픽스처를
 * 넣었을 때 결과 StandingFixture가 정규시간 스코어 그대로인지 검증).
 */
import { standingsFixturesFromGroup, type StandingsSourceGroup } from './tournament-group-standings';

describe('standingsFixturesFromGroup (승부차기는 조별 순위에 영향을 주지 않는다)', () => {
  it('정규시간 무승부 + 승부차기 기록이 있어도 StandingFixture는 정규시간 스코어(무승부) 그대로다', () => {
    const group: StandingsSourceGroup = {
      id: 'group-1',
      groupTeams: [{ registrationId: 'reg-home' }, { registrationId: 'reg-away' }],
      fixtures: [
        {
          homeRegistrationId: 'reg-home',
          awayRegistrationId: 'reg-away',
          game: {
            // Flat producer shape written by GamesService.applyPenalties for
            // a knockout draw resolved by a shootout -- see
            // tournament-fixture-official-result.ts's file doc.
            currentOfficialRevision: {
              state: 'OFFICIAL',
              score: { home: 1, away: 1, penalties: { home: 5, away: 4 } },
            },
          },
        },
      ],
    };

    const fixtures = standingsFixturesFromGroup(group);

    expect(fixtures).toEqual([
      {
        homeRegistrationId: 'reg-home',
        awayRegistrationId: 'reg-away',
        homeScore: 1,
        awayScore: 1,
      },
    ]);
  });
});
