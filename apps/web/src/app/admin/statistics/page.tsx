'use client';

import Link from 'next/link';
import {
  ChevronRight, TrendingUp, Users, Trophy, Building2,
  DollarSign, UserPlus, Calendar, BarChart3,
} from 'lucide-react';

// Mock data
const monthlyMatches = [
  { month: '10월', count: 124 },
  { month: '11월', count: 156 },
  { month: '12월', count: 98 },
  { month: '1월', count: 142 },
  { month: '2월', count: 178 },
  { month: '3월', count: 203 },
];

const sportDistribution = [
  { sport: '풋살', count: 482, color: 'bg-blue-500' },
  { sport: '농구', count: 318, color: 'bg-blue-500' },
  { sport: '배드민턴', count: 245, color: 'bg-blue-500' },
  { sport: '아이스하키', count: 89, color: 'bg-gray-200' },
  { sport: '피겨스케이팅', count: 52, color: 'bg-gray-200' },
  { sport: '쇼트트랙', count: 31, color: 'bg-gray-200' },
];

const revenueTrend = [
  { month: '10월', revenue: 12400000 },
  { month: '11월', revenue: 15600000 },
  { month: '12월', revenue: 9800000 },
  { month: '1월', revenue: 14200000 },
  { month: '2월', revenue: 17800000 },
  { month: '3월', revenue: 21500000 },
];

const userGrowth = {
  totalUsers: 8247,
  thisMonth: 512,
  lastMonth: 438,
  growthRate: 16.9,
  activeUsers: 3842,
  teamCount: 384,
};

const topVenues = [
  { name: '서울 풋살파크', city: '서울 강남', matches: 87, revenue: 6960000, rating: 4.8 },
  { name: '마포 실내체육관', city: '서울 마포', matches: 64, revenue: 3840000, rating: 4.5 },
  { name: '한강 농구코트', city: '서울 영등포', matches: 52, revenue: 2080000, rating: 4.3 },
  { name: '잠실 빙상센터', city: '서울 송파', matches: 38, revenue: 3800000, rating: 4.7 },
  { name: '강서 배드민턴장', city: '서울 강서', matches: 31, revenue: 1550000, rating: 4.2 },
];

function formatCurrencyCompact(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return new Intl.NumberFormat('ko-KR').format(n);
}

export default function AdminStatisticsPage() {
  const maxMatchCount = Math.max(...monthlyMatches.map((m) => m.count));
  const maxSportCount = Math.max(...sportDistribution.map((s) => s.count));
  const maxRevenue = Math.max(...revenueTrend.map((r) => r.revenue));

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/admin/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">대시보드</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">통계</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">통계</h1>
          <p className="text-base text-gray-400 mt-1">플랫폼 주요 지표를 확인하세요</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
          <Calendar size={14} />
          최근 6개월
        </div>
      </div>

      {/* User growth cards */}
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <Users size={20} />
            </div>
            <span className="flex items-center gap-0.5 text-xs font-medium text-green-500">
              <TrendingUp size={12} />
              +{userGrowth.growthRate}%
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{userGrowth.totalUsers.toLocaleString()}</p>
          <p className="text-sm text-gray-400 mt-0.5">전체 사용자</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <UserPlus size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{userGrowth.thisMonth}</p>
          <p className="text-sm text-gray-400 mt-0.5">이번 달 신규</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <Trophy size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{userGrowth.activeUsers.toLocaleString()}</p>
          <p className="text-sm text-gray-400 mt-0.5">활성 사용자</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <Users size={20} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{userGrowth.teamCount}</p>
          <p className="text-sm text-gray-400 mt-0.5">등록 팀</p>
        </div>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6 mb-6">
        {/* Monthly match count bar chart */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-blue-500" />
            <h3 className="text-md font-bold text-gray-900 dark:text-white">월별 매치 수</h3>
          </div>
          <div className="flex items-end gap-3 h-[200px]">
            {monthlyMatches.map((m) => {
              const heightPercent = (m.count / maxMatchCount) * 100;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{m.count}</span>
                  <div
                    className="w-full rounded-t-lg bg-blue-500 transition-[height] duration-300 min-h-1"
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="text-xs text-gray-400 mt-2">{m.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue trend bar chart */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-blue-500" />
            <h3 className="text-md font-bold text-gray-900 dark:text-white">매출 추이</h3>
          </div>
          <div className="flex items-end gap-3 h-[200px]">
            {revenueTrend.map((r) => {
              const heightPercent = (r.revenue / maxRevenue) * 100;
              return (
                <div key={r.month} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{formatCurrencyCompact(r.revenue)}</span>
                  <div
                    className="w-full rounded-t-lg bg-blue-500 transition-[height] duration-300 min-h-1"
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="text-xs text-gray-400 mt-2">{r.month}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
        {/* Sport distribution horizontal bars */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={16} className="text-blue-500" />
            <h3 className="text-md font-bold text-gray-900 dark:text-white">종목별 매치 분포</h3>
          </div>
          <div className="space-y-3">
            {sportDistribution.map((s) => {
              const widthPercent = (s.count / maxSportCount) * 100;
              return (
                <div key={s.sport}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.sport}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{s.count}건</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.color} transition-[width] duration-300`}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top venues table */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-blue-500" />
            <h3 className="text-md font-bold text-gray-900 dark:text-white">인기 시설 TOP 5</h3>
          </div>
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
                {topVenues.map((v, idx) => (
                  <tr key={v.name}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-5 w-5 items-center justify-center rounded text-2xs font-bold ${
                          idx === 0 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                          idx === 1 ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                          idx === 2 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                          'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{v.name}</p>
                          <p className="text-xs text-gray-400">{v.city}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-sm font-medium text-gray-700 dark:text-gray-300">{v.matches}건</td>
                    <td className="py-2.5 text-right text-sm font-medium text-gray-700 dark:text-gray-300">{formatCurrencyCompact(v.revenue)}원</td>
                    <td className="py-2.5 text-right text-sm font-semibold text-amber-500">{v.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
