import { STATUS_META } from '@/components/admin/admin-status-pill';
import { adminRegistrationStatusLabel } from '@/lib/v1-status-labels';
import type { V1AdminTournamentRegistration, V1TournamentRegistrationStatus } from '@/types/api';

type Registration = V1AdminTournamentRegistration;

export type ShowToast = (message: string, variant?: 'success' | 'error') => void;

/** 폰/데스크톱 경계 — `ActionMenu` 가 팝오버로 바뀌는 폭과 같은 값이다. */
export const REGISTRATIONS_WIDE_MEDIA_QUERY = '(min-width: 768px)';

export interface RegistrationGroups {
  todo: Registration[];
  confirmed: Registration[];
  waitlisted: Registration[];
  cancelled: Registration[];
  drafts: Registration[];
}

type GroupKey = keyof RegistrationGroups;

// 새 신청 상태가 생기면 이 표가 컴파일을 깨서, 어느 묶음에도 안 들어간 행이 조용히 사라지지 않는다.
const GROUP_OF = {
  submitted: 'todo',
  awaiting_payment: 'todo',
  payment_checking: 'todo',
  paid: 'todo',
  cancel_requested: 'todo',
  confirmed: 'confirmed',
  waitlisted: 'waitlisted',
  cancelled: 'cancelled',
  draft: 'drafts',
} satisfies Record<V1TournamentRegistrationStatus, GroupKey>;

/** 신청을 운영자가 할 일 기준 묶음으로 나눈다. 입력 순서를 지키고 모든 행이 정확히 한 묶음에 들어간다. */
export function groupRegistrations(items: readonly Registration[]): RegistrationGroups {
  const groups: RegistrationGroups = { todo: [], confirmed: [], waitlisted: [], cancelled: [], drafts: [] };
  for (const item of items) groups[GROUP_OF[item.status]].push(item);
  return groups;
}

export type PrimaryAction = 'confirm-payment' | 'confirm' | 'handle-cancel' | 'view-roster';

/** 행마다 보이는 주 버튼. 쓰기 권한은 호출하는 쪽이 따로 본다. */
export function registrationPrimaryAction(status: V1TournamentRegistrationStatus): PrimaryAction {
  switch (status) {
    case 'awaiting_payment':
      return 'confirm-payment';
    case 'payment_checking':
    case 'paid':
    case 'waitlisted':
      return 'confirm';
    case 'cancel_requested':
      return 'handle-cancel';
    default:
      return 'view-roster';
  }
}

/** 서버가 일괄 확인으로 받는 상태는 `awaiting_payment` 하나뿐이다. */
export function isBulkSelectable(reg: Registration): boolean {
  return reg.status === 'awaiting_payment';
}

/** `AdminStatusPill` 기본 라벨을 덮어쓸 때만 값이 있다. undefined 면 기본 라벨을 쓴다. */
export function registrationStatusLabel(reg: Registration, isFreeEntry: boolean): string | undefined {
  return adminRegistrationStatusLabel(reg.status, isFreeEntry, reg.cancelOutcome);
}

/** 처리할 것 행의 한 줄 설명 — 무료 대회에는 입금 말이 없다. */
export function registrationTodoHint(reg: Registration, isFreeEntry: boolean): string {
  switch (reg.status) {
    case 'submitted':
      return '신청 내용을 확인해 주세요';
    case 'awaiting_payment':
      return isFreeEntry ? '신청 내용을 보고 확인해 주세요' : '입금 내용을 보고 확인해 주세요';
    case 'payment_checking':
      return isFreeEntry ? '신청을 받았어요. 명단을 보고 확정해 주세요' : '입금을 확인했어요. 명단을 보고 확정해 주세요';
    case 'paid':
      return isFreeEntry ? '신청을 받았어요. 명단을 보고 확정해 주세요' : '결제가 끝났어요. 명단을 보고 확정해 주세요';
    case 'cancel_requested':
      return '팀이 참가 취소를 요청했어요';
    default:
      return '';
  }
}

/** 행 ⋯ 메뉴(폰 시트) 머리의 한 줄 — 어느 팀의 어떤 상태인지 시트만 보고 알게 한다. */
export function registrationMenuSubtitle(reg: Registration, isFreeEntry: boolean): string {
  const parts = [registrationStatusLabel(reg, isFreeEntry) ?? STATUS_META[reg.status]?.label ?? reg.status];
  parts.push(reg.playerCount > 0 ? `명단 ${reg.playerCount}명` : '명단 미등록');
  if (reg.status === 'confirmed' || (reg.status === 'cancel_requested' && reg.rosterLockedAt)) {
    parts.push(reg.rosterLockedAt ? '잠김' : '잠금 전');
  }
  return parts.join(' · ');
}

/** 섹션 컴포넌트가 읽기만 하는 화면 맥락 — 훅·핸들러를 가진 컨테이너가 만든다. */
export interface RegistrationViewContext {
  readonly canWrite: boolean;
  readonly isFreeEntry: boolean;
  /** 「신청 확인」(무료) / 「입금 확인」(유료) */
  readonly confirmNoun: string;
  readonly admissionsBlockedReason: string | null;
  readonly busy: boolean;
  readonly showToast: ShowToast;
}

export type RegistrationHandlers = Readonly<
  Record<
    | 'onViewRoster'
    | 'onConfirmPayment'
    | 'onConfirm'
    | 'onWaitlist'
    | 'onApproveCancel'
    | 'onKeepRegistration'
    | 'onOpenCancelSheet'
    | 'onReject'
    | 'onToggleGameRosters',
    (reg: Registration) => void
  >
>;
