import type { MatchDetailViewModel } from './matches.types';
import type { V1MatchApiStatus, V1ViewerState } from '@/types/api';

/**
 * 순수 로직이라 별도 모듈로 분리 — matches-client.tsx('use client', React Query/Next
 * navigation 의존)에 함께 있으면 단위 테스트가 무거운 클라이언트 엔트리를 함께 로드하게
 * 되어 테스트 격리·번들 경계가 흐려진다(Copilot 리뷰 지적, PR #58).
 */
export function toDetailMode(viewerState: V1ViewerState, status: V1MatchApiStatus): MatchDetailViewModel['mode'] {
  if (viewerState === 'host') return 'mine';
  if (viewerState === 'requested') return 'pending';
  // 취소된 매치는 viewerState 기반 승인 판정보다 우선한다 — cancel()은 이미 승인된 참가자의
  // v1MatchParticipant row만 'cancelled'로 바꾸고 v1MatchApplication.status는 'approved'로 남겨두므로
  // viewerState는 여전히 'approved'/'participant'로 조회된다. 이 분기가 없으면 알림으로는 "매치가
  // 취소됐어요"를 받은 참가자가 상세 화면에서는 초록 '승인 완료' 배지·"참가를 확정했어요. 경기 당일
  // 늦지 않게 도착해 주세요"를 그대로 보게 된다(2026-08-27 감사 m-cancelled-match-detail-mode).
  if (status === 'cancelled') return 'closed';
  if (viewerState === 'approved' || viewerState === 'participant') return 'approved';
  // 참가한 적 없는 뷰어(viewerState:'none')가 마감류 매치를 보는 경우 — 'approved'를 재사용하면
  // 실제 승인 참가자와 동일한 초록 배너("참가를 확정했어요")가 잘못 뜬다(never-applied 뷰어에게
  // 거짓 참가 확정 안내). 별도 'closed' mode로 구분해 중립(회색) 안내로 렌더링한다.
  if (status === 'closed' || status === 'completed' || status === 'expired' || status === 'full') return 'closed';
  return 'default';
}
