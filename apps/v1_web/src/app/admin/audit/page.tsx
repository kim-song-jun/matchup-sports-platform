'use client';

import {
  useV1MyActivitySummary,
  useV1MyMatches,
  useV1MyTeamMatches,
} from '@/hooks/use-v1-api';
import {
  AdminBadge,
  AdminEmpty,
  AdminListSkeleton,
  AdminPageHeader,
  AdminRow,
  AdminShell,
} from '@/components/admin';

function formatDate(value: string) {
  const d = new Date(value);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${month}월 ${day}일 ${hours}:${mins}`;
}

export default function AdminAuditPage() {
  const activityQ = useV1MyActivitySummary();
  const matchesQ = useV1MyMatches({ limit: 20 });
  const teamMatchesQ = useV1MyTeamMatches({ limit: 20 });

  const isLoading = matchesQ.isPending || teamMatchesQ.isPending;
  const activity = activityQ.data;

  type ActivityItem = {
    id: string;
    title: string;
    date: string;
    category: string;
    status: string;
  };

  const items: ActivityItem[] = [
    ...(matchesQ.data?.items ?? []).map((m) => ({
      id: m.id ?? m.matchId ?? '',
      title: m.title,
      date: m.startsAt,
      category: '매치',
      status: m.status,
    })),
    ...(teamMatchesQ.data?.items ?? []).map((m) => ({
      id: m.teamMatchId,
      title: m.title,
      date: m.startsAt,
      category: '팀매치',
      status: m.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <AdminShell activeTab="audit">
      <AdminPageHeader eyebrow="활동 내역" title="내 활동 기록" />

      {/* Summary cards */}
      {activity && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[13px] text-gray-500">총 활동</p>
            <p className="text-3xl font-bold tabular-nums mt-1 text-blue-500">
              {activity.totals.activityCount}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[13px] text-gray-500">팀</p>
            <p className="text-3xl font-bold tabular-nums mt-1 text-blue-500">
              {activity.totals.teamCount}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[13px] text-gray-500">매너점수</p>
            <p className="text-3xl font-bold tabular-nums mt-1 text-green-500">
              {activity.totals.mannerScore != null ? activity.totals.mannerScore.toFixed(1) : '-'}
            </p>
          </div>
        </div>
      )}

      {/* Activity list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-50">
          <span className="text-[16px] font-bold text-gray-900">활동 기록</span>
        </div>
        {isLoading ? (
          <AdminListSkeleton rows={8} />
        ) : items.length === 0 ? (
          <AdminEmpty
            icon="📋"
            title="활동 기록이 없어요"
            description="매치나 팀매치에 참여하면 여기에 기록이 남아요."
          />
        ) : (
          items.map((item) => (
            <AdminRow
              key={item.id}
              title={item.title}
              meta={formatDate(item.date)}
              badge={
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">
                    {item.category}
                  </span>
                  <AdminBadge status={item.status} />
                </div>
              }
              href={
                item.category === '매치'
                  ? `/matches/${item.id}`
                  : `/team-matches/${item.id}`
              }
            />
          ))
        )}
      </div>
    </AdminShell>
  );
}
