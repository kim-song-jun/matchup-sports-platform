import { describe, expect, it } from 'vitest';
import { locationHashId } from './location-hash';

describe('locationHashId', () => {
  it('인코딩된 한글 앵커를 id 로 푼다', () => {
    expect(locationHashId('#%EA%B0%80%EC%9E%85')).toBe('가입');
  });

  it('잘못된 퍼센트 인코딩이어도 던지지 않고 원문을 돌려준다', () => {
    expect(locationHashId('#%E0%')).toBe('%E0%');
  });

  it('해시가 없으면 빈 문자열', () => {
    expect(locationHashId('')).toBe('');
  });
});
