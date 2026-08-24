import { LEAGUE_RESULT_DISPUTE_WINDOW_MS } from './league-result-dispute.constants';
import { judgeLeagueDisputeEligibility } from './league-result-dispute-eligibility';

/**
 * 이 판정이 틀리면 두 가지 방식으로 실제 사고가 난다: (1) 화면이 "제기 가능"으로
 * 보여주는데 서버가 거부하면 사용자가 사유를 입력하고 나서야 막힌다, (2) 화면이
 * "기간이 지났다"고 잘못 보여주면 아직 유효한 이의 제기 기회를 사용자가 놓친다.
 * 그래서 마감 경계(정확히 7일)와 두 차단 사유의 우선순위를 값 단위로 고정한다.
 */
describe('judgeLeagueDisputeEligibility', () => {
  const officialAt = new Date('2026-08-01T00:00:00.000Z');

  it('아직 확정된 결과가 없으면(officialAt null) 마감도 차단 사유도 없다', () => {
    const result = judgeLeagueDisputeEligibility({
      officialAt: null,
      now: new Date('2026-08-10T00:00:00.000Z'),
      promotionCommitted: false,
    });
    expect(result).toEqual({ disputeDeadline: null, blockedReason: null });
  });

  it('마감 = officialAt + 7일', () => {
    const result = judgeLeagueDisputeEligibility({
      officialAt,
      now: new Date('2026-08-02T00:00:00.000Z'),
      promotionCommitted: false,
    });
    expect(result.disputeDeadline?.getTime()).toBe(officialAt.getTime() + LEAGUE_RESULT_DISPUTE_WINDOW_MS);
  });

  it('마감 직전(1ms 전)은 아직 제기 가능하다', () => {
    const deadline = new Date(officialAt.getTime() + LEAGUE_RESULT_DISPUTE_WINDOW_MS);
    const result = judgeLeagueDisputeEligibility({
      officialAt,
      now: new Date(deadline.getTime() - 1),
      promotionCommitted: false,
    });
    expect(result.blockedReason).toBeNull();
  });

  it('마감 정각(now === deadline)은 아직 제기 가능하다 -- 초과(>)만 차단한다', () => {
    const deadline = new Date(officialAt.getTime() + LEAGUE_RESULT_DISPUTE_WINDOW_MS);
    const result = judgeLeagueDisputeEligibility({
      officialAt,
      now: deadline,
      promotionCommitted: false,
    });
    expect(result.blockedReason).toBeNull();
  });

  it('마감 직후(1ms 후)는 기간 만료다', () => {
    const deadline = new Date(officialAt.getTime() + LEAGUE_RESULT_DISPUTE_WINDOW_MS);
    const result = judgeLeagueDisputeEligibility({
      officialAt,
      now: new Date(deadline.getTime() + 1),
      promotionCommitted: false,
    });
    expect(result.blockedReason).toBe('window_expired');
  });

  it('기간 내 + 승강 확정이면 승강 확정 사유다', () => {
    const result = judgeLeagueDisputeEligibility({
      officialAt,
      now: new Date('2026-08-02T00:00:00.000Z'),
      promotionCommitted: true,
    });
    expect(result.blockedReason).toBe('promotion_committed');
  });

  it('기간 만료 + 승강 확정이 동시에 참이면 기간 만료가 우선한다', () => {
    const deadline = new Date(officialAt.getTime() + LEAGUE_RESULT_DISPUTE_WINDOW_MS);
    const result = judgeLeagueDisputeEligibility({
      officialAt,
      now: new Date(deadline.getTime() + 1),
      promotionCommitted: true,
    });
    expect(result.blockedReason).toBe('window_expired');
  });

  it('기간 내 + 승강 미확정이면 차단 사유가 없다(제기 가능)', () => {
    const result = judgeLeagueDisputeEligibility({
      officialAt,
      now: new Date('2026-08-02T00:00:00.000Z'),
      promotionCommitted: false,
    });
    expect(result.blockedReason).toBeNull();
    expect(result.disputeDeadline).not.toBeNull();
  });
});
