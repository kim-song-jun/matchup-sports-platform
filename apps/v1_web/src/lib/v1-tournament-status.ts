import type { V1TournamentStatus } from '@/types/api';

export type TournamentStatusConfig = { badgeClass: string; label: string };

/**
 * 대회 status → 뱃지 클래스/라벨 단일 소스.
 * (기존에 목록·상세 페이지에 동일 로직이 중복 정의돼 있던 것을 통합)
 */
export function getTournamentStatusConfig(status: V1TournamentStatus): TournamentStatusConfig {
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
      return { badgeClass: 'tm-badge-grey', label: status };
  }
}
