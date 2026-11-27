'use client';

import { Ellipsis } from 'lucide-react';
import { ActionMenu } from '@/components/v1-ui/action-menu';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
import { useV1ExportRosterCsv } from '@/hooks/use-v1-api';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { runCsvExport } from './registration-csv';
import {
  registrationMenuSubtitle,
  registrationPrimaryAction,
  type RegistrationHandlers,
  type RegistrationViewContext,
} from './registrations-model';
import { ADMIN_CANCELLABLE } from './tournament-detail-shared';

/**
 * 신청 행의 ⋯ 메뉴 — 주 버튼 하나로 끝나지 않는 조작을 모은다.
 * 되돌릴 수 없는 「신청 거부」는 맨 아래 따로 묶고, 팀의 취소 요청은 「취소 처리」 안에서 다룬다.
 */
export function RegistrationRowMenu({
  registration,
  ctx,
  handlers,
  gameRostersOpen = false,
}: {
  registration: V1AdminTournamentRegistration;
  ctx: RegistrationViewContext;
  handlers: RegistrationHandlers;
  /** 이 행의 경기별 명단이 펼쳐져 있으면 항목이 접기로 바뀐다. */
  gameRostersOpen?: boolean;
}) {
  // 행마다 훅 하나 — 훅이 신청 id 로 묶인 mutation 이라 목록 위에서 하나를 공유할 수 없다.
  const exportCsv = useV1ExportRosterCsv(registration.id);
  const { status } = registration;
  const teamName = registration.teamName ?? registration.teamId;
  // 조회 전용이면 모든 행의 주 버튼이 「명단 보기」라 메뉴에서는 같은 항목을 빼 둔다.
  const primary = ctx.canWrite ? registrationPrimaryAction(status) : 'view-roster';

  const actions: ActionSheetAction[] = [];
  if (ctx.canWrite && (status === 'payment_checking' || status === 'paid')) {
    actions.push({
      key: 'waitlist',
      label: '대기로 두기',
      disabled: ctx.admissionsBlockedReason !== null,
      disabledReason: ctx.admissionsBlockedReason,
      onSelect: () => handlers.onWaitlist(registration),
    });
  }
  if (primary !== 'view-roster') {
    actions.push({ key: 'roster', label: '명단 보기', onSelect: () => handlers.onViewRoster(registration) });
  }
  if (status === 'confirmed') {
    actions.push({
      key: 'game-rosters',
      label: gameRostersOpen ? '경기별 명단 접기' : '경기별 명단',
      description: '경기마다 출전 선수를 정해요',
      onSelect: () => handlers.onToggleGameRosters(registration),
    });
  }
  actions.push({
    key: 'csv',
    label: '명단 CSV 받기',
    disabled: exportCsv.isPending,
    onSelect: () => runCsvExport(exportCsv, `roster_${registration.id}.csv`, ctx.showToast),
  });
  // 취소 요청은 승인·유지 중 하나라 거부 항목이 아니다 — 「취소 처리」 가 맡는다.
  if (ctx.canWrite && ADMIN_CANCELLABLE.has(status) && status !== 'cancel_requested') {
    actions.push({
      key: 'reject',
      label: '신청 거부',
      destructive: true,
      groupLabel: '되돌릴 수 없어요',
      onSelect: () => handlers.onReject(registration),
    });
  }

  return (
    <ActionMenu
      label={teamName}
      subtitle={registrationMenuSubtitle(registration, ctx.isFreeEntry)}
      actions={actions}
      align="end"
      trigger={(trigger) => (
        <button
          type="button"
          aria-label={`${teamName} 더보기`}
          aria-expanded={trigger['aria-expanded']}
          aria-haspopup={trigger['aria-haspopup']}
          onClick={trigger.onToggle}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <Ellipsis size={20} aria-hidden="true" />
        </button>
      )}
    />
  );
}
