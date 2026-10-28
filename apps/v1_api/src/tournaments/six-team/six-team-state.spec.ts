import {
  rankSixTeamWinners,
  parseSixTeamState,
  type SixTeamResult,
} from './six-team-state';
import { planBracketTemplate } from '../templates/bracket-template-plan';
const result = (
  id: string,
  home: number,
  away: number,
  extra = {}
): SixTeamResult => ({
  id,
  homeRegistrationId: id + '-h',
  awayRegistrationId: id + '-a',
  revisionId: id + '-r',
  score: { home, away, ...extra },
});
describe('6강 기록 기반 직행과 수동 진출', () => {
  it('최다 득점은 득실차보다 우선한다', () => {
    const ranking = rankSixTeamWinners(
      [result('a', 5, 4), result('b', 4, 0), result('c', 2, 1)],
      {}
    );
    expect(ranking.automaticBye).toBe('a-h');
  });
  it('다득점 동률이면 득실차로 고른다', () => {
    expect(
      rankSixTeamWinners(
        [result('a', 5, 4), result('b', 5, 0), result('c', 2, 1)],
        {}
      ).automaticBye
    ).toBe('b-h');
  });
  it('완전 동률은 임의 경기번호나 팀 id로 결정하지 않는다', () => {
    expect(
      rankSixTeamWinners(
        [result('a', 2, 1), result('b', 2, 1), result('c', 1, 0)],
        {}
      ).automaticBye
    ).toBeNull();
  });
  it('승부차기 득점은 비교에서 제외하고 승리팀만 결정한다', () => {
    const ranked = rankSixTeamWinners(
      [
        result('a', 1, 1, { penalties: { home: 10, away: 9 } }),
        result('b', 3, 2),
        result('c', 2, 0),
      ],
      {}
    );
    expect(ranked.automaticBye).toBe('b-h');
    expect(
      ranked.candidates.find((row) => row.fixtureId === 'a')
    ).toMatchObject({ registrationId: 'a-h', goalsFor: 1, goalsAgainst: 1 });
  });
  it('공식 결과가 없거나 승리팀 미정이면 자동 선정하지 않는다', () => {
    expect(
      rankSixTeamWinners(
        [
          result('a', 5, 0),
          { ...result('b', 4, 0), revisionId: null },
          result('c', 2, 2),
        ],
        {}
      ).automaticBye
    ).toBeNull();
  });
  it('수동 진출은 점수를 바꾸지 않고 실제 참가팀 안에서만 허용한다', () => {
    const rows = [result('a', 5, 1), result('b', 4, 0), result('c', 2, 0)];
    expect(
      rankSixTeamWinners(rows, { a: 'a-a' }).candidates.find(
        (row) => row.fixtureId === 'a'
      )
    ).toMatchObject({ registrationId: 'a-a', goalsFor: 1 });
    expect(rows[0].score).toEqual({ home: 5, away: 1 });
    expect(() => rankSixTeamWinners(rows, { a: 'outside' })).toThrow();
  });
  it('미확정 점수가 있어도 수동 지정 가능하되 자동 비교는 대기한다', () => {
    const ranked = rankSixTeamWinners(
      ['a', 'b', 'c'].map((id) => ({
        ...result(id, 0, 0),
        revisionId: null,
        score: null,
      })),
      { a: 'a-h', b: 'b-a', c: 'c-h' }
    );
    expect(ranked.ready).toBe(true);
    expect(ranked.comparable).toBe(false);
    expect(ranked.automaticBye).toBeNull();
  });
});
describe('6강 전용 템플릿', () => {
  const input = {
    kind: 'knockout' as const,
    schemaVersion: 2 as const,
    size: 6,
    participantCount: 6,
    sixTeamMode: true,
    thirdPlace: false,
  };
  it('정확히 5경기와 초기 6자리를 만들고 고정 직행·승자 연결을 만들지 않는다', () => {
    const plan = planBracketTemplate(input, { fixtureNumberOffset: 10 });
    expect(plan.fixtures.map((row) => row.round)).toEqual([
      '6강',
      '6강',
      '6강',
      '준결승',
      '결승',
    ]);
    expect(plan.fixtures.map((row) => row.fixtureNumber)).toEqual([
      11, 12, 13, 14, 15,
    ]);
    expect(plan.slots).toHaveLength(6);
    expect(plan.byeSlots).toEqual([]);
    expect(plan.edges).toEqual([]);
    expect(
      plan.fixtures
        .slice(3)
        .every((row) => row.homeSlotKey === null && row.awaySlotKey === null)
    ).toBe(true);
  });
  it.each([
    { size: 8 },
    { thirdPlace: true },
    { participantCount: 5 },
    { kind: 'group_knockout' },
  ])('잘못된 조합 %j 거절', (patch) => {
    expect(() =>
      planBracketTemplate({ ...input, ...patch } as never, {
        fixtureNumberOffset: 0,
      })
    ).toThrow();
  });
  it('기존 일반 6팀 방식은 여전히 성적 비교 없이 만들어진다', () => {
    const plan = planBracketTemplate(
      { ...input, sixTeamMode: false },
      { fixtureNumberOffset: 0 }
    );
    expect(plan.fixtures.filter((row) => row.round === '6강')).toHaveLength(0);
    expect(plan.fixtures).toHaveLength(5);
  });
  it('손상된 상태를 유효한 대진으로 읽지 않는다', () => {
    expect(parseSixTeamState({ rounds: ['a', 'a', 'b', 'c', 'd'] })).toBeNull();
  });
});
