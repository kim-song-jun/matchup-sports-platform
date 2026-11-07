/** 마이페이지에서 대회 스태프가 운영 화면으로 들어가는 메뉴 이름 — 이 메뉴를 안내하는 문구가 같은 말을 쓰게 한다. */
export const TOURNAMENT_STAFF_ENTRY_LABEL = '담당 대회 운영';

/** 배정 안내와 실제 역할별 진입 화면을 같은 어휘로 설명한다. */
export function tournamentStaffEntryDestination(role: string, tournamentKind?: string | null): string {
  if (role === 'FIELD_OPERATOR') return '담당 경기 기록 화면으로';
  if (role === 'TOURNAMENT_DIRECTOR' && tournamentKind !== 'regular_league') return '이 대회 관리 화면으로';
  return '이 대회 운영 보드로';
}

/** A regular-league director only gets the ops board; this is the notice shown before granting that role, or null when it does not apply. */
export function tournamentStaffGrantLimitNotice(role: string, tournamentKind?: string | null): string | null {
  if (role === 'TOURNAMENT_DIRECTOR' && tournamentKind === 'regular_league') {
    return '리그에서 디렉터는 운영 보드만 볼 수 있어요. 결과 입력·확정은 운영자가 해요.';
  }
  return null;
}
