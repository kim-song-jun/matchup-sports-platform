import { ConflictException } from '@nestjs/common';
import {
  assertBracketResolvable,
  assertPenaltiesNotAllowed,
  needsKnockoutFixtureFacts,
  readStoredPenalties,
  requiresDecisiveResult,
  type KnockoutFixtureFacts,
} from './knockout-penalties';

/**
 * 결선(knockout) 승부차기 가드의 순수 함수 계약.
 *
 * ## 이 스펙이 존재하는 이유 — 지금 이 계약은 어디에도 없다
 *
 * `GamesService.applyPenalties`(games.service.ts)에는 같은 판정이 **private
 * 메서드 + 트랜잭션 DB 조회와 한 덩어리로 엉켜** 있어서, `end` 커맨드 전체를
 * 통합테스트로 몰고 가지 않으면 한 줄도 검증할 수 없다. 그래서 **정정
 * (correction) 레인에는 같은 가드가 아예 복제되지 않았다** —
 * `tournament-result-review.service.ts` 전체를 `penalt|isKnockout|KNOCKOUT`으로
 * grep하면 히트가 타입 선언 한 줄(`ResultRevisionContentInput.score.penalties?`)
 * 뿐이다. 판정을 순수 함수로 꺼내 두 레인이 같은 함수를 부르게 만드는 것이
 * 이 계약의 목적이고, 이 파일은 그 함수의 계약을 DB 없이 못박는다.
 *
 * ## 막으려는 실제 사고 (이미 한 번 났다)
 *
 * 결선 무승부가 그대로 확정되면 →
 * `GameResultBracketProjectionService.resolveWinnerSide`가
 * `BRACKET_RESULT_DRAW_UNSUPPORTED`를 던지고 → outbox 잡이 6회 재시도 끝에
 * 조용히 POISONED로 남는다. 운영자 화면에는 "성공"만 보이고, 다음 라운드
 * 대진이 영영 비어 있는 것을 나중에야 알게 된다. 실패는 비동기 잡이 아니라
 * 커맨드 자리에서 돌려줘야 그 자리에서 승부차기를 입력해 복구할 수 있다.
 *
 * ## 문구·상태코드는 바이트 동일해야 한다
 *
 * 아래 단언의 코드/메시지는 `applyPenalties`의 현행 값을 그대로 옮긴 것이다.
 * 특히 `TOURNAMENT_PENALTY_NOT_ALLOWED` **두 건의 메시지는 서로 다르다**
 * (knockout 아님 / 정규시간이 무승부 아님) — 두 분기를 한 문구로 합치면
 * 운영자가 무엇을 고쳐야 하는지 알 수 없게 되므로 회귀다. 한국어 문구는
 * `TOURNAMENT_PENALTY_REQUIRED` 한 건뿐이고, 나머지 둘은 영문 원문 그대로
 * 유지한다(번역은 동작 변경이다).
 */
const REQUIRED_MESSAGE = '결선 경기는 무승부로 끝낼 수 없어요. 승부차기 결과를 입력해주세요.';
/**
 * 엣지만으로 걸린 경우의 별도 문구. 위 문구를 재사용하면 **불가능한 행동을
 * 지시하게 된다** — 그 조합에서는 `assertPenaltiesNotAllowed`가 승부차기를
 * 거부하기 때문이다(아래 `notKnockoutWithEdges` 블록 참조). 이 조합의 무승부는
 * 이 변경 전에는 아무 예외도 던지지 않았으므로 보존해야 할 기존 문구가 없다.
 */
const EDGE_ONLY_REQUIRED_MESSAGE =
  '이 경기 결과로 다음 라운드 진출 팀이 정해지는데 무승부여서 확정할 수 없어요. 대회 대진 설정(조 배정·라운드)을 확인해주세요.';
const NOT_KNOCKOUT_MESSAGE = 'Penalty shootouts can only be recorded for knockout-phase fixtures';
const NOT_LEVEL_MESSAGE = 'Penalty shootouts are only recorded when regulation time ends level';

/** 결선 픽스처이고 다음 라운드로 가는 진출 엣지도 있는 흔한 준결승. */
const knockoutWithEdges: KnockoutFixtureFacts = {
  isKnockoutFixture: true,
  hasAdvancementEdges: true,
};

/**
 * 결선이지만 진출 엣지가 없는 픽스처(결승·3/4위전). 브래킷 프로젝션은
 * `edges.length === 0`에서 그냥 return하므로 POISONED가 될 수 없지만,
 * `applyPenalties`의 기존 동작은 여기서도 무승부를 거부해 왔다 — 그 정책을
 * 그대로 보존한다(이 PR은 검증을 조이기만 한다).
 */
const knockoutWithoutEdges: KnockoutFixtureFacts = {
  isKnockoutFixture: true,
  hasAdvancementEdges: false,
};

/** 조별리그. 무승부는 정상 결과다. */
const groupStage: KnockoutFixtureFacts = {
  isKnockoutFixture: false,
  hasAdvancementEdges: false,
};

/**
 * `isKnockoutFixture`가 false인데 진출 엣지는 걸려 있는 경우. 리팩터 전
 * `applyPenalties`는 여기서 무승부를 그냥 통과시키고, 그 결과가 정확히
 * POISONED다 — `resolveWinnerSide`는 phase를 보지 않고 엣지만 보기 때문이다.
 *
 * ⚠️ 이 하나의 fact 조합에 **서로 다른 두 현실이 뭉쳐 있다**:
 *  (a) `groupId`가 없어 `readIsKnockoutFixture`가 보수적으로 false를 준 픽스처,
 *  (b) 진짜 조별 phase(`group.phase === 'group'`) 픽스처에 엣지가 걸린 경우.
 * `KnockoutFixtureFacts`에 그 둘을 구분하는 필드가 없으므로 **테스트로도 구분할
 * 수 없다** — 그래서 이름을 `groupless…`로 두지 않는다(이전 이름은 (b)를
 * 배제한다는 착각을 준다).
 *
 * 결과적으로 이 조합은 무승부도(REQUIRED) 승부차기도(NOT_ALLOWED) 거부되는
 * **입력이 없는 상태**다. (b)에서 승부차기를 허용하면 조별 순위 계약이 깨지므로
 * NOT_ALLOWED를 느슨하게 만들 수는 없다. 그래서 원인을 입력이 아니라 **대진
 * 설정**으로 지목하는 별도 문구(`EDGE_ONLY_REQUIRED_MESSAGE`)를 쓴다. 오늘 이
 * 조합은 프로덕션에서 도달 불가하다: `v1_tournament_fixture_advancement_edges`에
 * 행을 만드는 쓰기 경로가 코드베이스에 없다(테스트·직접 INSERT뿐).
 */
const notKnockoutWithEdges: KnockoutFixtureFacts = {
  isKnockoutFixture: false,
  hasAdvancementEdges: true,
};

function captureThrow(operation: () => void): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the guard to throw');
}

function expectConflict(operation: () => void, code: string, message: string): void {
  const error = captureThrow(operation);
  expect(error).toBeInstanceOf(ConflictException);
  const exception = error as ConflictException;
  expect(exception.getStatus()).toBe(409);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code, message }));
}

describe('assertBracketResolvable', () => {
  it('결선 정규시간 무승부인데 승부차기가 없으면 409 TOURNAMENT_PENALTY_REQUIRED로 막는다', () => {
    expectConflict(
      () => assertBracketResolvable({ home: 1, away: 1 }, knockoutWithEdges),
      'TOURNAMENT_PENALTY_REQUIRED',
      REQUIRED_MESSAGE,
    );
  });

  it('결선 무승부라도 승부차기가 승자를 만들면 통과한다', () => {
    expect(() =>
      assertBracketResolvable({ home: 1, away: 1, penalties: { home: 5, away: 4 } }, knockoutWithEdges),
    ).not.toThrow();
  });

  it('조별리그 무승부는 정상 결과이므로 막지 않는다', () => {
    expect(() => assertBracketResolvable({ home: 0, away: 0 }, groupStage)).not.toThrow();
  });

  it('정규시간에 승자가 나왔으면 결선이어도 통과한다', () => {
    expect(() => assertBracketResolvable({ home: 2, away: 1 }, knockoutWithEdges)).not.toThrow();
  });

  /**
   * 승부차기 점수가 동점이면 승자가 없으므로 브래킷은 여전히 해결 불가다.
   *
   * 이 분기에 **도달하는 프로덕션 경로는 정정/재제출 레인의 승계**다:
   * 그 레인의 폼은 평평한 `{home, away}`만 보내므로 서버가 base 리비전의
   * `score.penalties`를 `readStoredPenalties`로 읽어 승계하는데(승계하지 않으면
   * 승부차기로 결정된 결선 경기를 아예 정정할 수 없다), 그 저장값이 동점인
   * 레거시 리비전이면 승자가 없다. `readStoredPenalties`가 동점을 걸러내지 않고
   * 그대로 넘기는 이유가 이것이다 — 여기서 "브래킷 해결 불가"라는 정확한 이유로
   * 거부시키기 위해서다.
   *
   * `end` 레인에서는 `extractEndPenalties`가 422
   * `TOURNAMENT_PENALTY_INVALID`('A penalty shootout must produce a decisive
   * winner')로 먼저 걸러 여기까지 오지 않는다.
   */
  it('승부차기 점수가 동점이면(승계된 레거시 값) 여전히 브래킷을 해결할 수 없어 막는다', () => {
    expectConflict(
      () => assertBracketResolvable({ home: 1, away: 1, penalties: { home: 3, away: 3 } }, knockoutWithEdges),
      'TOURNAMENT_PENALTY_REQUIRED',
      REQUIRED_MESSAGE,
    );
  });

  it('결선이지만 진출 엣지가 없는 픽스처(결승·3/4위전)의 무승부도 기존 정책대로 막는다', () => {
    expectConflict(
      () => assertBracketResolvable({ home: 0, away: 0 }, knockoutWithoutEdges),
      'TOURNAMENT_PENALTY_REQUIRED',
      REQUIRED_MESSAGE,
    );
  });

  /**
   * 의도된 확장. `isKnockoutFixture`는 `groupId`가 없으면 보수적으로 false를
   * 주지만 `resolveWinnerSide`는 phase를 아예 보지 않고 진출 엣지만 본다 —
   * 그래서 이 조합의 무승부는 리팩터 전 코드에서 통과한 뒤 POISONED가 된다.
   * `hasAdvancementEdges`를 술어에 OR로 넣는 유일한 이유가 이것이다.
   *
   * 문구는 knockout 쪽과 **달라야 한다**: 이 조합에서는 승부차기를 실어도
   * `assertPenaltiesNotAllowed`가 거부하므로 "승부차기를 입력해주세요"는
   * 불가능한 행동을 지시하는 것이 된다. 원인은 입력이 아니라 대진 설정이다.
   */
  it('knockout 판정이 false인데 진출 엣지가 있는 픽스처의 무승부는 대진 설정을 지목하며 막는다', () => {
    expectConflict(
      () => assertBracketResolvable({ home: 2, away: 2 }, notKnockoutWithEdges),
      'TOURNAMENT_PENALTY_REQUIRED',
      EDGE_ONLY_REQUIRED_MESSAGE,
    );
  });

  it('그 문구는 결선 문구와 달라야 한다 — 같으면 실행 불가능한 지시가 된다', () => {
    const knockout = captureThrow(() =>
      assertBracketResolvable({ home: 2, away: 2 }, knockoutWithEdges),
    ) as ConflictException;
    const edgeOnly = captureThrow(() =>
      assertBracketResolvable({ home: 2, away: 2 }, notKnockoutWithEdges),
    ) as ConflictException;

    expect(knockout.getResponse()).not.toEqual(edgeOnly.getResponse());
  });
});

/**
 * `assertBracketResolvable`이 쓰는 술어를 정정 레인이 **그대로** 재사용한다
 * ("base의 승부차기를 승계해야 하는가"). 두 판단이 갈리면 조별리그 정정에
 * 승부차기가 승계되어 `assertPenaltiesNotAllowed`가 그 정정을 거부해 버린다 —
 * 정상 흐름이 막히는 회귀다. 그래서 술어는 이 함수 하나뿐이어야 한다.
 */
/**
 * 사실 조회 생략 술어. 이게 틀리면 두 가드 중 하나가 **건너뛰어진다** — 그래서
 * "생략해도 결과가 같다"를 술어 단위로 못박는다: 생략 조건은 정확히 "승부차기
 * 없음 + 정규시간 결정적"이어야 하고, 그 조건에서 두 가드는 어떤 fact 값에도
 * 통과한다(아래 마지막 두 테스트가 그 등가성을 확인한다).
 */
describe('needsKnockoutFixtureFacts', () => {
  it.each([
    ['승부차기 있음 + 결정적', { home: 2, away: 1 }, { home: 5, away: 4 }, true],
    ['승부차기 있음 + 동점', { home: 1, away: 1 }, { home: 5, away: 4 }, true],
    ['승부차기 없음 + 동점', { home: 1, away: 1 }, undefined, true],
    ['승부차기 없음 + 결정적', { home: 2, away: 1 }, undefined, false],
  ])('%s → %s', (_label, score, penalties, expected) => {
    expect(
      needsKnockoutFixtureFacts(
        score as { home: number; away: number },
        penalties as { home: number; away: number } | undefined,
      ),
    ).toBe(expected);
  });

  it.each([
    ['결선 + 엣지', knockoutWithEdges],
    ['knockout 아님 + 엣지', notKnockoutWithEdges],
    ['조별리그', groupStage],
  ])('생략 조건에서는 어떤 fact(%s)여도 가드가 통과한다 — 생략이 판정을 바꾸지 않는다', (_label, facts) => {
    expect(() => assertBracketResolvable({ home: 2, away: 1 }, facts as KnockoutFixtureFacts)).not.toThrow();
  });
});

describe('requiresDecisiveResult', () => {
  it.each([
    ['결선 + 엣지', knockoutWithEdges, true],
    ['결선, 엣지 없음(결승·3/4위전)', knockoutWithoutEdges, true],
    ['knockout 아님 + 엣지', notKnockoutWithEdges, true],
    ['조별리그', groupStage, false],
  ])('%s → %s', (_label, facts, expected) => {
    expect(requiresDecisiveResult(facts as KnockoutFixtureFacts)).toBe(expected);
  });
});

/**
 * 저장된 리비전 `score`에서 승부차기를 승계하기 위한 관용적 리더.
 *
 * 이 함수가 없으면 승부차기로 결정된 결선 경기는 **어떤 정정도** 409
 * `TOURNAMENT_PENALTY_REQUIRED`로 거부된다: 정정 폼(`result-edit-modal.tsx`)은
 * 평평한 `{home, away}`만 보내고 클라이언트 타입 `V1GameResultScoreInput`에는
 * penalties 필드조차 없어서, 서버가 base 값을 승계하지 않으면 그 지시("승부차기
 * 결과를 입력해주세요")를 만족시킬 수단이 UI에 존재하지 않는다.
 *
 * `extractEndPenalties`와 달리 **throw하지 않는다** — 여기 들어오는 값은 사용자
 * 입력이 아니라 이미 DB에 있는 값이므로, 형태가 깨졌다고 운영자의 정정 요청을
 * 422로 되돌리면 원인을 오도한다.
 */
describe('readStoredPenalties', () => {
  it('평평한 저장 형태에서 승부차기를 읽는다', () => {
    expect(readStoredPenalties({ home: 1, away: 1, penalties: { home: 5, away: 4 } })).toEqual({
      home: 5,
      away: 4,
    });
  });

  it('동점 승부차기도 그대로 돌려준다 — assertBracketResolvable이 정확한 이유로 거부해야 한다', () => {
    expect(readStoredPenalties({ home: 1, away: 1, penalties: { home: 3, away: 3 } })).toEqual({
      home: 3,
      away: 3,
    });
  });

  it.each([
    ['penalties 없음', { home: 1, away: 0 }],
    ['null', { home: 1, away: 1, penalties: null }],
    ['배열', { home: 1, away: 1, penalties: [] }],
    ['빈 객체', { home: 1, away: 1, penalties: {} }],
    ['home이 문자열', { home: 1, away: 1, penalties: { home: 'a', away: 0 } }],
    ['away 누락', { home: 1, away: 1, penalties: { home: 5 } }],
    ['음수', { home: 1, away: 1, penalties: { home: -1, away: 0 } }],
    ['소수', { home: 1, away: 1, penalties: { home: 5.5, away: 4 } }],
    ['score 자체가 null', null],
    ['score 자체가 배열', []],
    ['score 자체가 숫자', 3],
    // 백필된 중첩 형태. `parse-official-score.ts`의 docblock대로 `penalties`는
    // 평평한 프로듀서만 쓰므로 중첩 안쪽은 보지 않는다.
    ['중첩 백필 형태', { regulation: { home: 1, away: 1 }, penalty: { home: 5, away: 4 } }],
  ])('%s이면 승계할 값이 없다', (_label, stored) => {
    expect(readStoredPenalties(stored)).toBeUndefined();
  });
});

describe('assertPenaltiesNotAllowed', () => {
  it('결선 + 정규시간 무승부에 실린 승부차기는 허용한다', () => {
    expect(() =>
      assertPenaltiesNotAllowed({ home: 1, away: 1 }, { home: 5, away: 4 }, knockoutWithEdges),
    ).not.toThrow();
  });

  it('조별리그 픽스처에는 승부차기를 기록할 수 없다', () => {
    expectConflict(
      () => assertPenaltiesNotAllowed({ home: 1, away: 1 }, { home: 5, away: 4 }, groupStage),
      'TOURNAMENT_PENALTY_NOT_ALLOWED',
      NOT_KNOCKOUT_MESSAGE,
    );
  });

  it('정규시간에 이미 승자가 났으면 승부차기를 받지 않는다(다른 문구여야 한다)', () => {
    expectConflict(
      () => assertPenaltiesNotAllowed({ home: 2, away: 1 }, { home: 5, away: 4 }, knockoutWithEdges),
      'TOURNAMENT_PENALTY_NOT_ALLOWED',
      NOT_LEVEL_MESSAGE,
    );
  });

  /**
   * NOT_ALLOWED 술어에는 진출 엣지를 넣지 **않는다.** `isKnockoutFixture === false`
   * 하나에 (a) 조 미배정 픽스처와 (b) 진짜 조별 phase 픽스처가 뭉쳐 있어
   * (`notKnockoutWithEdges` 주석 참조), 엣지를 근거로 승부차기를 허용하면 (b)에서도
   * 허용되면서 `calculateCompetitionStandings`가 승부차기를 승패로 읽을 여지가
   * 생긴다 — 조별 순위 계약이 깨지는 동작 변경이다. 확장은
   * `assertBracketResolvable` 쪽에만 한다.
   *
   * 그 대가로 이 조합은 무승부도 승부차기도 받지 않는 상태가 되고,
   * `assertBracketResolvable`이 그 사실을 대진 설정 문구로 알린다.
   */
  it('진출 엣지가 있어도 knockout 판정이 false면 승부차기를 거부한다', () => {
    expectConflict(
      () => assertPenaltiesNotAllowed({ home: 1, away: 1 }, { home: 5, away: 4 }, notKnockoutWithEdges),
      'TOURNAMENT_PENALTY_NOT_ALLOWED',
      NOT_KNOCKOUT_MESSAGE,
    );
  });

  it('두 NOT_ALLOWED 분기의 문구는 서로 달라야 한다 — 합치면 운영자가 원인을 알 수 없다', () => {
    const notKnockout = captureThrow(() =>
      assertPenaltiesNotAllowed({ home: 1, away: 1 }, { home: 5, away: 4 }, groupStage),
    ) as ConflictException;
    const notLevel = captureThrow(() =>
      assertPenaltiesNotAllowed({ home: 3, away: 1 }, { home: 5, away: 4 }, knockoutWithEdges),
    ) as ConflictException;
    expect(notKnockout.getResponse()).not.toEqual(notLevel.getResponse());
  });
});
