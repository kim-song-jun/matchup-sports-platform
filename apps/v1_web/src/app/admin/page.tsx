'use client';

import Link from 'next/link';
import { Swords, Users, Bell, Star, Plus, ArrowRight, TrendingUp, BarChart3, Zap } from 'lucide-react';
import {
  useV1MyMatches,
  useV1MyTeams,
  useV1Notifications,
  useV1Profile,
  useV1Reviews,
  useV1MyActivitySummary,
} from '@/hooks/use-v1-api';
import {
  AdminEmpty,
  AdminKpiCard,
  AdminListSkeleton,
  AdminPageHeader,
  AdminRow,
  AdminShell,
  AdminBadge,
} from '@/components/admin';

function roleLabel(role: string) {
  if (role === 'owner') return '팀장';
  if (role === 'manager') return '운영진';
  return '멤버';
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '날짜 미정';
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  } catch {
    return dateStr;
  }
}

export default function AdminPage() {
  const profileQ = useV1Profile();
  const matchesQ = useV1MyMatches({ limit: 5 });
  const teamsQ = useV1MyTeams();
  const notificationsQ = useV1Notifications({ limit: 5 });
  const reviewsQ = useV1Reviews({ limit: 10 });
  const activityQ = useV1MyActivitySummary();

  const profile = profileQ.data;
  const matches = matchesQ.data;
  const teams = teamsQ.data;
  const notifications = notificationsQ.data;
  const reviews = reviewsQ.data;
  const activity = activityQ.data;

  const displayName =
    profile?.profile?.displayName ??
    (profile as unknown as { displayName?: string })?.displayName ??
    '운영자';
  const pendingReviews = reviews?.items.filter((r) => r.state === 'ready').length ?? 0;
  const unreadCount = notifications?.unreadCount ?? 0;

  return (
    <AdminShell>
      {/* Page greeting */}
      <div className="mb-6 md:mb-7">
        <h1 className="text-[22px] md:text-[24px] font-bold text-gray-900 mb-1">
          안녕하세요, {displayName}님
        </h1>
        <p className="text-[13px] md:text-[14px] text-gray-500">오늘의 운영 현황을 정리했어요.</p>
      </div>

      {/* KPI row — 4-up on md+ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <AdminKpiCard label="내 매치" value={matches?.items.length ?? 0} icon={<Swords size={16} />} href="/admin/matches" />
        <AdminKpiCard label="내 팀" value={teams?.items.length ?? 0} icon={<Users size={16} />} href="/admin/teams" />
        <AdminKpiCard
          label="읽지 않은 알림"
          value={unreadCount}
          tone={unreadCount > 0 ? 'warning' : 'neutral'}
          icon={<Bell size={16} />}
          href="/admin/notifications"
        />
        <AdminKpiCard
          label="미작성 리뷰"
          value={pendingReviews}
          tone={pendingReviews > 0 ? 'warning' : 'neutral'}
          icon={<Star size={16} />}
          href="/admin/reviews"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/matches/new"
          className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-[14px] font-semibold rounded-xl px-5 h-11 inline-flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <Plus size={16} aria-hidden="true" />
          매치 만들기
        </Link>
        <Link
          href="/team-matches/new"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[14px] font-medium rounded-xl px-4 h-11 inline-flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <Zap size={15} aria-hidden="true" />
          팀매치 만들기
        </Link>
        <Link
          href="/teams/new"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[14px] font-medium rounded-xl px-4 h-11 inline-flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <Users size={15} aria-hidden="true" />
          팀 만들기
        </Link>
      </div>

      {/* Activity summary — inline with lists on xl screens */}
      {activity && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={17} className="text-blue-500" aria-hidden="true" />
            <span className="text-[15px] font-bold text-gray-900">이번 달 활동</span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            <div className="text-center md:col-span-1">
              <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">{activity.monthly.matchCount}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">매치 참여</p>
            </div>
            <div className="text-center md:col-span-1">
              <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">
                {activity.monthly.mannerScore != null ? activity.monthly.mannerScore.toFixed(1) : '—'}
              </p>
              <p className="text-[12px] text-gray-500 mt-0.5">매너 점수</p>
            </div>
            <div className="text-center md:col-span-1">
              <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">
                {activity.monthly.winRate != null ? `${Math.round(activity.monthly.winRate * 100)}%` : '—'}
              </p>
              <p className="text-[12px] text-gray-500 mt-0.5">승률</p>
            </div>
            {/* Totals — shown inline on md+ */}
            <div className="hidden md:block text-center col-span-1">
              <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">{activity.totals.activityCount}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">누적 활동</p>
            </div>
            <div className="hidden md:block text-center col-span-1">
              <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">{activity.totals.teamCount}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">팀 활동</p>
            </div>
            <div className="hidden md:block text-center col-span-1">
              <p className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">
                {activity.totals.mannerScore != null ? activity.totals.mannerScore.toFixed(1) : '—'}
              </p>
              <p className="text-[12px] text-gray-500 mt-0.5">누적 매너</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent lists — 2-column side-by-side on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Swords size={16} className="text-gray-400" aria-hidden="true" />
              <span className="text-[15px] font-bold text-gray-900">최근 매치</span>
            </div>
            <Link
              href="/admin/matches"
              className="flex items-center gap-0.5 text-[13px] text-blue-500 font-medium hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
            >
              전체 보기 <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          {matchesQ.isPending ? (
            <AdminListSkeleton rows={3} />
          ) : !matches?.items.length ? (
            <AdminEmpty icon={<Swords size={32} />} title="만든 매치가 없어요"
              action={<Link href="/matches/new" className="text-[13px] text-blue-500 font-medium">매치 만들기</Link>} />
          ) : (
            matches.items.slice(0, 5).map((m) => {
              const id = (m as unknown as { id?: string; matchId?: string }).id ?? (m as unknown as { matchId?: string }).matchId;
              return (
                <AdminRow
                  key={id ?? m.title}
                  title={m.title}
                  meta={`${formatDate(m.startsAt)} · ${m.participantCount ?? 0}/${m.capacity ?? '?'}명`}
                  badge={<AdminBadge status={m.status} />}
                  href={`/matches/${id}`}
                />
              );
            })
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-400" aria-hidden="true" />
              <span className="text-[15px] font-bold text-gray-900">내 팀</span>
            </div>
            <Link
              href="/admin/teams"
              className="flex items-center gap-0.5 text-[13px] text-blue-500 font-medium hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
            >
              전체 보기 <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          {teamsQ.isPending ? (
            <AdminListSkeleton rows={3} />
          ) : !teams?.items.length ? (
            <AdminEmpty icon={<Users size={32} />} title="소속된 팀이 없어요"
              action={<Link href="/teams/new" className="text-[13px] text-blue-500 font-medium">팀 만들기</Link>} />
          ) : (
            teams.items.slice(0, 5).map((t) => (
              <AdminRow
                key={t.teamId}
                title={t.name}
                meta={`${t.sport.name} · ${t.memberCount}명`}
                badge={<AdminBadge status={t.role} label={roleLabel(t.role)} />}
                href={t.detailRoute}
              />
            ))
          )}
        </div>
      </div>

      {/* Unread notifications — full-width strip */}
      {unreadCount > 0 && notifications && (
        <div className="bg-white rounded-2xl border border-blue-100 mt-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-blue-500" aria-hidden="true" />
              <span className="text-[15px] font-bold text-gray-900">읽지 않은 알림</span>
              <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5" aria-label={`${unreadCount}개 안 읽음`}>
                {unreadCount}
              </span>
            </div>
            <Link
              href="/admin/notifications"
              className="flex items-center gap-0.5 text-[13px] text-blue-500 font-medium focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
            >
              전체 보기 <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          {notifications.items
            .filter((n) => n.status === 'created')
            .slice(0, 3)
            .map((n) => (
              <AdminRow
                key={n.notificationId}
                title={n.title}
                meta={n.body ?? undefined}
                badge={<AdminBadge status="created" label="새 알림" />}
                href={n.target.route ?? undefined}
                leftIcon={<span className="w-2 h-2 bg-blue-500 rounded-full block" aria-hidden="true" />}
              />
            ))}
        </div>
      )}

      {/* Totals — mobile-only (collapsed on md+ into activity panel) */}
      {activity && (
        <div className="bg-white rounded-2xl border border-gray-100 mt-4 p-5 md:hidden">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={17} className="text-green-500" aria-hidden="true" />
            <span className="text-[15px] font-bold text-gray-900">누적 활동</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{activity.totals.activityCount}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">총 활동</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{activity.totals.teamCount}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">팀 활동</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {activity.totals.mannerScore != null ? activity.totals.mannerScore.toFixed(1) : '—'}
              </p>
              <p className="text-[12px] text-gray-500 mt-0.5">매너 점수</p>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
