'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  AdminPageHeader,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import {
  useV1AdminMe,
  useV1AdminTournament,
  useV1ChangeTournamentStatus,
} from '@/hooks/use-v1-api';
import type { V1TournamentStatus } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { TournamentOpsQuickLinks } from './tournament-ops-quick-links';
import { TournamentAdminProvider } from './tournament-admin-context';
import {
  TOURNAMENT_STATUS_LABEL,
  allowedNextStatuses,
  formatDateRange,
} from './tournament-admin-shared';

/**
 * 대회 상세 섹션 구획.
 *
 * 예전에는 탭 10개가 한 줄에 나란히 있어, 매일 여러 번 쓰는 운영 작업(신청·대진)과
 * 대회 시작 전 한 번 세팅하는 노출 작업(협찬·팝업·캠페인)이 같은 무게로 섞여 있었다.
 * 성격별로 묶고, 각 섹션을 하위 라우트로 분리해 딥링크·뒤로가기가 동작하게 한다.
 */
type CountKey = 'registrations' | 'fixtures' | 'announcements';

interface SectionItem {
  slug: string;
  label: string;
  /** 탭 옆 숫자에 쓰이는 operationCounts 키. 없으면 숫자를 그리지 않는다. */
  countKey?: CountKey;
}

const SECTION_GROUPS: { label: string; items: SectionItem[] }[] = [
  {
    label: '운영',
    items: [
      { slug: 'info', label: '대회 정보' },
      { slug: 'registrations', label: '신청 관리', countKey: 'registrations' },
      { slug: 'bracket', label: '대진 관리', countKey: 'fixtures' },
      { slug: 'announcements', label: '공지', countKey: 'announcements' },
    ],
  },
  {
    label: '노출',
    items: [
      { slug: 'sponsors', label: '협찬' },
      { slug: 'popups', label: '팝업' },
      { slug: 'campaign', label: '캠페인' },
    ],
  },
  {
    label: '사후',
    items: [
      { slug: 'reviews', label: '리뷰 관리' },
      { slug: 'awards', label: '개인 어워드' },
      { slug: 'statistics', label: '통계' },
    ],
  },
];

function SectionLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={typeof count === 'number' ? `${label} ${count}` : undefined}
      className={[
        'inline-flex shrink-0 items-center justify-between gap-2 min-h-[44px] px-3 rounded-lg text-[13px] transition-colors',
        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
        active
          ? 'bg-[var(--blue50)] text-[var(--blue700)] font-bold'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]',
      ].join(' ')}
    >
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={
            active
              ? 'font-semibold tabular-nums text-[var(--blue700)]'
              : 'font-semibold tabular-nums text-[var(--text-muted)]'
          }
          aria-hidden="true"
        >
          {count.toLocaleString('ko-KR')}
        </span>
      )}
    </Link>
  );
}

export function TournamentAdminShell({ id, children }: { id: string; children: ReactNode }) {
  const { data: tournament, isPending, isError, error, refetch } = useV1AdminTournament(id);
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
  const changeStatus = useV1ChangeTournamentStatus(id);
  const { toasts, showToast } = useAdminToast();
  const { confirm: confirmStatusChange, ConfirmModal: StatusConfirmModal } = useConfirm();
  const pathname = usePathname();
  const basePath = `/admin/tournaments/${id}`;

  // ── Status change ────────────────────────────────────────────────────
  const handleStatusChange = async (nextStatus: V1TournamentStatus) => {
    // 취소는 비가역 → 반드시 확인 게이트
    if (nextStatus === 'cancelled') {
      // "취소"(모달 닫기)와 "대회 취소"(대회를 없앰)가 나란히 놓이면 급할 때 오독한다 —
      // 두 버튼이 서로 다른 말이 되도록 닫기 쪽을 '돌아가기'로 바꾼다.
      const ok = await confirmStatusChange({
        title: '대회를 취소할까요?',
        message: '취소하면 되돌릴 수 없어요. 참가 신청과 일정도 함께 무효가 돼요.',
        confirmLabel: '대회 취소하기',
        cancelLabel: '돌아가기',
        tone: 'danger',
      });
      if (!ok) return;
    }
    changeStatus.mutate(
      { status: nextStatus },
      {
        onSuccess: (res) => {
          if (res.alreadyInStatus) {
            showToast('이미 이 상태예요.', 'success');
          } else {
            showToast('상태를 변경했어요.', 'success');
          }
        },
        onError: (err) =>
          showToast(extractErrorMessage(err, '상태 변경에 실패했어요.'), 'error'),
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

  const nextStatuses = allowedNextStatuses(tournament.status);
  const scheduleLabel = formatDateRange(tournament.scheduledAt, tournament.scheduledEndAt);
  const counts = tournament.operationCounts;

  return (
    <TournamentAdminProvider value={{ tournamentId: id, canWrite, showToast }}>
      {/* ── Back link ─────────────────────────────────────────────────── */}
      <div className="mb-4">
        <Link
          href="/admin/tournaments"
          className="inline-flex items-center gap-1 min-h-[44px] text-[13px] text-[var(--text-muted)] hover:text-[var(--text-muted)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          대회 목록으로
        </Link>
      </div>

      {/* ── Header ────────────────────────────────────────────────────── */}
      {/* f9: status buttons moved below header to avoid 6-line title wrap on mobile */}
      <AdminPageHeader
        eyebrow="플랫폼 · 대회"
        title={tournament.title}
        description={`${TOURNAMENT_STATUS_LABEL[tournament.status] ?? tournament.status} · ${tournament.venue ?? '장소 미정'} · ${scheduleLabel}`}
      />

      {/* ── Status change actions (f9: separate row, flex-wrap, h-[44px]) ── */}
      {/* #5: forward transitions = solid blue (primary); 취소하기 = outline red-text (not solid) */}
      {canWrite && nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {nextStatuses.map((s) => {
            const isDestructive = s === 'cancelled';
            const label =
              s === 'open' ? '접수 시작하기' :
              s === 'closed' ? '접수 마감하기' :
              s === 'in_progress' ? '대회 시작하기' :
              s === 'completed' ? '대회 완료하기' :
              s === 'cancelled' ? '취소하기' :
              `${TOURNAMENT_STATUS_LABEL[s] ?? s}(으)로 변경`;
            return (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusChange(s)}
                disabled={changeStatus.isPending}
                className={[
                  'inline-flex items-center h-[44px] px-4 rounded-xl text-[13px] font-semibold',
                  'transition-colors disabled:opacity-50',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 whitespace-nowrap',
                  isDestructive
                    ? 'text-[var(--red700)] border border-[var(--tint-red-border)] bg-transparent hover:bg-[var(--red50)]'
                    : 'text-white bg-blue-500 hover:bg-blue-600',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Tournament-ops quick links: 이 관리자 콘솔 섹션들과 별개인 대회 현장 운영
          콘솔(스태프 배정·운영 보드)은 여기 말고는 진입 경로가 없었다. T6-5(D-16):
          권한이 없으면 숨기지 않고 비활성 + 사유로 보여준다. */}
      <TournamentOpsQuickLinks tournamentId={id} />

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* 섹션 내비 — 데스크톱은 좌측 세로 목록, 모바일은 가로 스크롤 한 줄 */}
        <nav
          aria-label="대회 관리 섹션"
          className="lg:w-[184px] lg:shrink-0 lg:sticky lg:top-4 lg:self-start"
        >
          <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
            {SECTION_GROUPS.map((group) => (
              <div
                key={group.label}
                role="group"
                aria-label={group.label}
                className="flex shrink-0 gap-1 lg:flex-col lg:gap-0"
              >
                <p className="hidden lg:block px-3 pt-3 pb-1 text-[var(--font-size-caption)] font-bold tracking-wide text-[var(--text-caption)]">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <SectionLink
                    key={item.slug}
                    href={`${basePath}/${item.slug}`}
                    active={pathname === `${basePath}/${item.slug}`}
                    label={item.label}
                    count={item.countKey ? counts?.[item.countKey] : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {/* 대회 상태 변경 confirm modal (취소 등 비가역 액션) */}
      {StatusConfirmModal}

      <AdminToasts toasts={toasts} />
    </TournamentAdminProvider>
  );
}
