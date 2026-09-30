import { describe, expect, it } from 'vitest';
import { sharedNamePrefixLength, stripSharedPrefix, tokenInitial, tokenNameLabel } from './pitch-token-label';

/**
 * Task 180 H7 · N-1 — alpha 에서 다섯 토큰이 전부 "QA0929선…" 로 잘려 누가 누군지 몰랐다(L18).
 * 규칙이 이름을 **구분되게** 만드는지, 그리고 떼면 안 되는 경우(성만 같은 이름)를 떼지 않는지.
 */
describe('sharedNamePrefixLength — 보드 전원이 같은 앞부분', () => {
  it('"QA0929" 로 시작하는 보드는 그 앞부분을 뗀다', () => {
    const names = ['QA0929선수01', 'QA0929선수02', 'QA0929팀장1'];
    const cut = sharedNamePrefixLength(names);
    expect(names.map((name) => tokenNameLabel(name, cut))).toEqual(['선수01', '선수02', '팀장1']);
  });

  it('같은 앞부분이 3자 미만이면 그대로 둔다 (성만 같은 이름, 두 글자 머리)', () => {
    expect(sharedNamePrefixLength(['김민수', '김민준'])).toBe(0);
    // 글자 종류가 바뀌는 자리(B|가)라 경계 조건은 통과한다 — 3자 조건만이 막는다.
    expect(sharedNamePrefixLength(['AB가나다', 'AB라마바'])).toBe(0);
  });

  it('떼고 나면 2자 미만이 남는 사람이 있으면 그만큼 덜 뗀다', () => {
    // 공통부분은 "QA0929선수0" 이지만 그걸 떼면 "1"·"2" 한 글자만 남는다.
    const names = ['QA0929선수01', 'QA0929선수02'];
    const cut = sharedNamePrefixLength(names);
    expect(names.map((name) => stripSharedPrefix(name, cut))).toEqual(['01', '02']);
  });

  it('글자 종류가 바뀌는 자리에서만 자른다 — "수1·수2" 처럼 단어 중간을 끊지 않는다', () => {
    const names = ['E2E 알파 A팀 선수1', 'E2E 알파 A팀 선수2'];
    const cut = sharedNamePrefixLength(names);
    expect(names.map((name) => stripSharedPrefix(name, cut))).toEqual(['선수1', '선수2']);
  });

  it('한 명뿐이거나 전원 동명이면 떼지 않는다 (비교할 대상이 없다)', () => {
    expect(sharedNamePrefixLength(['QA0929선수01'])).toBe(0);
    expect(sharedNamePrefixLength(['홍길동', '홍길동'])).toBe(0);
    expect(sharedNamePrefixLength([])).toBe(0);
  });
});

describe('tokenNameLabel — 이름표는 5자까지', () => {
  it('5자는 그대로, 6자부터 앞 4자 + …', () => {
    expect(tokenNameLabel('김철수가나', 0)).toBe('김철수가나');
    expect(tokenNameLabel('중흥의푸른오른발', 0)).toBe('중흥의푸…');
  });

  it('글자 수를 문자 단위로 센다 (이모지를 반으로 자르지 않는다)', () => {
    expect(tokenNameLabel('⚽⚽⚽⚽⚽⚽', 0)).toBe('⚽⚽⚽⚽…');
  });
});

describe('tokenInitial — 번호가 없을 때 원 안 글자', () => {
  it('떼고 난 이름의 첫 글자를 쓴다 (전원이 "Q" 가 되지 않게)', () => {
    const names = ['QA0929선수01', 'QA0929팀장1'];
    const cut = sharedNamePrefixLength(names);
    expect(tokenInitial('QA0929팀장1', cut)).toBe('팀');
    expect(tokenInitial('김민수', 0)).toBe('김');
  });

  it('빈 이름은 물음표', () => {
    expect(tokenInitial('', 0)).toBe('?');
  });
});
