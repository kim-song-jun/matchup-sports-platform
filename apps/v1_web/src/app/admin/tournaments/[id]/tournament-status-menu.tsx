'use client';

import { ChevronDown } from 'lucide-react';
import { AdminStatusPill } from '@/components/admin';
import { tournamentVisibilityAction } from '@/components/admin/tournaments/tournament-visibility-control';
import { ActionMenu } from '@/components/v1-ui/action-menu';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
import type { V1TournamentStatus } from '@/types/api';
import {
  TOURNAMENT_CHIP_LABEL,
  TOURNAMENT_STAGES,
  TOURNAMENT_STAGE_LABEL,
  stageIndex,
  statusActions,
  type StatusAction,
} from './tournament-status-model';

export interface TournamentStatusMenuProps {
  status: V1TournamentStatus;
  isPublic: boolean;
  canWrite: boolean;
  canRevertStart: boolean;
  visibilityPending: boolean;
  /** 상태를 바꾸는 요청이 진행 중이면 상태 바꾸기·취소 항목을 잠근다. */
  statusPending?: boolean;
  onStatusAction: (action: StatusAction) => void;
  onToggleVisibility: (next: boolean) => void;
}

function StageProgress({ status }: { status: V1TournamentStatus }) {
  const current = stageIndex(status);
  return (
    <div className="rounded-xl bg-[var(--surface-soft)] p-3">
      <p className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">
        지금: {TOURNAMENT_CHIP_LABEL[status]}
      </p>
      {current === null ? null : (
        <ol aria-label="진행 단계" className="mt-2 grid grid-cols-5 gap-1">
          {TOURNAMENT_STAGES.map((stage, index) => (
            <li key={stage} aria-current={index === current ? 'step' : undefined}>
              <span
                aria-hidden="true"
                className={`block h-1 rounded-full ${index <= current ? 'bg-blue-500' : 'bg-[var(--border-strong)]'}`}
              />
              <span
                className={[
                  'mt-1 block text-center text-[length:var(--font-size-micro)]',
                  index === current ? 'font-bold text-[var(--text-strong)]' : 'text-[var(--text-muted)]',
                ].join(' ')}
              >
                {TOURNAMENT_STAGE_LABEL[stage]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 머리의 상태 칩 — 누르면 진행 막대·상태 바꾸기·공개 스위치·대회 취소가 한 메뉴에 열린다. */
export function TournamentStatusMenu({
  status,
  isPublic,
  canWrite,
  canRevertStart,
  visibilityPending,
  statusPending = false,
  onStatusAction,
  onToggleVisibility,
}: TournamentStatusMenuProps) {
  const toMenuItem = (action: StatusAction, groupLabel: string): ActionSheetAction => ({
    key: action.key,
    label: action.label,
    description: action.description,
    groupLabel,
    destructive: action.kind === 'cancel',
    disabled: statusPending,
    disabledReason: statusPending ? '변경 중이에요.' : null,
    onSelect: () => onStatusAction(action),
  });

  const all = canWrite ? statusActions(status, { canRevertStart }) : [];
  const visibility = tournamentVisibilityAction({
    isPublic,
    status,
    canWrite,
    pending: visibilityPending,
    onToggle: onToggleVisibility,
  });
  const actions: ActionSheetAction[] = [
    ...all.filter((action) => action.kind !== 'cancel').map((action) => toMenuItem(action, '상태 바꾸기')),
    ...(visibility ? [visibility] : []),
    ...all.filter((action) => action.kind === 'cancel').map((action) => toMenuItem(action, '되돌리기 어려운 동작')),
  ];

  const chipLabel = TOURNAMENT_CHIP_LABEL[status];
  const visibilityLabel = status === 'cancelled' ? null : isPublic ? '공개' : '비공개';

  return (
    <ActionMenu
      label="대회 상태"
      header={<StageProgress status={status} />}
      actions={actions}
      trigger={({ onToggle, 'aria-expanded': expanded, 'aria-haspopup': haspopup }) => (
        <button
          type="button"
          aria-expanded={expanded}
          aria-haspopup={haspopup}
          aria-label={visibilityLabel ? `${chipLabel} · ${visibilityLabel}` : chipLabel}
          onClick={onToggle}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-2 text-[length:var(--font-size-label)] font-medium text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <AdminStatusPill status={status} label={chipLabel} />
          {visibilityLabel ? <span aria-hidden="true">· {visibilityLabel}</span> : null}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    />
  );
}
