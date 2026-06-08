'use client';

import { ClipboardList, Activity, TrendingUp, Award, History } from 'lucide-react';
import {
  useV1MyActivitySummary,
  useV1MyMatches,
  useV1MyTeamMatches,
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

function formatDateTime(dateStr: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export default function AdminAuditPage() {
  const activityQ = useV1MyActivitySummary();
  const matchesQ = useV1MyMatches({ limit: 30 });
  const teamMatchesQ = useV1MyTeamMatches({ limit: 30 });

  const isLoading = matchesQ.isPending || teamMatchesQ.isPending;
  const activity = activityQ.data;

  type ActivityItem = {
    id: string;
    title: string;
    date: string;
    category: '매치' | '팀매치';
    status: string;
  };

  const items: ActivityItem[] = [
    ...(matchesQ.data?.items ?? []).map((m) => ({
      id: (m as unknown as { id?: string; matchId?: string }).id ?? (m as unknown as { matchId?: string }).matchId ?? '',
      title: m.title,
      date: m.startsAt,
      category: '매치' as const,
      status: m.status,
    })),
    ...(teamMatchesQ.data?.items ?? []).map((m) => ({
      id: (m as unknown as { teamMatchId?: string }).teamMatchId ?? (m as unknown as { id?: string }).id ?? '',
      title: m.title,
      date: m.startsAt,
      category: '팀매치' as const,
      status: m.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="활동 내역"
        title="나의 활동 기록"
        description="매치와 팀매치 참여 기록을 확인하세요."
      />

      {activity && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <AdminKpiCard
              label="총 활동"
              value={activity.totals.activityCount}
              icon={<Activity size={16} />}
            />
            <AdminKpiCard
              label="팀 활동"
              value={activity.totals.teamCount}
              icon={<TrendingUp size={16} />}
              tone="positive"
            />
            <AdminKpiCard
              label="매너 점수"
              value={activity.totals.mannerScore != null ? activity.totals.mannerScore.toFixed(1) : '—'}
              icon={<Award size={16} />}
              tone="positive"
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={16} className="text-blue-500" />
              <span className="text-[14px] font-bold text-gray-900">이번 달 요약</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{activity.monthly.matchCount}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">매치 참여</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">
                  {activity.monthly.mannerScore != null ? activity.monthly.mannerScore.toFixed(1) : '—'}
                </p>
                <p className="text-[12px] text-gray-500 mt-0.5">매너 점수</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">
                  {activity.monthly.winRate != null ? `${Math.round(activity.monthly.winRate * 100)}%` : '—'}
                </p>
                <p className="text-[12px] text-gray-500 mt-0.5">승률</p>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
          <History size={16} className="text-gray-400" />
          <span className="text-[15px] font-bold text-gray-900">최근 활동</span>
          {!isLoading && items.length > 0 && (
            <span className="text-[12px] text-gray-400 ml-auto">{items.length}건</span>
          )}
        </div>
        {isLoading ? (
          <AdminListSkeleton rows={8} />
        ) : items.length === 0 ? (
          <AdminEmpty
            icon={<History size={36} />}
            title="활동 기록이 없어요"
            description="매치나 팀매치에 참여하면 여기에 기록이 남아요."
          />
        ) : (
          items.map((item) => (
            <AdminRow
              key={`${item.category}-${item.id}`}
              title={item.title}
              meta={formatDateTime(item.date)}
              leftIcon={<History size={15} />}
              badge={
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                      item.category === '팀매치' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {item.category}
                  </span>
                  <AdminBadge status={item.status} />
                </div>
              }
              href={item.category === '매치' ? `/matches/${item.id}` : `/team-matches/${item.id}`}
            />
          ))
        )}
      </div>
    </AdminShell>
  );
}
