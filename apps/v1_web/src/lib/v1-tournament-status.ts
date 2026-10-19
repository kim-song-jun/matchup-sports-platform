import type { V1TournamentStatus } from '@/types/api';
import { leagueStateLabel, type LeagueStateKey } from './v1-status-labels';

export type TournamentStatusConfig = { badgeClass: string; label: string };

/** 모집 가능 여부는 별도 정보다. 리그 시작 전 단계는 모두 모집완료로 표시한다. */
export function getLeagueStatusConfig(status: string): TournamentStatusConfig {
  const states: Record<string, LeagueStateKey> = {
    draft: 'draft', open: 'draft', closed: 'draft', in_progress: 'active',
    on_hold: 'on_hold', completed: 'completed', cancelled: 'completed',
  };
  const state = Object.hasOwn(states, status) ? states[status] : undefined;
  if (!state) return { badgeClass: 'tm-badge-grey', label: '상태 확인 중' };
  return {
    badgeClass: state === 'active' ? 'tm-badge-green' : state === 'on_hold' ? 'tm-badge-orange' : 'tm-badge-grey',
    label: leagueStateLabel(state),
  };
}

/**
 * 대회 status → 뱃지 클래스/라벨 단일 소스.
 * (기존에 목록·상세 페이지에 동일 로직이 중복 정의돼 있던 것을 통합)
 */
export function getTournamentStatusConfig(
  status: V1TournamentStatus,
  registrationBlocked = false,
): TournamentStatusConfig {
  // open은 저장된 대회 단계라 마감일·정원으로 신청이 막혀도 그대로일 수 있다.
  // 화면의 기존 신청 게이트 결과를 받아 배지를 맞추되 진행·종료 단계는 유지한다.
  if (status === 'open' && registrationBlocked) {
    return { badgeClass: 'tm-badge-grey', label: '모집 마감' };
  }
  switch (status) {
    case 'draft':
      return { badgeClass: 'tm-badge-grey', label: '준비 중' };
    case 'open':
      return { badgeClass: 'tm-badge-blue', label: '모집 중' };
    case 'in_progress':
      return { badgeClass: 'tm-badge-green', label: '진행 중' };
    case 'completed':
      return { badgeClass: 'tm-badge-grey', label: '종료' };
    case 'closed':
      return { badgeClass: 'tm-badge-grey', label: '마감' };
    case 'cancelled':
      return { badgeClass: 'tm-badge-red', label: '취소' };
    default:
      // 서버가 웹 타입보다 먼저 새 상태를 내려도 영문 코드를 화면에 노출하지 않는다.
      return { badgeClass: 'tm-badge-grey', label: '상태 확인 중' };
  }
}
