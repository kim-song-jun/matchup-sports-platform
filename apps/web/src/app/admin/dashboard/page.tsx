'use client';

import Link from 'next/link';
import { GraduationCap, Shield, Trophy, Users, type LucideIcon } from 'lucide-react';
import { ErrorState } from '@/components/ui/error-state';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { useAdminDisputes, useAdminStats, useSettlementsSummary } from '@/hooks/use-api';

const adminDashboardDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export default function AdminDashboardPage() {
  const statsQuery = useAdminStats();
  const disputesQuery = useAdminDisputes();
  const settlementsSummaryQuery = useSettlementsSummary();

  const isLoading = statsQuery.isLoading || disputesQuery.isLoading || settlementsSummaryQuery.isLoading;

  if (statsQuery.isError || disputesQuery.isError || settlementsSummaryQuery.isError) {
    return (
      <ErrorState
        message="관리자 대시보드를 불러오지 못했어요"
        onRetry={() => {
          void statsQuery.refetch();
          void disputesQuery.refetch();
          void settlementsSummaryQuery.refetch();
        }}
      />
    );
  }

  const stats = statsQuery.data;
  // CursorPage<Dispute> — array is in `.data`
  const disputes = disputesQuery.data?.data ?? [];
  const settlementsSummary = settlementsSummaryQuery.data;
  const pendingDisputes = disputes.filter((dispute) => ['pending', 'investigating'].includes(dispute.status)).length;
  const todayKey = adminDashboardDateFormatter.format(new Date());
  const todayNoShowReports = disputes.filter((dispute) => {
    if (dispute.type !== 'no_show') return false;
    return adminDashboardDateFormatter.format(new Date(dispute.createdAt)) === todayKey;
  }).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">안녕하세요, 관리자님</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">실제 운영 데이터로 오늘 상태를 확인하세요</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <MetricCard label="총 사용자" value={stats?.totalUsers} sub={stats?.todayNewUsers ? `오늘 +${stats.todayNewUsers}` : undefined} loading={isLoading} icon={Users} />
        <MetricCard label="총 매치" value={stats?.totalMatches} sub={stats?.todayMatches ? `오늘 +${stats.todayMatches}` : undefined} loading={isLoading} icon={Trophy} />
        <MetricCard label="강좌" value={stats?.totalLessons} loading={isLoading} icon={GraduationCap} />
        <MetricCard label="팀" value={stats?.totalTeams} loading={isLoading} icon={Shield} />
      </div>

      <section className="mb-8">
        <SectionHeader title="처리 필요" showMore={false} className="mb-3" />
        <div className="space-y-2.5">
          <ActionItem label="미처리 분쟁" count={pendingDisputes} href="/admin/disputes" loading={isLoading} />
          <ActionItem label="정산 대기" count={settlementsSummary?.pendingCount ?? 0} href="/admin/settlements" loading={isLoading} />
          <ActionItem label="오늘 노쇼 신고" count={todayNoShowReports} href="/admin/disputes" loading={isLoading} />
        </div>
      </section>

      <section>
        <SectionHeader title="관리 메뉴" showMore={false} className="mb-3" />
        <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
          {[
            { label: '매치 관리', href: '/admin/matches', desc: '매치 상태 관리' },
            { label: '사용자 관리', href: '/admin/users', desc: '회원 조회·검색' },
            { label: '결제 관리', href: '/admin/payments', desc: '결제·환불 처리' },
            { label: '시설 관리', href: '/admin/venues', desc: '시설 등록·수정' },
            { label: '강좌 관리', href: '/admin/lessons', desc: '강좌 상태 관리' },
            { label: '팀 관리', href: '/admin/teams', desc: '팀 조회·관리' },
            { label: '정산 관리', href: '/admin/settlements', desc: '정산 처리' },
            { label: '통계', href: '/admin/statistics', desc: '실데이터 분석' },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card padding="sm" interactive className="h-full">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">{item.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, sub, loading, icon: Icon }: {
  label: string;
  value?: number;
  sub?: string;
  loading: boolean;
  icon?: LucideIcon;
}) {
  return (
    <Card className="relative">
      {Icon ? (
        <div className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
          <Icon size={18} className="text-blue-500 dark:text-blue-300" />
        </div>
      ) : null}
      <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{label}</p>
      {loading ? (
        <div className="h-8 w-16 bg-gray-50 dark:bg-gray-700 rounded skeleton-shimmer" />
      ) : (
        <p className="text-3xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
          {value != null ? value.toLocaleString() : '-'}
        </p>
      )}
      {sub ? <p className="text-xs text-blue-500 font-medium mt-1">{sub}</p> : null}
    </Card>
  );
}

function ActionItem({
  label,
  count,
  href,
  loading,
}: {
  label: string;
  count: number;
  href: string;
  loading: boolean;
}) {
  return (
    <Link href={href}>
      <Card padding="sm" interactive className="flex items-center justify-between">
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        {loading ? (
          <span className="h-5 w-12 rounded bg-gray-50 dark:bg-gray-700 skeleton-shimmer" aria-hidden="true" />
        ) : (
          <span className="text-sm font-bold text-gray-900 dark:text-white">{count}건</span>
        )}
      </Card>
    </Link>
  );
}
