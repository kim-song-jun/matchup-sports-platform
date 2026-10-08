'use client';

import Link from 'next/link';
import { AdminEmpty, AdminListSkeleton, AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { useV1AdminLeagueMatch, useV1AdminMe } from '@/hooks/use-v1-api';
import { canWriteTournamentAdmin, deriveTournamentAdminRole } from '@/lib/admin-tournament-role';
import { extractErrorMessage } from '@/lib/error-message';
import { ReviewsTab } from '../../../tournaments/[id]/reviews-tab';

export default function LeagueReviewsClient({ leagueId }: { leagueId: string }) {
  const league = useV1AdminLeagueMatch(leagueId);
  const admin = useV1AdminMe();
  const { toasts, showToast } = useAdminToast();
  const role = admin.data
    ? deriveTournamentAdminRole({ kind: 'platform', adminRole: admin.data.adminRole })
    : 'SUPPORT_READONLY';
  const retryButton = (
    <button
      type="button"
      onClick={() => {
        if (league.isError || !league.data) void league.refetch();
        if (admin.isError || !admin.data) void admin.refetch();
      }}
      className="inline-flex min-h-[var(--size-touch-min)] items-center rounded-xl border border-[var(--border-strong)] px-4 text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
    >
      다시 시도
    </button>
  );

  return (
    <div className="tm-content-enter">
      <AdminPageHeader
        eyebrow="플랫폼 · 리그"
        title={league.data ? `${league.data.title} 후기 관리` : '리그 후기 관리'}
        action={
          <Link
            href={`/admin/league-matches/${encodeURIComponent(leagueId)}`}
            className="inline-flex min-h-[var(--size-touch-min)] items-center rounded-xl border border-[var(--border-strong)] px-4 text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            리그 상세로
          </Link>
        }
      />
      {league.isPending || admin.isPending ? (
        <div>
          <p className="sr-only" role="status">후기 관리 정보를 불러오는 중이에요.</p>
          <AdminListSkeleton />
        </div>
      ) : league.isError || admin.isError ? (
        <AdminEmpty
          role="alert"
          title="후기 관리 정보를 불러오지 못했어요"
          description={extractErrorMessage(admin.isError ? admin.error : league.error, '잠시 후 다시 시도해 주세요.')}
          action={retryButton}
        />
      ) : !league.data || !admin.data ? (
        <AdminEmpty role="alert" title="후기 관리 정보를 확인할 수 없어요" description="리그와 관리자 정보를 다시 불러와 주세요." action={retryButton} />
      ) : (
        // 후기 API는 리그도 지원하지만 대회 전용 셸은 리그를 조회하지 못하므로 리그 엔티티 확인 후 공유 탭만 사용한다.
        <ReviewsTab tournamentId={leagueId} canWrite={canWriteTournamentAdmin(role)} showToast={showToast} />
      )}
      <AdminToasts toasts={toasts} />
    </div>
  );
}
