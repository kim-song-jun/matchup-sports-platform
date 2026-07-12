import { describe, expect, it } from 'vitest';
import { josa } from './korean';

describe('josa', () => {
  it('받침 있는 이름에는 앞 조사를 붙인다 (을/은/으로)', () => {
    expect(josa('김민준', ['을', '를'])).toBe('김민준을');
    expect(josa('활성맴', ['은', '는'])).toBe('활성맴은');
    expect(josa('미인증', ['으로', '로'])).toBe('미인증으로');
  });

  it('받침 없는 이름에는 뒤 조사를 붙인다 (를/는/로)', () => {
    expect(josa('이수아', ['을', '를'])).toBe('이수아를');
    expect(josa('활성커버', ['은', '는'])).toBe('활성커버는');
    expect(josa('프로필 미완료', ['으로', '로'])).toBe('프로필 미완료로');
  });

  it('한글이 아닌 끝 글자는 받침 없음으로 처리한다', () => {
    expect(josa('FC서울2', ['을', '를'])).toBe('FC서울2를');
  });
});
