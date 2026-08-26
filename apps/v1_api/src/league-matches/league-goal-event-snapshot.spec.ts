import { parseTournamentFixtureRevisionGoals } from '../tournaments/tournament-fixture-official-result';
import { buildLeagueGoalEventSnapshot } from './league-goal-event-snapshot';

describe('buildLeagueGoalEventSnapshot', () => {
  it('선수별 득점을 골 1개당 한 줄로 펼치고, 0골은 싣지 않는다', () => {
    const snapshot = buildLeagueGoalEventSnapshot([
      { participantId: 'p-h1', sideId: 'side-home', goals: 2 },
      { participantId: 'p-h2', sideId: 'side-home', goals: 0 },
      { participantId: 'p-a1', sideId: 'side-away', goals: 1 },
    ]);
    expect(snapshot).toEqual([
      { id: 'p-h1:1', sideId: 'side-home', participantId: 'p-h1', minute: null, period: null, ownGoal: false },
      { id: 'p-h1:2', sideId: 'side-home', participantId: 'p-h1', minute: null, period: null, ownGoal: false },
      { id: 'p-a1:1', sideId: 'side-away', participantId: 'p-a1', minute: null, period: null, ownGoal: false },
    ]);
  });

  it('득점이 하나도 없으면 빈 배열이다 (호출자가 스냅샷을 저장하지 않는 신호)', () => {
    // 빈 배열을 리비전에 저장하면 buildEvents 가 이벤트 레인을 통째로 대체해 실제 골
    // 이벤트까지 화면에서 사라진다 — 그래서 "쓰지 않음"과 "0건"을 구분할 수 있어야 한다.
    expect(buildLeagueGoalEventSnapshot([{ participantId: 'p-h1', sideId: 'side-home', goals: 0 }])).toEqual([]);
    expect(buildLeagueGoalEventSnapshot([])).toEqual([]);
  });

  /**
   * 공개 타임라인의 실제 관문. 파서가 `null` 을 돌려주면 `buildEvents` 는 스냅샷을 통째로
   * 무시하고 (리그에는 존재하지 않는) 이벤트 레인으로 되돌아가 화면이 다시 비어 버린다 —
   * 그 회귀는 이 왕복 검증에서만 잡힌다.
   */
  it('공개 프로젝션의 파서가 그대로 받아들인다 (분·전후반은 "모름"으로 보존)', () => {
    const snapshot = buildLeagueGoalEventSnapshot([{ participantId: 'p-h1', sideId: 'side-home', goals: 2 }]);
    const parsed = parseTournamentFixtureRevisionGoals(JSON.parse(JSON.stringify(snapshot)));
    expect(parsed).toEqual([
      { id: 'p-h1:1', sideId: 'side-home', participantId: 'p-h1', minute: null, period: null, ownGoal: false },
      { id: 'p-h1:2', sideId: 'side-home', participantId: 'p-h1', minute: null, period: null, ownGoal: false },
    ]);
  });

  it('같은 입력에서 항상 같은 id 가 나오고 id 는 유일하다 (멱등 재시도가 화면을 흔들지 않는다)', () => {
    const rows = [
      { participantId: 'p-h1', sideId: 'side-home', goals: 3 },
      { participantId: 'p-a1', sideId: 'side-away', goals: 1 },
    ];
    const first = buildLeagueGoalEventSnapshot(rows);
    expect(buildLeagueGoalEventSnapshot(rows)).toEqual(first);
    const ids = first.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
