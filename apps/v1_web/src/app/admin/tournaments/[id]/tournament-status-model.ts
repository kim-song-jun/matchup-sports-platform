import type { ConfirmOptions } from '@/components/v1-ui/confirm-modal';
import type { V1TournamentStatus } from '@/types/api';
import { REVERT_COPY, allowedNextStatuses, revertTargetStatus } from './tournament-admin-shared';

/** 상태 칩 메뉴의 진행 막대 5칸(이름은 `tournamentStatusLabel`). 취소는 이 흐름 밖이라 칸이 없다. */
export const TOURNAMENT_STAGES = ['draft', 'open', 'closed', 'in_progress', 'completed'] as const;
type TournamentStage = (typeof TOURNAMENT_STAGES)[number];

export function stageIndex(status: V1TournamentStatus): number | null {
  const index = TOURNAMENT_STAGES.indexOf(status as TournamentStage);
  return index === -1 ? null : index;
}

export type StatusActionKind = 'forward' | 'reopen' | 'revert' | 'cancel';

export interface StatusAction {
  key: string;
  kind: StatusActionKind;
  target: V1TournamentStatus;
  label: string;
  description: string;
  /** 다음 단계(forward) 동작만 가진다 — 개요 카드가 버튼 옆에 한 줄로 보인다. */
  hint?: string;
}

export type ForwardStatusAction = StatusAction & { kind: 'forward'; hint: string };

interface StatusActionContext {
  canRevertStart: boolean;
}

const FORWARD_COPY: Partial<Record<V1TournamentStatus, { label: string; description: string; hint: string }>> = {
  open: {
    label: '접수 시작하기',
    description: '신청을 받기 시작해요.',
    hint: '시작하면 참가팀이 신청할 수 있어요. 비어 있는 설정은 시작한 뒤에도 채울 수 있어요.',
  },
  closed: {
    label: '접수 마감하기',
    description: '새 신청을 더 받지 않아요. 필요하면 다시 열 수 있어요.',
    hint: '마감하면 새 신청을 더 받지 않아요. 필요하면 다시 열 수 있어요.',
  },
  in_progress: {
    label: '대회 시작하기',
    description: '대진표와 경기 일정을 먼저 확인해 주세요.',
    hint: '시작하기 전에 대진표와 경기 일정을 확인해 주세요.',
  },
  completed: {
    label: '대회 완료하기',
    description: '시상과 후기가 열리고 참가팀에 후기 요청 알림이 가요.',
    hint: '완료하면 시상과 후기가 열리고 참가팀에 후기 요청 알림이 가요.',
  },
};

const REOPEN_COPY = { label: '접수 다시 열기', description: '새 신청을 다시 받아요.' };
const CANCEL_COPY = { label: '대회 취소하기', description: '취소 사유를 남겨요. 나중에 초안으로 복구할 수 있어요.' };

const KIND_ORDER: StatusActionKind[] = ['forward', 'reopen', 'revert', 'cancel'];

function firstSentence(text: string): string {
  return text.split(/(?<=\.)\s/)[0];
}

/** 서버가 허용하는 전환만 forward → reopen → revert → cancel 순서로 돌려준다. */
export function statusActions(status: V1TournamentStatus, ctx: StatusActionContext): StatusAction[] {
  const actions: StatusAction[] = [];

  for (const target of allowedNextStatuses(status)) {
    if (target === 'cancelled') {
      actions.push({ key: 'cancel-cancelled', kind: 'cancel', target, ...CANCEL_COPY });
    } else if (target === 'open' && status === 'closed') {
      actions.push({ key: 'reopen-open', kind: 'reopen', target, ...REOPEN_COPY });
    } else {
      const copy = FORWARD_COPY[target];
      if (copy) actions.push({ key: `forward-${target}`, kind: 'forward', target, ...copy });
    }
  }

  const revertTarget = revertTargetStatus(status, ctx.canRevertStart);
  const revertCopy = REVERT_COPY[status];
  if (revertTarget && revertCopy) {
    actions.push({
      key: `revert-${revertTarget}`,
      kind: 'revert',
      target: revertTarget,
      label: revertCopy.button,
      description: firstSentence(revertCopy.description),
    });
  }

  return actions.sort((left, right) => KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind));
}

function isForward(action: StatusAction): action is ForwardStatusAction {
  return action.kind === 'forward' && action.hint !== undefined;
}

export function primaryStatusAction(status: V1TournamentStatus, ctx: StatusActionContext): ForwardStatusAction | null {
  return statusActions(status, ctx).find(isForward) ?? null;
}

const FORWARD_CONFIRM: Partial<Record<V1TournamentStatus, ConfirmOptions>> = {
  closed: {
    title: '접수를 마감할까요?',
    message: '새 참가 신청을 더 받지 않아요. 필요하면 다시 접수를 열 수 있어요.',
    confirmLabel: '접수 마감하기',
  },
  in_progress: {
    title: '대회를 시작할까요?',
    message: '대진표와 경기 일정을 먼저 확인해 주세요. 실제 시작한 경기가 없으면 접수 마감으로 되돌릴 수 있어요.',
    confirmLabel: '대회 시작하기',
  },
  completed: {
    title: '대회를 완료할까요?',
    message:
      '완료하면 시상과 후기가 열리고 참가팀에 후기 요청 알림이 가요. 모든 경기 결과가 확정됐는지 먼저 확인해 주세요. 잘못 눌러도 진행 중으로 되돌릴 수 있어요.',
    confirmLabel: '대회 완료하기',
    tone: 'danger',
  },
};

const REOPEN_CONFIRM: ConfirmOptions = {
  title: '접수를 다시 열까요?',
  message: '새 참가 신청을 다시 받아요.',
  confirmLabel: '접수 다시 열기',
};

/**
 * 앱 확인 창 문구. 취소·되돌리기는 사유를 받는 별도 창을 쓰므로 null 이다.
 * 접수 시작은 비어 있는 필요 설정이 있어도 막지 않고 항목만 경고한다.
 */
export function statusConfirmOptions(
  action: StatusAction,
  ctx: { isPublic: boolean; requiredLabels: readonly string[] },
): ConfirmOptions | null {
  if (action.kind === 'cancel' || action.kind === 'revert') return null;
  if (action.kind === 'reopen') return REOPEN_CONFIRM;
  if (action.target !== 'open') return FORWARD_CONFIRM[action.target] ?? null;

  const visibility = ctx.isPublic
    ? '신청을 받기 시작하고 참가자에게 대회가 공개돼요.'
    : '신청을 받기 시작해요. 비공개 설정이라 일반 화면에는 계속 보이지 않아요.';
  const warning =
    ctx.requiredLabels.length > 0
      ? ` 아직 채우지 않은 설정이 있어요: ${ctx.requiredLabels.join(', ')}. 접수를 시작한 뒤에도 대회 정보에서 채울 수 있어요.`
      : '';
  return { title: '접수를 시작할까요?', message: `${visibility}${warning}`, confirmLabel: '접수 시작하기' };
}
