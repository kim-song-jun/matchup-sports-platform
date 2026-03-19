'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, Trophy, GraduationCap, Building2, ShoppingBag, TrendingUp, UserPlus, Zap } from 'lucide-react';

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await api.get('/admin/stats');
      return (res as any).data;
    },
  });

  const cards = [
    { label: '총 사용자', value: stats?.totalUsers ?? '-', icon: Users, color: 'text-blue-500 bg-blue-50', trend: stats?.todayNewUsers ? `+${stats.todayNewUsers} 오늘` : undefined },
    { label: '총 매치', value: stats?.totalMatches ?? '-', icon: Trophy, color: 'text-blue-500 bg-blue-50', trend: stats?.todayMatches ? `+${stats.todayMatches} 오늘` : undefined },
    { label: '총 강좌', value: stats?.totalLessons ?? '-', icon: GraduationCap, color: 'text-blue-500 bg-blue-50' },
    { label: '등록 팀', value: stats?.totalTeams ?? '-', icon: Zap, color: 'text-blue-500 bg-blue-50' },
    { label: '등록 시설', value: stats?.totalVenues ?? '-', icon: Building2, color: 'text-blue-500 bg-blue-50' },
    { label: '장터 매물', value: stats?.activeListings ?? '-', icon: ShoppingBag, color: 'text-blue-500 bg-blue-50' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-[24px] font-bold text-gray-900">대시보드</h1>
        <p className="text-[14px] text-gray-400 mt-1">MatchUp 플랫폼 현황을 한 눈에 확인하세요</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl bg-white border border-gray-100 p-5 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon size={20} />
              </div>
              {card.trend && (
                <span className="flex items-center gap-0.5 text-[12px] font-medium text-blue-500">
                  <TrendingUp size={12} />
                  {card.trend}
                </span>
              )}
            </div>
            <p className="text-[28px] font-bold text-gray-900">
              {isLoading ? <span className="inline-block w-12 h-8 bg-gray-100 rounded animate-pulse" /> : card.value}
            </p>
            <p className="text-[13px] text-gray-400 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl bg-white border border-gray-100 p-6">
        <h2 className="text-[16px] font-bold text-gray-900 mb-4">빠른 작업</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: '매치 관리', href: '/admin/matches', icon: Trophy, color: 'bg-blue-50 text-blue-500' },
            { label: '사용자 관리', href: '/admin/users', icon: Users, color: 'bg-blue-50 text-blue-500' },
            { label: '강좌 등록', href: '/admin/lessons', icon: GraduationCap, color: 'bg-blue-50 text-blue-500' },
            { label: '시설 관리', href: '/admin/venues', icon: Building2, color: 'bg-blue-50 text-blue-500' },
          ].map((action) => (
            <a key={action.label} href={action.href}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition-colors">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.color}`}>
                <action.icon size={20} />
              </div>
              <span className="text-[13px] font-medium text-gray-700">{action.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
