import { canonicalCompetitionConfigForSport } from '../tournaments/competition-config/lineup-size';
import { tryNormalizeCompetitionSportCode } from '../tournaments/competition-config/competition-config.validator';
import { positionCodesForSport, validatePreferredPositions } from './preferred-position';

const REAL_DEPS = {
  tryNormalize: tryNormalizeCompetitionSportCode,
  canonicalConfig: canonicalCompetitionConfigForSport,
};

/**
 * [D14] 선호 포지션은 **사람 축에 한 번 저장하면 모든 대회·리그에 자동 적용**된다.
 * 그래서 잘못된 값이 들어가면 그 사람의 모든 기록 표시와 선수 카드 가중치가 계속 틀리고,
 * 경기마다 고쳐 넣을 기회가 없다 — **저장 시점 검증이 유일한 방어선**이다.
 *
 * 규칙 넷을 각각 못박는다. 특히 마지막(다른 종목 코드)은 화면만 보면 안 걸린다 —
 * 화면은 그 종목 자리만 보여주지만 API 는 아무 문자열이나 받을 수 있다.
 */
const FUTSAL = ['GOLEIRO', 'FIXO', 'ALA', 'PIVO'];

describe('[D14] validatePreferredPositions', () => {
  it('둘 다 미설정은 정상이다 — 강제하지 않는다', () => {
    // 미설정은 결함이 아니라 기본 상태다(카드 포지션 미상, 가중치 균등).
    expect(validatePreferredPositions({ primary: null, secondary: null }, FUTSAL)).toBeNull();
  });

  it('주만 정한 것도 정상이다 — 부는 선택이다', () => {
    expect(validatePreferredPositions({ primary: 'ALA', secondary: null }, FUTSAL)).toBeNull();
  });

  it('주 없이 부만 정할 수 없다', () => {
    // 부를 정하려면 주가 먼저다 -- 주 없는 부는 무엇의 부인지 알 수 없다.
    expect(validatePreferredPositions({ primary: null, secondary: 'PIVO' }, FUTSAL)).toBe(
      'SECONDARY_WITHOUT_PRIMARY',
    );
  });

  it('주와 부가 같을 수 없다 — 같으면 부가 담는 정보가 0이다', () => {
    expect(validatePreferredPositions({ primary: 'ALA', secondary: 'ALA' }, FUTSAL)).toBe(
      'DUPLICATE_POSITION',
    );
  });

  it('다른 종목의 코드는 거부한다 (풋살 선호에 축구 CB)', () => {
    // 화면은 그 종목 자리만 보여주지만 **API 는 아무 문자열이나 받는다.** 이 검사가
    // 없으면 종목을 바꿔 저장할 때 남은 값이 조용히 살아남아, 그 종목엔 존재하지 않는
    // 자리가 선수 카드에 뜬다.
    expect(validatePreferredPositions({ primary: 'CB', secondary: null }, FUTSAL)).toBe(
      'UNKNOWN_POSITION',
    );
    expect(validatePreferredPositions({ primary: 'ALA', secondary: 'CB' }, FUTSAL)).toBe(
      'UNKNOWN_POSITION',
    );
  });

  it('종목 목록이 비면 어떤 코드도 통과하지 못한다 — 설정을 못 읽었을 때 통과시키지 않는다', () => {
    // fail-open 방지: 프리셋을 못 읽었다고 아무 값이나 저장되면, 그 순간의 오류가
    // 사용자 프로필에 영구히 남는다.
    expect(validatePreferredPositions({ primary: 'ALA', secondary: null }, [])).toBe('UNKNOWN_POSITION');
    // 다만 **미설정은 여전히 정상**이다 -- 지우는 것까지 막으면 안 된다.
    expect(validatePreferredPositions({ primary: null, secondary: null }, [])).toBeNull();
  });
});

/**
 * **실제 프리셋으로** 확인한다. 여기서 목을 쓰면 "프리셋을 단일 출처로 쓴다"는 계약
 * 자체를 검증하지 못한다 — 목이 실제와 어긋나도 통과하기 때문이다.
 */
describe('[D14] positionCodesForSport — 종목마다 유효 집합이 다르다', () => {
  it('풋살은 풋살 자리만 준다', () => {
    expect(positionCodesForSport('futsal', REAL_DEPS)).toEqual(['GOLEIRO', 'FIXO', 'ALA', 'PIVO']);
  });

  it('축구는 축구 자리만 준다', () => {
    expect(positionCodesForSport('soccer', REAL_DEPS)).toEqual(['GK', 'DF', 'MF', 'FW']);
  });

  it('포지션 개념이 없는 종목은 빈 목록이다 (화면은 섹션을 숨긴다)', () => {
    // 러닝·수영은 프리셋 자체가 없다. 빈 목록은 오류가 아니라 사실이고,
    // 화면은 **빈 목록을 보여주는 것이 아니라 섹션을 숨겨야** 한다.
    expect(positionCodesForSport('running', REAL_DEPS)).toEqual([]);
    expect(positionCodesForSport('swimming', REAL_DEPS)).toEqual([]);
    expect(positionCodesForSport(null, REAL_DEPS)).toEqual([]);
  });

  it('전역 화이트리스트가 아니다 — 풋살 유저는 축구 자리를 저장할 수 없다', () => {
    // 이 케이스가 핵심이다. 유효 집합을 종목별로 안 나누고 전부 합쳐 하나로 쓰면
    // 풋살 프로필에 'MF' 가 저장되고, 그 사람 카드에 풋살엔 없는 자리가 뜬다.
    const futsalCodes = positionCodesForSport('futsal', REAL_DEPS);
    expect(validatePreferredPositions({ primary: 'MF', secondary: null }, futsalCodes)).toBe(
      'UNKNOWN_POSITION',
    );
    const soccerCodes = positionCodesForSport('soccer', REAL_DEPS);
    expect(validatePreferredPositions({ primary: 'PIVO', secondary: null }, soccerCodes)).toBe(
      'UNKNOWN_POSITION',
    );
  });
});
