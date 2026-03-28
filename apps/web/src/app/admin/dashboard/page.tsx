'use client';

import Link from 'next/link';
import { Users, Trophy, GraduationCap, Shield, type LucideIcon } from 'lucide-react';
import { useAdminStats } from '@/hooks/use-api';

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useAdminStats();

  return (
    <div>
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">안녕하세요, 관리자님</h1>
        <p className="text-sm text-gray-400 dark:text-gray-400 mt-1">오늘 플랫폼 현황을 확인하세요</p>
      </div>

      {/* 핵심 지표 — 토스 스타일 큰 숫자 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <MetricCard label="총 사용자" value={stats?.totalUsers} sub={stats?.todayNewUsers ? `오늘 +${stats.todayNewUsers}` : undefined} loading={isLoading} color="blue" icon={Users} />
        <MetricCard label="총 매치" value={stats?.totalMatches} sub={stats?.todayMatches ? `오늘 +${stats.todayMatches}` : undefined} loading={isLoading} color="green" icon={Trophy} />
        <MetricCard label="강좌" value={stats?.totalLessons} loading={isLoading} color="amber" icon={GraduationCap} />
        <MetricCard label="팀" value={stats?.totalTeams} loading={isLoading} color="purple" icon={Shield} />
      </div>

      {/* 주의 항목 */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">처리 필요</h2>
        <div className="space-y-2.5">
          <ActionItem label="미처리 분쟁" count={2} href="/admin/disputes" />
          <ActionItem label="정산 대기" count={3} href="/admin/settlements" />
          <ActionItem label="오늘 노쇼 신고" count={1} href="/admin/disputes" />
        </div>
      </section>

      {/* 빠른 이동 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">관리 메뉴</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: '매치 관리', href: '/admin/matches', desc: '매치 상태 관리' },
            { label: '사용자 관리', href: '/admin/users', desc: '회원 조회·검색' },
            { label: '결제 관리', href: '/admin/payments', desc: '결제·환불 처리' },
            { label: '시설 관리', href: '/admin/venues', desc: '시설 등록·수정' },
            { label: '강좌 관리', href: '/admin/lessons', desc: '강좌 상태 관리' },
            { label: '팀 관리', href: '/admin/teams', desc: '팀 조회·관리' },
            { label: '정산 관리', href: '/admin/settlements', desc: '정산 처리' },
            { label: '통계', href: '/admin/statistics', desc: '데이터 분석' },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}


const metricBorderColor = {
  blue: 'border-t-blue-400',
  green: 'border-t-green-400',
  amber: 'border-t-amber-400',
  purple: 'border-t-purple-400',
} as const;

const metricIconBg = {
  blue: 'bg-blue-50 dark:bg-blue-900/30',
  green: 'bg-green-50 dark:bg-green-900/30',
  amber: 'bg-amber-50 dark:bg-amber-900/30',
  purple: 'bg-purple-50 dark:bg-purple-900/30',
} as const;

const metricIconColor = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  amber: 'text-amber-400',
  purple: 'text-purple-400',
} as const;

function MetricCard({ label, value, sub, loading, color = 'blue', icon: Icon }: {
  label: string; value?: number; sub?: string; loading: boolean;
  color?: 'blue' | 'green' | 'amber' | 'purple';
  icon?: LucideIcon;
}) {
  return (
    <div className={`relative rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 border-t-2 ${metricBorderColor[color]} p-5`}>
      {Icon && (
        <div className={`absolute top-3 right-3 h-8 w-8 rounded-lg ${metricIconBg[color]} flex items-center justify-center`}>
          <Icon size={16} className={metricIconColor[color]} />
        </div>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-400 mb-1">{label}</p>
      {loading ? (
        <div className="h-8 w-16 bg-gray-50 dark:bg-gray-700 rounded skeleton-shimmer" />
      ) : (
        <p className="text-3xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">{value != null && value > 0 ? value.toLocaleString() : value === 0 ? '-' : '-'}</p>
      )}
      {sub && <p className="text-xs text-blue-500 font-medium mt-1">{sub}</p>}
    </div>
  );
}

function ActionItem({ label, count, href }: { label: string; count: number; href: string }) {
  return (
    <Link href={href}>
      <div className="flex items-center justify-between rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-sm font-bold text-gray-900 dark:text-white">{count}건</span>
      </div>
    </Link>
  );
}
