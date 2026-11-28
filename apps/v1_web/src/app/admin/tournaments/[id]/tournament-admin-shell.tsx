'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { AdminTabNav } from '@/components/admin/admin-tab-nav';
import { GateConfirmModal } from '@/components/admin/operation-flag-gate-confirm-modal';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { LG_UP_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import {
  useV1AdminMe,
  useV1AdminTournament,
  useV1ChangeTournamentStatus,
  useV1UpdateTournamentVisibility,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { canWriteTournamentAdmin, deriveTournamentAdminRole, type TournamentAdminRole } from '@/lib/admin-tournament-role';
import { useTournamentOpsAccess } from './tournament-ops-quick-links';
import { TournamentAdminProvider, type TournamentStatusAdvance } from './tournament-admin-context';
import { REVERT_COPY, formatDateRange, revertTargetStatus } from './tournament-admin-shared';
import { TournamentDetailHeader } from './tournament-detail-header';
import { buildTournamentNav } from './tournament-nav-model';
import { buildTournamentSetupItems, requiredSetupLabels } from './tournament-overview-model';
import { TournamentStatusMenu } from './tournament-status-menu';
import { primaryStatusAction, statusConfirmOptions, type StatusAction } from './tournament-status-model';
import { useAdminListReturnHref } from '../../use-admin-url-list-query';

export function TournamentAdminShell({ id, children }: { id: string; children: ReactNode }) {
  const { data: adminMe } = useV1AdminMe();
  // 역할이 단일 출처다 — canWrite 는 거기서 파생된다. adminMe 가 아직 없으면 가장 좁은
  // 역할(조회 전용)로 둔다: 로딩 중에 쓰기 버튼이 잠깐 보였다가 사라지면 안 된다.
  const role = adminMe
    ? deriveTournamentAdminRole({ kind: 'platform', adminRole: adminMe.adminRole })
    : 'SUPPORT_READONLY';
  return <TournamentManagementContent id={id} role={role}>{children}</TournamentManagementContent>;
}

/** Both surfaces use exactly the same forms; the director entry supplies a verified scoped role. */
export function TournamentManagementContent({ id, role, staffSurface = false, navigation, children }: {
  id: string; role: TournamentAdminRole; staffSurface?: boolean; children: ReactNode;
  /** Explicit route dependencies for the isolated public sample; no auth or API behavior changes. */
  navigation?: { basePath: string; listHref: string; operationsBasePath: string; localPopups?: boolean };
}) {
  const { data: tournament, isPending, isError, error, refetch } = useV1AdminTournament(id);
  const canWrite = canWriteTournamentAdmin(role);
  const changeStatus = useV1ChangeTournamentStatus(id);
  const updateVisibility = useV1UpdateTournamentVisibility(id);
  const opsAccess = useTournamentOpsAccess({ tournamentId: id, staffSurface, basePath: navigation?.operationsBasePath });
  const [revertOpen, setRevertOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // 데스크톱 셸 폭에서는 다음 단계 주 버튼이 머리에, 그보다 좁으면 개요 카드에 있다 — 한 곳에만 둔다.
  const advanceInHeader = useMediaQuery(LG_UP_MEDIA_QUERY);
  const { toasts, showToast } = useAdminToast();
  const { confirm: confirmStatusChange, ConfirmModal: StatusConfirmModal } = useConfirm();
  const pathname = usePathname();
  // '대회 목록으로'는 대회 목록을 마지막으로 본 주소(검색·필터·페이지)로 돌아간다(MD-QA #21).
  const adminListHref = useAdminListReturnHref('/admin/tournaments');
  const listHref = navigation?.listHref ?? (staffSurface ? '/tournament-management' : adminListHref);
  const basePath = navigation?.basePath ?? `${staffSurface ? '/tournament-management/tournaments' : '/admin/tournaments'}/${id}`;

  const onConfirmRevert = (reason: string) => {
    const target = tournament ? revertTargetStatus(tournament.status, tournament.canRevertStart === true) : null;
    if (!tournament || !target) return;
    changeStatus.mutate(
      { status: target, reason: reason.trim() },
      {
        onSuccess: () => {
          setRevertOpen(false);
          showToast(REVERT_COPY[tournament.status]?.toast ?? '상태를 변경했어요.', 'success');
        },
        onError: (err) => showToast(extractErrorMessage(err, '상태를 되돌리지 못했어요.'), 'error'),
      },
    );
  };

  if (isPending) {
    return (
      <div className="animate-pulse">
        <div className="mb-4 h-4 bg-[var(--surface-soft)] rounded-lg w-24" />
        <div className="h-7 bg-[var(--surface-soft)] rounded-lg w-64 mb-2" />
        <div className="h-4 bg-[var(--surface-soft)] rounded-lg w-48 mb-6" />
        <AdminTableSkeleton cols={5} />
      </div>
    );
  }

  if (isError || !tournament) {
    return (
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] py-10 px-4 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-[var(--red700)] font-medium">
          {extractErrorMessage(error, '대회 정보를 불러오지 못했어요.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm text-[var(--blue700)] hover:bg-[var(--blue50)] underline underline-offset-2 min-h-[44px] px-3 rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          다시 시도하기
        </button>
      </div>
    );
  }

  const isPublic = tournament.isPublic ?? true;
  const canRevertStart = tournament.canRevertStart === true;
  const requiredLabels = requiredSetupLabels(buildTournamentSetupItems(tournament, new Date(), basePath));
  const counts = tournament.operationCounts;
  const revertCopy = revertTargetStatus(tournament.status, canRevertStart) ? REVERT_COPY[tournament.status] : undefined;

  const handleStatusAction = async (action: StatusAction) => {
    // 취소·되돌리기는 사유를 남기는 공용 확인 게이트를 거친다.
    if (action.kind === 'cancel') {
      setCancelOpen(true);
      return;
    }
    if (action.kind === 'revert') {
      setRevertOpen(true);
      return;
    }
    // 마감·시작·완료는 모바일에서 오탭하면 참가팀 전체에 바로 반영된다(2026-10 알파 실측: 확인 없이 즉시 실행).
    const confirmOptions = statusConfirmOptions(action, { isPublic, requiredLabels });
    if (confirmOptions && !(await confirmStatusChange(confirmOptions))) return;
    changeStatus.mutate(
      { status: action.target },
      {
        onSuccess: (res) => {
          showToast(res.alreadyInStatus ? '이미 이 상태예요.' : '상태를 변경했어요.', 'success');
        },
        onError: (err) => showToast(extractErrorMessage(err, '상태 변경에 실패했어요.'), 'error'),
      },
    );
  };

  const handleToggleVisibility = (next: boolean) => {
    updateVisibility.mutate(
      { isPublic: next },
      {
        onSuccess: () => showToast('공개 상태를 저장했어요.', 'success'),
        onError: (err) => showToast(extractErrorMessage(err, '공개 상태를 저장하지 못했어요.'), 'error'),
      },
    );
  };

  const primary = canWrite ? primaryStatusAction(tournament.status, { canRevertStart }) : null;
  const advance: TournamentStatusAdvance | null = primary
    ? {
        label: primary.label,
        hint: primary.hint,
        // 초안에서 채워야 할 필요 설정이 남았으면 흰 버튼 — 막지는 않고 확인 창이 항목을 경고한다.
        emphasis: tournament.status === 'draft' && requiredLabels.length > 0 ? 'secondary' : 'primary',
        busy: changeStatus.isPending,
        onClick: () => void handleStatusAction(primary),
      }
    : null;

  // 경기가 생기기 전에는 현장 운영이 머리에 없고 ⋯ 메뉴 안에 있다. 접근 판정은 스태프 배정 조회 하나라 둘이 같이 잠긴다.
  const showLiveOpsInHeader = (counts?.fixtures ?? 0) > 0;
  const opsAction = (key: string, label: string, path: string): ActionSheetAction =>
    opsAccess.reasonLabel
      ? { key, label, disabled: true, disabledReason: opsAccess.reasonLabel, onSelect: () => {} }
      : { key, label, href: `${opsAccess.base}/${path}` };
  const moreActions: ActionSheetAction[] = [
    ...(showLiveOpsInHeader ? [] : [opsAction('live-ops', '현장 운영', 'operations')]),
    opsAction('staff', '스태프 배정', 'staff'),
  ];

  const nav = buildTournamentNav({
    id,
    status: tournament.status,
    staffSurface,
    restricted: navigation !== undefined,
    localPopups: navigation?.localPopups === true,
    counts,
  });

  const meta = [
    tournament.venue?.trim() || '장소 미정',
    tournament.scheduledAt ? formatDateRange(tournament.scheduledAt, tournament.scheduledEndAt) : '일정 미정',
    `${tournament.teamCount}팀`,
  ].join(' · ');

  return (
    <TournamentAdminProvider
      value={{ tournamentId: id, basePath, role, canWrite, showToast, overviewAdvance: advanceInHeader ? null : advance }}
    >
      <TournamentDetailHeader
        title={tournament.title}
        meta={meta}
        listHref={listHref}
        statusMenu={
          <TournamentStatusMenu
            status={tournament.status}
            isPublic={isPublic}
            canWrite={canWrite}
            canRevertStart={canRevertStart}
            visibilityPending={updateVisibility.isPending}
            statusPending={changeStatus.isPending}
            onStatusAction={(action) => void handleStatusAction(action)}
            onToggleVisibility={handleToggleVisibility}
          />
        }
        primaryAction={advanceInHeader && advance ? advance : undefined}
        liveOps={showLiveOpsInHeader ? { href: `${opsAccess.base}/operations`, reasonLabel: opsAccess.reasonLabel } : undefined}
        moreActions={moreActions}
      />

      <AdminTabNav
        ariaLabel="대회 관리 섹션"
        tabs={nav.tabs}
        more={{ label: '더보기', groups: nav.more }}
        basePath={basePath}
        pathname={pathname}
      />

      <div className="mt-6 min-w-0">{children}</div>

      {/* 상태 변경 확인과 사유 필수 게이트 */}
      {StatusConfirmModal}
      <GateConfirmModal
        open={cancelOpen}
        pending={changeStatus.isPending}
        title="대회를 취소할까요?"
        description="취소 사유를 남겨 주세요. 취소 후에도 초안으로 복구할 수 있어요."
        confirmLabel="대회 취소하기"
        cancelLabel="돌아가기"
        tone="blue"
        onConfirm={(reason) => {
          if (!reason.trim() || !canWrite || changeStatus.isPending) return;
          changeStatus.mutate({ status: 'cancelled', reason: reason.trim() }, {
            onSuccess: () => {
              setCancelOpen(false);
              showToast('대회를 취소했어요.', 'success');
            },
            onError: (err) => showToast(extractErrorMessage(err, '대회 취소에 실패했어요.'), 'error'),
          });
        }}
        onClose={() => setCancelOpen(false)}
      />
      {revertCopy && (
        <GateConfirmModal
          open={revertOpen}
          pending={changeStatus.isPending}
          title={revertCopy.title}
          description={revertCopy.description}
          confirmLabel={revertCopy.confirmLabel}
          tone="blue"
          onConfirm={onConfirmRevert}
          onClose={() => setRevertOpen(false)}
        />
      )}

      <AdminToasts toasts={toasts} />
    </TournamentAdminProvider>
  );
}
