import type { V1TournamentStatus } from '@/types/api';
import { leagueStateLabel } from './v1-status-labels';

export type TournamentStatusConfig = { badgeClass: string; label: string };

/**
 * 리그 status → 공개 배지. 대회와 같은 이름(준비 중·모집 중·마감·종료)에 리그 말(시즌 진행 중·보류)만
 * 다르다(2026-10-27). 접수 중이어도 마감·정원으로 막히면 대회처럼 '모집 마감'이다.
 */
export function getLeagueStatusConfig(status: string, registrationBlocked = false): TournamentStatusConfig {
  if (status === 'in_progress') return { badgeClass: 'tm-badge-green', label: leagueStateLabel('active') };
  if (status === 'on_hold') return { badgeClass: 'tm-badge-orange', label: leagueStateLabel('on_hold') };
  // 리그 취소는 없다(보류로 대신한다). 남아 있는 행은 종료로 묶는다.
  if (status === 'cancelled') return { badgeClass: 'tm-badge-grey', label: leagueStateLabel('completed') };
  return getTournamentStatusConfig(status as V1TournamentStatus, registrationBlocked);
}

/**
 * 대회 status → 뱃지 클래스/라벨 단일 소스.
 * (기존에 목록·상세 페이지에 동일 로직이 중복 정의돼 있던 것을 통합)
 */
export function getTournamentStatusConfig(
  status: V1TournamentStatus | 'on_hold',
  registrationBlocked = false,
  isRegularLeague = false,
): TournamentStatusConfig {
  if (isRegularLeague) return getLeagueStatusConfig(status, registrationBlocked);
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
