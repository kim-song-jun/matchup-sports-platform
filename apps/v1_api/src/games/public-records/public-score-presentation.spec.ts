import { resolvePublicScorePresentation } from './public-score-presentation';

const official = { home: 3, away: 1, penalties: null };
const live = { home: 1, away: 0, penalties: null };
const submitted = { home: 2, away: 2, penalties: null };

/** 안 넘긴 값은 전부 "없음" 이다 — 각 케이스가 무엇을 쥐고 있는지 눈에 보이게 한다. */
const input = (over: Partial<Parameters<typeof resolvePublicScorePresentation>[0]>) =>
  resolvePublicScorePresentation({
    mode: 'live',
    showOfficialResult: false,
    officialScore: null,
    liveScore: null,
    submittedScore: null,
    ...over,
  });

describe('resolvePublicScorePresentation', () => {
  it('확정본이 있으면 official — 다른 무엇보다 먼저다', () => {
    // 확정 뒤에도 submitted 리비전 행은 남아 있다. 순서가 뒤집히면 확정된 경기가
    // "확정 전" 으로 보인다.
    expect(input({ showOfficialResult: true, officialScore: official, submittedScore: submitted })).toEqual({
      scoreStatus: 'official',
      score: official,
    });
  });

  it('진행 중이면 live', () => {
    expect(input({ liveScore: live })).toEqual({ scoreStatus: 'live', score: live });
  });

  it('제출됐지만 확정 전이면 **점수 + pending** 이다 (Task 166)', () => {
    // 이게 이번에 생긴 구간이다. 예전엔 여기가 unavailable 이라 경기가 끝났는데도
    // 관전자에게 점수가 아예 안 보였다 — "결과 없음" 과 "확정 대기" 가 구분되지 않았다.
    expect(input({ submittedScore: submitted })).toEqual({ scoreStatus: 'pending', score: submitted });
  });

  it('아무 것도 없으면 unavailable', () => {
    expect(input({})).toEqual({ scoreStatus: 'unavailable', score: null });
  });

  it('official_only 는 확정 전 점수를 그대로 감춘다 — 운영자가 고른 정책을 뒤집지 않는다', () => {
    // 공개 가시성 매트릭스(D-06)에서 official_only 는 **확정 전 숫자를 일부러 내보내지
    // 않는** 정책이다. 여기서 pending 을 내보내면 이 변경이 그 정책을 무력화한다.
    expect(input({ mode: 'official_only', submittedScore: submitted })).toEqual({
      scoreStatus: 'unavailable',
      score: null,
    });
    // 확정본은 official_only 에서도 그대로 나간다(그게 이 모드의 이름이다).
    expect(input({ mode: 'official_only', showOfficialResult: true, officialScore: official })).toEqual({
      scoreStatus: 'official',
      score: official,
    });
  });

  it('status_only 는 숫자를 전부 가린다 — 확정본도 예외가 아니다', () => {
    expect(input({ mode: 'status_only', showOfficialResult: true, officialScore: official })).toEqual({
      scoreStatus: 'official',
      score: null,
    });
    expect(input({ mode: 'status_only', submittedScore: submitted })).toEqual({
      scoreStatus: 'unavailable',
      score: null,
    });
  });
});
