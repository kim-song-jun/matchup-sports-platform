import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
import type { V1TournamentStatus } from '@/types/api';

/** 상태 때문에 공개 설정이 의미 없는 경우의 사유 — 상태 칩 메뉴와 목록 행 액션이 같은 규칙을 쓴다. */
export function tournamentVisibilityHiddenReason(status: V1TournamentStatus): string | undefined {
  return status === 'cancelled' ? '취소된 대회는 공개 설정과 관계없이 일반 사용자 화면에 보이지 않아요.' : undefined;
}

function visibilityDescription(isPublic: boolean, status: V1TournamentStatus): string {
  if (status === 'draft') return isPublic ? '접수를 시작하면 공개돼요.' : '접수를 시작해도 비공개로 유지돼요.';
  return isPublic
    ? '공개 대회 목록과 검색, 홈 화면에 보여요.'
    : '일반 사용자에게 숨겨져요. 관리자 운영과 참가·대진 정보는 유지돼요.';
}

/**
 * 상태 칩 메뉴의 「참가자에게 공개」 스위치 항목. 취소된 대회는 공개 설정과 관계없이 숨으므로 항목이 없다.
 * 준비 중인 대회는 접수를 시작해야 이 설정대로 보인다 — 설명에서 그대로 말한다.
 */
export function tournamentVisibilityAction({
  isPublic,
  status,
  canWrite,
  pending,
  onToggle,
}: {
  isPublic: boolean;
  status: V1TournamentStatus;
  canWrite: boolean;
  pending: boolean;
  onToggle: (next: boolean) => void;
}): ActionSheetAction | null {
  if (tournamentVisibilityHiddenReason(status)) return null;
  return {
    key: 'visibility',
    label: '참가자에게 공개',
    description: visibilityDescription(isPublic, status),
    groupLabel: '공개',
    checked: isPublic,
    disabled: !canWrite || pending,
    disabledReason: !canWrite ? '현재 계정은 공개 상태를 변경할 권한이 없어요.' : pending ? '저장 중이에요.' : null,
    onSelect: () => onToggle(!isPublic),
  };
}
