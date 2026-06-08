'use client';

import Link from 'next/link';
import {
  useV1MyMatches,
  useV1MyTeams,
  useV1Notifications,
  useV1Profile,
  useV1Reviews,
} from '@/hooks/use-v1-api';
import {
  AdminBadge,
  AdminEmpty,
  AdminKpiCard,
  AdminListSkeleton,
  AdminPageHeader,
  AdminRow,
  AdminShell,
} from '@/components/admin';

function formatDate(value: string) {
  const d = new Date(value);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}월 ${day}일`;
}

function roleLabel(role: string) {
  if (role === 'owner') return '팀장';
  if (role === 'manager') return '운영진';
  return '멤버';
}

export default function AdminPage() {
  const profileQ = useV1Profile();
  const matchesQ = useV1MyMatches({ limit: 5 });
  const teamsQ = useV1MyTeams();
  const notificationsQ = useV1Notifications({ limit: 3, status: 'created' });
  const reviewsQ = useV1Reviews({ state: 'ready', limit: 3 });

  const isLoading =
    profileQ.isPending ||
    matchesQ.isPending ||
    teamsQ.isPending ||
    notificationsQ.isPending ||
    reviewsQ.isPending;

  const profile = profileQ.data;
  const matches = matchesQ.data;
  const teams = teamsQ.data;
  const notifications = notificationsQ.data;
  const reviews = reviewsQ.data;

  const pendingReviewCount = reviews?.items.filter((r) => r.state === 'ready').length ?? 0;
  const displayName = profile?.profile?.displayName ?? profile?.displayName ?? '...';

  return (
    <AdminShell activeTab="home">
      <AdminPageHeader
        eyebrow="업무 현황"
        title={`안녕하세요, ${displayName}님`}
        description="오늘의 운영 현황을 정리했어요."
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <AdminKpiCard
          label="내 매치"
          value={matches?.items.length ?? 0}
          href="/admin/matches"
        />
        <AdminKpiCard
          label="내 팀"
          value={teams?.items.length ?? 0}
          href="/admin/teams"
        />
        <AdminKpiCard
          label="읽지 않은 알림"
          value={notifications?.unreadCount ?? 0}
          tone="warning"
          href="/admin/notifications"
        />
        <AdminKpiCard
          label="미작성 리뷰"
          value={pendingReviewCount}
          tone={pendingReviewCount > 0 ? 'warning' : 'neutral'}
          href="/admin/reviews"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/matches/new"
          className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-[15px] font-semibold rounded-xl px-5 h-11 transition-colors inline-flex items-center gap-1.5"
        >
          + 매치 만들기
        </Link>
        <Link
          href="/team-matches/new"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[14px] font-medium rounded-xl px-4 h-10 transition-colors inline-flex items-center"
        >
          팀매치 만들기
        </Link>
        <Link
          href="/teams/new"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[14px] font-medium rounded-xl px-4 h-10 transition-colors inline-flex items-center"
        >
          팀 만들기
        </Link>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent matches */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <span className="text-[16px] font-bold text-gray-900">최근 매치</span>
            <Link
              href="/admin/matches"
              className="text-[13px] text-blue-500 font-medium hover:text-blue-600 transition-colors"
            >
              전체 보기
            </Link>
          </div>
          {isLoading ? (
            <AdminListSkeleton rows={3} />
          ) : !matches?.items.length ? (
            <AdminEmpty
              icon="⚽"
              title="만든 매치가 없어요"
              action={
                <Link
                  href="/matches/new"
                  className="text-[13px] text-blue-500 font-medium hover:text-blue-600 transition-colors"
                >
                  매치 만들기
                </Link>
              }
            />
          ) : (
            matches.items.slice(0, 5).map((m) => (
              <AdminRow
                key={m.id ?? m.matchId}
                title={m.title}
                meta={`${m.participantCount ?? 0}/${m.capacity ?? '?'}명 · ${formatDate(m.startsAt)}`}
                badge={<AdminBadge status={m.status} />}
                href={`/matches/${m.id ?? m.matchId}`}
              />
            ))
          )}
        </div>

        {/* My teams */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <span className="text-[16px] font-bold text-gray-900">내 팀</span>
            <Link
              href="/admin/teams"
              className="text-[13px] text-blue-500 font-medium hover:text-blue-600 transition-colors"
            >
              전체 보기
            </Link>
          </div>
          {isLoading ? (
            <AdminListSkeleton rows={3} />
          ) : !teams?.items.length ? (
            <AdminEmpty
              icon="👥"
              title="소속된 팀이 없어요"
              action={
                <Link
                  href="/teams/new"
                  className="text-[13px] text-blue-500 font-medium hover:text-blue-600 transition-colors"
                >
                  팀 만들기
                </Link>
              }
            />
          ) : (
            teams.items.slice(0, 5).map((t) => (
              <AdminRow
                key={t.teamId}
                title={t.name}
                meta={`${t.memberCount}명 · ${roleLabel(t.role)}`}
                badge={<AdminBadge status={t.role} />}
                href={`/teams/${t.teamId}`}
              />
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
