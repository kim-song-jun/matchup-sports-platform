'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  AdminLeagueStatePill,
  AdminPageHeader,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { AdminSectionNav, type AdminSectionNavGroup } from '@/components/admin/admin-section-nav';
import { TournamentOpsQuickLinks } from '@/app/admin/tournaments/[id]/tournament-ops-quick-links';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1AdminLeagueMatch } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { sanitizeRedirectPath } from '@/lib/session-storage';
import { LeagueStateModal } from './league-state-modal';
import { LeagueVisibilityControl } from './league-visibility-control';

/**
 * 리그 상세 섹션 구획 — 대회 상세(`TournamentAdminShell`)와 같은 틀이다.
 *
 * 예전에는 설정 카드 여섯 장과 일정·참가팀 관리가 한 화면에 세로로 쌓여 있어서, 경기 날 쓰는
 * 일정까지 한참 내려가야 했다. 쓰는 때가 다른 것끼리 묶고 섹션마다 주소를 둬서 딥링크·뒤로가기가
 * 동작하게 한다. 헤더·상태 변경·공개 설정은 여기서 한 번만 그린다.
 */
export function LeagueAdminShell({ leagueId, children }: { leagueId: string; children: ReactNode }) {
  const { data: series, isPending, isError, error, refetch } = useV1AdminLeagueMatch(leagueId);
  const canWrite = useAdminCanWrite();
  const { toasts, showToast } = useAdminToast();
  // 상태 변경 모달 — 상태 버튼이 상황마다 흩어져 있던 것(보류 카드·되돌리기·종료)을 하나로 모았다.
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const pathname = usePathname();
  // 목록에서 넘어온 출처(`?from=`) — 값이 하나이고 로컬 경로일 때만 믿는다. 섹션을 옮겨도 이어지도록
  // 섹션 링크에도 붙인다.
  const fromValues = useSearchParams().getAll('from');
  const from = fromValues.length === 1 ? sanitizeRedirectPath(fromValues[0]) : null;
  const returnHref = from ?? '/admin/league-matches';
  const query = from === null ? '' : `?from=${encodeURIComponent(from)}`;
  const basePath = `/admin/league-matches/${encodeURIComponent(leagueId)}`;

  if (isPending) {
    return (
      <div className="animate-pulse">
        <div className="mb-4 h-4 bg-[var(--surface-soft)] rounded-lg w-24" />
        <div className="h-7 bg-[var(--surface-soft)] rounded-lg w-64 mb-2" />
        <div className="h-4 bg-[var(--surface-soft)] rounded-lg w-48 mb-6" />
        <AdminTableSkeleton cols={4} />
      </div>
    );
  }

  if (isError || !series) {
    return (
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] py-10 px-4 flex flex-col items-center gap-3 text-center">
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--red700)] font-medium">
          {extractErrorMessage(error, '리그 정보를 불러오지 못했어요.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-[length:var(--font-size-body-sm)] text-[var(--blue700)] hover:bg-[var(--blue50)] underline underline-offset-2 min-h-[44px] px-3 rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          다시 시도하기
        </button>
      </div>
    );
  }

  const navGroups: AdminSectionNavGroup[] = [
    {
      label: '운영',
      items: [
        { slug: 'schedule', label: '일정', count: series.fixtures.length },
        { slug: 'registrations', label: '신청 관리' },
      ],
    },
    {
      label: '설정',
      items: [
        // 경로는 예전 "리그 수정" 그대로 — 이미 걸려 있는 링크를 깨지 않는다.
        { slug: 'edit', label: '리그 정보' },
        { slug: 'rules', label: '경기 규칙' },
      ],
    },
    {
      label: '사후',
      items: [
        { slug: 'videos', label: '경기 영상' },
        { slug: 'reviews', label: '후기 관리' },
      ],
    },
  ];

  return (
    <div className="tm-content-enter">
      {/* 대회 관리 상세의 "대회 목록으로"와 같은 자리·같은 모양 */}
      <div className="mb-4">
        <Link
          href={returnHref}
          className="inline-flex items-center gap-1 min-h-[44px] text-[length:var(--font-size-label)] text-[var(--text-muted)] hover:text-[var(--text-strong)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          리그 목록으로
        </Link>
      </div>
      <AdminPageHeader
        eyebrow="플랫폼 · 리그"
        title={series.title}
        description={`${series.teamIds.length}팀 참가 · 대진 ${series.fixtures.length}경기`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AdminLeagueStatePill state={series.state} />
            {canWrite && (
              <button
                type="button"
                onClick={() => setStateModalOpen(true)}
                className="inline-flex min-h-[var(--size-touch-min)] items-center rounded-xl border border-[var(--border-strong)] px-4 text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                상태 변경
              </button>
            )}
          </div>
        }
      />

      {stateModalOpen && (
        <LeagueStateModal leagueId={leagueId} series={series} onClose={() => setStateModalOpen(false)} showToast={showToast} />
      )}
      {/* 보류 중에는 공개 설정을 따로 바꾸지 않는다 — 보류 해제가 공개 여부까지 되돌린다(서버도 409). */}
      {series.state === 'on_hold' ? null : <LeagueVisibilityControl leagueId={leagueId} isPublic={series.isPublic} />}

      {/* 스태프 배정 콘솔·운영 보드 — 리그 상세에는 이 입구가 없어 사이드바의 현장 운영을 거쳐야 했다.
          리그도 대회와 같은 id 로 같은 화면이 열린다. */}
      <TournamentOpsQuickLinks tournamentId={leagueId} />

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* 섹션 내비 — 데스크톱은 좌측 세로 목록, 모바일은 가로 스크롤 한 줄 */}
        <AdminSectionNav
          ariaLabel="리그 관리 섹션"
          groups={navGroups}
          basePath={basePath}
          pathname={pathname}
          query={query}
        />

        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <AdminToasts toasts={toasts} />
    </div>
  );
}
