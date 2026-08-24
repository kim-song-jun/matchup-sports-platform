/**
 * U3: 리그 대진 결과의 이의 제기 자격 판정 — `LeagueMatchDisputeService.fileDispute`가
 * 실제로 이의를 거부하는 것과 **정확히 같은 판정**을 화면(팀매치 상세 응답)에도
 * 노출하기 위해 순수 함수로 뽑았다. 두 소비처(서비스의 거부 로직, 상세 응답의
 * `disputeBlockedReason` 필드)가 각자 판정 로직을 따로 구현하면 드리프트가
 * 생긴다 -- 예를 들어 화면은 "제기 가능"으로 버튼을 보여주는데 서버는 거부하는
 * 불일치. 이 함수 하나를 양쪽이 그대로 import 해서 쓴다.
 *
 * 판정 순서가 결과에 영향을 준다 -- **기간 만료를 승강 확정보다 먼저** 본다.
 * `LeagueMatchDisputeService.fileDispute`의 기존 순서(기간 체크 -> 승강 체크)를
 * 그대로 보존한다: 두 조건이 동시에 참이어도(승강이 늦게 확정되며 이미 기간도
 * 지난 경우) 사용자에게는 "기간이 지났다"는 더 이해하기 쉬운 사유를 보여준다.
 */
import { LEAGUE_RESULT_DISPUTE_WINDOW_MS } from './league-result-dispute.constants';

export type LeagueDisputeBlockedReason = 'window_expired' | 'promotion_committed' | null;

export interface LeagueDisputeEligibilityInput {
  /** 공식(OFFICIAL) 결과의 확정 시각. 아직 확정된 결과가 없으면 null. */
  officialAt: Date | null;
  now: Date;
  /** 이 리그(fromLeagueId)에 이미 확정된 승강 결정(V1LeaguePromotion)이 존재하는지. */
  promotionCommitted: boolean;
}

export interface LeagueDisputeEligibilityResult {
  /** officialAt + 7일. 아직 확정된 결과가 없으면 null(이의를 제기할 대상 자체가 없다). */
  disputeDeadline: Date | null;
  blockedReason: LeagueDisputeBlockedReason;
}

export function judgeLeagueDisputeEligibility(
  input: LeagueDisputeEligibilityInput,
): LeagueDisputeEligibilityResult {
  if (input.officialAt === null) {
    return { disputeDeadline: null, blockedReason: null };
  }
  const disputeDeadline = new Date(input.officialAt.getTime() + LEAGUE_RESULT_DISPUTE_WINDOW_MS);
  if (input.now > disputeDeadline) {
    return { disputeDeadline, blockedReason: 'window_expired' };
  }
  if (input.promotionCommitted) {
    return { disputeDeadline, blockedReason: 'promotion_committed' };
  }
  return { disputeDeadline, blockedReason: null };
}
