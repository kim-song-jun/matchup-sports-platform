import { describe, it, expect } from 'vitest';
import { toDetailMode } from './matches-client';

/**
 * 회귀 가드: 참가한 적 없는 뷰어('none')가 마감류 매치를 보면 과거엔 'approved'를
 * 잘못 반환해 실제 참가 확정자와 동일한 초록 배너/배지가 떴다. 별도 'closed' mode로
 * 분리해 중립 안내를 렌더링한다.
 */
describe('toDetailMode', () => {
  it('참가자 상태(host/requested/approved/participant)는 상태와 무관하게 우선한다', () => {
    expect(toDetailMode('host', 'recruiting')).toBe('mine');
    expect(toDetailMode('requested', 'closed')).toBe('pending');
    expect(toDetailMode('approved', 'closed')).toBe('approved');
    expect(toDetailMode('participant', 'expired')).toBe('approved');
  });

  it('비참가자가 마감류 매치를 보면 approved가 아닌 closed를 반환한다', () => {
    expect(toDetailMode('none', 'closed')).toBe('closed');
    expect(toDetailMode('none', 'cancelled')).toBe('closed');
    expect(toDetailMode('none', 'completed')).toBe('closed');
    expect(toDetailMode('none', 'expired')).toBe('closed');
    expect(toDetailMode('none', 'full')).toBe('closed');
    expect(toDetailMode('guest', 'closed')).toBe('closed');
  });

  it('비참가자가 모집 중인 매치를 보면 default를 반환한다', () => {
    expect(toDetailMode('none', 'recruiting')).toBe('default');
    expect(toDetailMode('guest', 'open')).toBe('default');
  });
});
