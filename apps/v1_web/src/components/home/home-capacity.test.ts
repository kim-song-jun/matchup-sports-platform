import { describe, expect, it } from 'vitest';
import { homeCapacity } from './home-capacity';

describe('홈 카드 인원 표기', () => {
  it('서버가 인원을 안 주면 숫자를 지어내지 않는다', () => {
    // 예전에는 여기서 0/1 이 나왔고, 잔여 1 ≤ 3 이라 모든 추천 카드에 "마감 임박"이 붙었다
    // (2026-09-07 프로덕션 제보: 실제 1/6명 매치가 "0/1명 · 마감 임박"으로 보였다).
    expect(homeCapacity(null, null)).toBeNull();
    expect(homeCapacity(1, null)).toBeNull();
    expect(homeCapacity(null, 6)).toBeNull();
  });

  it('정원이 0 이하면 인원 줄을 만들지 않는다', () => {
    expect(homeCapacity(0, 0)).toBeNull();
    expect(homeCapacity(0, -1)).toBeNull();
  });

  it('자리가 넉넉하면 마감 임박이 아니다', () => {
    expect(homeCapacity(1, 6)).toEqual({ current: 1, max: 6, almostFull: false });
  });

  it('잔여 3자리 이하부터 마감 임박이다', () => {
    expect(homeCapacity(3, 6)).toEqual({ current: 3, max: 6, almostFull: true });
    expect(homeCapacity(2, 6)).toEqual({ current: 2, max: 6, almostFull: false });
  });

  it('정원이 다 차면 마감 임박이 아니라 마감이다', () => {
    expect(homeCapacity(6, 6)).toEqual({ current: 6, max: 6, almostFull: false });
    expect(homeCapacity(7, 6)).toEqual({ current: 7, max: 6, almostFull: false });
  });
});
