import { describe, it, expect } from 'vitest';
import { toDetailMode } from './matches.mode';

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

  it('취소된 매치는 이미 승인된 참가자라도 approved가 아닌 closed를 반환한다 (2026-08-27 감사 m-cancelled-match-detail-mode)', () => {
    // cancel()이 v1MatchApplication.status는 'approved'로 남겨두므로 viewerState는 여전히
    // 'approved'/'participant'로 조회된다 — status:'cancelled' 가 그 판정보다 우선해야 한다.
    expect(toDetailMode('approved', 'cancelled')).toBe('closed');
    expect(toDetailMode('participant', 'cancelled')).toBe('closed');
  });

  it('비참가자가 모집 중인 매치를 보면 default를 반환한다', () => {
    expect(toDetailMode('none', 'recruiting')).toBe('default');
    expect(toDetailMode('guest', 'open')).toBe('default');
  });
});
