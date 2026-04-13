'use client';

import Link from 'next/link';
import {
  BarChart3,
  Building2,
  Calendar,
  ChevronRight,
  DollarSign,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAdminStats, useAdminStatisticsOverview } from '@/hooks/use-api';
import { formatAmount } from '@/lib/utils';
import { sportLabel } from '@/lib/constants';

function formatCurrencyCompact(value: number) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
  return new Intl.NumberFormat('ko-KR').format(value);
}

export default function AdminStatisticsPage() {
  const statsQuery = useAdminStats();
  const overviewQuery = useAdminStatisticsOverview();

  if (statsQuery.isLoading || overviewQuery.isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="h-60 rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (statsQuery.isError || overviewQuery.isError || !statsQuery.data || !overviewQuery.data) {
    return <ErrorState message="통계 데이터를 불러오지 못했어요" onRetry={() => {
      void statsQuery.refetch();
      void overviewQuery.refetch();
    }} />;
  }

  const stats = statsQuery.data;
  const overview = overviewQuery.data;
  const maxMatchCount = Math.max(...overview.matchTrend.map((item) => item.count), 1);
  const maxRevenue = Math.max(...overview.revenueTrend.map((item) => item.revenue), 1);
  const maxSportCount = Math.max(...overview.sportDistribution.map((item) => item.count), 1);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/admin/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">대시보드</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">통계</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">통계</h1>
          <p className="text-base text-gray-400 mt-1">mock 없이 실제 집계만 보여줍니다</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
          <Calendar size={14} />
          {overview.periodLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-4 mb-6">
        <MetricCard label="전체 사용자" value={overview.userGrowth.totalUsers.toLocaleString()} icon={Users} iconColor="bg-blue-50 text-blue-500" sub={`이번 달 +${overview.userGrowth.thisMonth}`} />
        <MetricCard label="활성 사용자" value={overview.userGrowth.activeUsers.toLocaleString()} icon={TrendingUp} iconColor="bg-green-50 text-green-500" sub={`성장률 ${overview.userGrowth.growthRate}%`} />
        <MetricCard label="총 매출" value={formatAmount(stats.totalRevenue)} icon={DollarSign} iconColor="bg-amber-50 text-amber-500" sub={`활성 팀 ${stats.activeTeams}`} />
        <MetricCard label="등록 팀" value={overview.userGrowth.teamCount.toLocaleString()} icon={Trophy} iconColor="bg-gray-100 text-gray-600" sub={`활성 상품 ${stats.activeListings}`} />
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6 mb-6">
        <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-blue-500" />
            <h2 className="text-md font-bold text-gray-900 dark:text-white">월별 매치 수</h2>
          </div>
          <div className="flex items-end gap-3 h-[200px]">
            {overview.matchTrend.map((item) => {
              const heightPercent = (item.count / maxMatchCount) * 100;
              return (
                <div key={item.month} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{item.count}</span>
                  <div
                    className="w-full rounded-t-lg bg-blue-500 transition-[height] duration-300 min-h-1"
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="text-xs text-gray-400 mt-2">{item.month}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-blue-500" />
            <h2 className="text-md font-bold text-gray-900 dark:text-white">월별 매출</h2>
          </div>
          <div className="flex items-end gap-3 h-[200px]">
            {overview.revenueTrend.map((item) => {
              const heightPercent = (item.revenue / maxRevenue) * 100;
              return (
                <div key={item.month} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {formatCurrencyCompact(item.revenue)}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-blue-500 transition-[height] duration-300 min-h-1"
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="text-xs text-gray-400 mt-2">{item.month}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
        <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={16} className="text-blue-500" />
            <h2 className="text-md font-bold text-gray-900 dark:text-white">종목별 매치 분포</h2>
          </div>
          {overview.sportDistribution.length === 0 ? (
            <EmptyState
              icon={Users}
              title="집계할 매치가 없어요"
              description="실제 매치가 누적되면 종목 분포가 표시돼요"
              size="sm"
            />
          ) : (
            <div className="space-y-3">
              {overview.sportDistribution.map((item) => (
                <div key={item.sport}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {sportLabel[item.sport] || item.sport}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.count}건</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                      style={{ width: `${(item.count / maxSportCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-blue-500" />
            <h2 className="text-md font-bold text-gray-900 dark:text-white">상위 시설</h2>
          </div>
          {overview.topVenues.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="집계할 시설이 없어요"
              description="실제 매치와 결제가 누적되면 여기에 표시돼요"
              size="sm"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">시설</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase text-right">매치</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase text-right">매출</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase text-right">평점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {overview.topVenues.map((venue) => (
                    <tr key={`${venue.name}-${venue.city}`}>
                      <td className="px-3 py-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{venue.name}</p>
                        <p className="text-xs text-gray-400">{venue.city}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-gray-700 dark:text-gray-300">{venue.matches}</td>
                      <td className="px-3 py-3 text-right text-sm text-gray-700 dark:text-gray-300">{formatCurrencyCompact(venue.revenue)}</td>
                      <td className="px-3 py-3 text-right text-sm text-gray-700 dark:text-gray-300">{venue.rating.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Users;
  iconColor: string;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconColor}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-gray-400 mt-0.5">{label}</p>
      {sub ? <p className="text-xs text-blue-500 font-medium mt-1">{sub}</p> : null}
    </div>
  );
}
