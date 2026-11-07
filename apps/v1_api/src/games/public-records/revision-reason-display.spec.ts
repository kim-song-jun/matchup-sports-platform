import { displayRevisionReason } from './revision-reason-display';

describe('displayRevisionReason', () => {
  it.each([
    ['[quick-result]', null],
    ['[LEAGUE_RESULT_ENTRY]', null],
    ['[quick-result] 현장 기록지 기준', '현장 기록지 기준'],
    ['[LEAGUE_RESULT_CORRECTION] 스코어 오기재 정정', '스코어 오기재 정정'],
    ['[LEAGUE_RESULT_CORRECTION] [quick-result] 재입력', '재입력'],
    ['[quick-result] [LEAGUE_RESULT_ENTRY]   ', null],
    [null, null],
    ['', null],
  ])('%j → %j', (input, expected) => {
    expect(displayRevisionReason(input)).toBe(expected);
  });

  it.each([
    '득점자 오기재 정정',
    '[비고] 우천 단축',
    '[Note] mixed case is operator text',
    '골 기록 [quick-result] 반영',
  ])('운영자가 쓴 문장은 그대로 둔다: %s', (input) => {
    expect(displayRevisionReason(input)).toBe(input);
  });
});
