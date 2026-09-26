import { FORFEIT_REASON_MARKER } from './league-match-forfeit.service';
import {
  toLeagueFixtureList,
  type LeagueFixtureFactRow,
  type LeagueFixtureListRow,
} from './league-fixture-list-source';

/**
 * 이 스펙이 잡는 것은 **공개 응답이 조용히 거짓말하는 것**이다.
 *
 * 두 계약 모두 "값이 틀리는" 게 아니라 "그럴듯한 값이 나오는" 종류라 눈으로는 안 잡힌다:
 * - 미확정 대진의 점수를 `0` 으로 채우면 화면이 **0:0 무승부**로 읽는다.
 * - 몰수 사유 원문이 새면 운영자가 쓴 자유 텍스트가 관전자에게 그대로 나간다.
 */

const START = new Date('2026-09-05T09:00:00.000Z');

function row(over: Partial<LeagueFixtureListRow> = {}): LeagueFixtureListRow {
  return {
    id: 'tm-1',
    title: '1R A vs B',
    hostTeamId: 'team-a',
    approvedApplicantTeamId: 'team-b',
    startAt: START,
    placeName: '풋살장 A',
    status: 'matched',
    game: { id: 'game-1', currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'LIVE' } },
    ...over,
  };
}

function fact(over: Partial<LeagueFixtureFactRow> = {}): LeagueFixtureFactRow {
  return { homeScore: 3, awayScore: 1, resultRevision: { reason: null, outcomeReason: 'NORMAL' }, ...over };
}

describe('toLeagueFixtureList', () => {
  it('확정 사실이 없으면 점수는 0 이 아니라 null 이다', () => {
    // `0` 으로 채우면 아직 안 치른 경기가 0:0 무승부로 보인다 — 순위표와도 어긋난다.
    const [item] = toLeagueFixtureList([row()], new Map(), true);
    expect(item.homeScore).toBeNull();
    expect(item.awayScore).toBeNull();
    expect(item.isForfeit).toBe(false);
    expect(item).toMatchObject({ homeTeamId: 'team-a', homeAssigned: true, awayTeamId: 'team-b', awayAssigned: true });
  });

  it('게임 자체가 없는 대진도 같은 모양으로 나온다', () => {
    const [item] = toLeagueFixtureList([row({ game: null })], new Map([['game-1', fact()]]), true);
    expect(item.homeScore).toBeNull();
    expect(item.awayScore).toBeNull();
  });

  it('확정 사실이 있으면 그 점수를 그대로 싣는다', () => {
    const [item] = toLeagueFixtureList([row()], new Map([['game-1', fact()]]), true);
    expect(item).toMatchObject({ homeScore: 3, awayScore: 1, isForfeit: false });
  });

  it('몰수는 boolean 으로만 나가고 사유 원문은 응답에 없다', () => {
    // 사유는 운영자가 쓴 자유 텍스트다. 관전자에게 그대로 나가면 안 되지만, 몰수임을
    // 알리지 않으면 관례 스코어 1:0 이 실제 1:0 승리와 구분되지 않는다.
    const secret = '상대팀이 무단 불참했고 담당자 김OO 확인';
    const [item] = toLeagueFixtureList(
      [row()],
      new Map([['game-1', fact({ homeScore: 1, awayScore: 0, resultRevision: { reason: secret, outcomeReason: 'FORFEIT' } })]]),
      true,
    );
    expect(item.isForfeit).toBe(true);
    expect(JSON.stringify(item)).not.toContain('김OO');
    expect(JSON.stringify(item)).not.toContain('FORFEIT');
  });

  it('레거시 리비전은 reason 의 표식으로도 몰수를 판정한다', () => {
    // `outcomeReason` 컬럼이 생기기 전에 만들어진 리비전이 아직 있다.
    const [item] = toLeagueFixtureList(
      [row()],
      // 마커 문자열을 여기 적지 않는다 — 상수를 import 한다. 손으로 적으면 그 값이
      // 바뀌었을 때 이 테스트가 **틀린 이유로** red 가 되고(실제로 그렇게 한 번 틀렸다),
      // 값이 무엇인지가 아니라 "레거시 경로가 살아 있는가" 가 이 테스트의 질문이다.
      new Map([['game-1', fact({ resultRevision: { reason: `${FORFEIT_REASON_MARKER} 불참`, outcomeReason: 'NORMAL' } })]]),
      true,
    );
    expect(item.isForfeit).toBe(true);
  });

  it('상대팀이 없는 대진도 목록에서 빠지지 않는다', () => {
    // 순위 입력(`bucketLeagueFixtures`)은 이런 대진을 pending 으로 접지만, 일정 목록은
    // "상대팀 미정" 으로 보여줘야 한다 — 두 모듈이 다른 질문에 답하는 이유다.
    const [item] = toLeagueFixtureList([row({ approvedApplicantTeamId: null })], new Map(), true);
    expect(item.awayTeamId).toBeNull();
    expect(item.teamMatchId).toBe('tm-1');
  });

  it('홈팀이 아직 배정되지 않은 대진은 홈 identity를 가리고 assignment를 false로 둔다', () => {
    const [item] = toLeagueFixtureList([row({ hostTeamId: null })], new Map(), true);
    expect(item).toMatchObject({ homeTeamId: null, homeAssigned: false, awayTeamId: 'team-b', awayAssigned: true });
  });

  it('PUBLIC_LIVE 가 꺼져도 확정 점수는 그대로 공개한다', () => {
    // 킬스위치는 LIVE 를 `official_only` 로 강등시킨다 — 진행 중 숫자만 끊고 확정본은
    // 남긴다. 플래그 row 가 없는 환경이 전부 off 라, 여기서 가리면 새로 띄운 모든
    // 환경에서 확정된 리그 결과가 사라진다.
    const [item] = toLeagueFixtureList([row()], new Map([['game-1', fact()]]), false);
    expect(item).toMatchObject({ homeScore: 3, awayScore: 1, scoreHidden: false });
  });

  it('가려진 대진의 몰수 뱃지도 함께 지운다', () => {
    // 몰수 뱃지는 "1:0 으로 확정" 을 그대로 말한다 — 숫자만 가리면 가린 적이 없는 것과 같다.
    const [item] = toLeagueFixtureList(
      [row({ game: { id: 'game-1', currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'STATUS_ONLY' } } })],
      new Map([['game-1', fact({ homeScore: 1, awayScore: 0, resultRevision: { reason: null, outcomeReason: 'FORFEIT' } })]]),
      true,
    );
    expect(item).toMatchObject({ isForfeit: false, scoreHidden: true });
  });

  it('STATUS_ONLY 정책은 플래그가 켜져 있어도 점수를 가린다', () => {
    const [item] = toLeagueFixtureList(
      [row({ game: { id: 'game-1', currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'STATUS_ONLY' } } })],
      new Map([['game-1', fact()]]),
      true,
    );
    expect(item).toMatchObject({ homeScore: null, scoreHidden: true });
  });

  it('OFFICIAL_ONLY 정책은 확정 점수를 그대로 공개한다', () => {
    // 이 모드가 감추는 것은 **확정 전** 숫자다. 목록은 확정 사실만 싣는다.
    const [item] = toLeagueFixtureList(
      [row({ game: { id: 'game-1', currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'OFFICIAL_ONLY' } } })],
      new Map([['game-1', fact()]]),
      true,
    );
    expect(item).toMatchObject({ homeScore: 3, awayScore: 1, scoreHidden: false });
  });

  it('정책 row 가 없는 게임은 점수만 가리고 행은 남긴다', () => {
    // 주차 라벨과 '다음 경기' 강조가 이 배열의 길이·순서에서 파생된다 — 행을 빼면 같은
    // 경기의 주차가 보는 사람마다 달라진다. fail-closed 는 점수에만 적용한다.
    const items = toLeagueFixtureList(
      [row({ game: { id: 'game-1', currentOfficialRevisionId: 'rev-1', visibilityPolicy: null } })],
      new Map([['game-1', fact()]]),
      true,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ homeScore: null, scoreHidden: true, startAt: START });
  });

  it('가리는 정책이어도 확정 사실이 없으면 "가렸다"고 말하지 않는다', () => {
    // scoreHidden 은 "확정됐는데 공개만 안 한다" 는 뜻이다. 아직 치르지 않은 경기까지
    // true 로 내보내면 화면이 '예정' 대신 '점수 비공개' 라고 적어 관전자를 오해시킨다.
    const [item] = toLeagueFixtureList(
      [row({ game: { id: 'game-1', currentOfficialRevisionId: null, visibilityPolicy: { mode: 'STATUS_ONLY' } } })],
      new Map(),
      true,
    );
    expect(item).toMatchObject({ scoreHidden: false, homeScore: null, awayScore: null });
  });

  it('게임이 없는 대진은 숨김이 아니라 "아직 시작 전"이다', () => {
    // `?? 'HIDDEN'` 를 게임 없는 행에까지 적용하면 앞으로의 일정이 통째로 가려진다.
    const [item] = toLeagueFixtureList([row({ game: null })], new Map(), false);
    expect(item).toMatchObject({ scoreHidden: false, homeScore: null });
  });

  it('취소·무효 대진도 목록에는 남는다', () => {
    // 순위에서는 빠지지만 일정에는 "취소됨"·"집계 제외"로 보여야 한다.
    const items = toLeagueFixtureList([row({ id: 'a', status: 'cancelled' }), row({ id: 'b' })], new Map(), true);
    expect(items.map((i) => i.teamMatchId)).toEqual(['a', 'b']);
    expect(items[0].status).toBe('cancelled');
  });
});
