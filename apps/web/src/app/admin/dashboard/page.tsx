'use client';

import { Users, Trophy, GraduationCap, Building2, ShoppingBag, TrendingUp, Zap, AlertTriangle } from 'lucide-react';
import { useAdminStats } from '@/hooks/use-api';

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useAdminStats();

  const primaryCards = [
    { label: '총 사용자', value: stats?.totalUsers ?? '-', icon: Users, color: 'text-blue-500 bg-blue-50', trend: stats?.todayNewUsers ? `+${stats.todayNewUsers} 오늘` : undefined },
    { label: '총 매치', value: stats?.totalMatches ?? '-', icon: Trophy, color: 'text-green-600 bg-green-50', trend: stats?.todayMatches ? `+${stats.todayMatches} 오늘` : undefined },
  ];

  const secondaryCards = [
    { label: '총 강좌', value: stats?.totalLessons ?? '-', icon: GraduationCap, color: 'text-amber-600 bg-amber-50' },
    { label: '등록 팀', value: stats?.totalTeams ?? '-', icon: Zap, color: 'text-violet-500 bg-violet-50' },
    { label: '등록 시설', value: stats?.totalVenues ?? '-', icon: Building2, color: 'text-cyan-600 bg-cyan-50' },
    { label: '장터 매물', value: stats?.activeListings ?? '-', icon: ShoppingBag, color: 'text-orange-500 bg-orange-50' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-[24px] font-bold text-gray-900">대시보드</h1>
        <p className="text-[14px] text-gray-400 mt-1">MatchUp 플랫폼 현황을 한 눈에 확인하세요</p>
      </div>

      {/* Primary stats — large */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {primaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl bg-white border border-gray-100 p-6 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon size={22} />
              </div>
              {card.trend && (
                <span className="flex items-center gap-0.5 text-[12px] font-medium text-blue-500">
                  <TrendingUp size={12} />
                  {card.trend}
                </span>
              )}
            </div>
            <p className="text-[34px] font-bold text-gray-900 leading-tight">
              {isLoading ? <span className="inline-block w-16 h-10 bg-gray-100 rounded animate-pulse" /> : card.value}
            </p>
            <p className="text-[14px] text-gray-400 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Secondary stats — compact row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {secondaryCards.map((card) => (
          <div key={card.label} className="rounded-xl bg-white border border-gray-100 p-3.5 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all">
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.color}`}>
                <card.icon size={16} />
              </div>
            </div>
            <p className="text-[20px] font-bold text-gray-900">
              {isLoading ? <span className="inline-block w-10 h-6 bg-gray-100 rounded animate-pulse" /> : card.value}
            </p>
            <p className="text-[12px] text-gray-400 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Attention needed */}
      <div className="rounded-2xl bg-red-50 border border-red-100 p-4 mt-4 mb-6">
        <h3 className="text-[14px] font-bold text-red-600 mb-2 flex items-center gap-1.5">
          <AlertTriangle size={15} />
          주의 필요
        </h3>
        <div className="space-y-1.5 text-[13px] text-red-500">
          <p>• 미처리 분쟁 2건</p>
          <p>• 정산 대기 3건</p>
          <p>• 오늘 노쇼 신고 1건</p>
        </div>
      </div>

      {/* Quick actions — compact button row */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: '매치 관리', href: '/admin/matches', icon: Trophy },
          { label: '사용자 관리', href: '/admin/users', icon: Users },
          { label: '강좌 등록', href: '/admin/lessons', icon: GraduationCap },
          { label: '시설 관리', href: '/admin/venues', icon: Building2 },
        ].map((action) => (
          <a key={action.label} href={action.href}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-4 py-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors">
            <action.icon size={16} className="text-gray-400" />
            {action.label}
          </a>
        ))}
      </div>
    </div>
  );
}
