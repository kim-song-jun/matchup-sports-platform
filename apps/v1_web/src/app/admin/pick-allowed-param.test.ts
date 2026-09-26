import { describe, expect, it } from 'vitest';
import { pickAllowedParam } from './pick-allowed-param';

const STATUS = [
  { value: '', label: '전체' },
  { value: 'active', label: '활성' },
  { value: 'blocked', label: '차단' },
];

describe('pickAllowedParam', () => {
  it('허용 목록에 있는 값은 그대로 통과시킨다', () => {
    expect(pickAllowedParam('active', STATUS)).toBe('active');
    expect(pickAllowedParam('blocked', STATUS)).toBe('blocked');
  });

  // 오타난 북마크·옛 링크가 그대로 서버로 가면 400 이 나고 목록이 통째로 에러 화면이
  // 된다. "다시 시도"를 눌러도 같은 값으로 재요청하므로 스스로 회복되지 않는다.
  it('허용 목록에 없는 값은 전체로 떨어뜨린다', () => {
    expect(pickAllowedParam('banned', STATUS)).toBe('');
    expect(pickAllowedParam('ACTIVE', STATUS)).toBe('');
    expect(pickAllowedParam('active; drop', STATUS)).toBe('');
  });

  it('값이 없으면 전체다', () => {
    expect(pickAllowedParam(null, STATUS)).toBe('');
    expect(pickAllowedParam(undefined, STATUS)).toBe('');
    expect(pickAllowedParam('', STATUS)).toBe('');
  });

  // '' 는 "전체"를 뜻하는 화면 쪽 표현이지 서버로 보내는 필터 값이 아니다 —
  // 허용 목록에 '' 항목이 있더라도 그걸 통과시키면 안 된다(둘 다 '' 라 결과는 같지만,
  // 의미가 다른 두 경로를 섞지 않기 위해 명시적으로 고정한다).
  it("빈 문자열은 목록에 있어도 '전체'로만 취급한다", () => {
    expect(pickAllowedParam('', STATUS)).toBe('');
  });
});
