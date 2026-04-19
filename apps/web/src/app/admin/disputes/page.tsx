'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { useAdminDisputes } from '@/hooks/use-api';

// Admin disputes page — supports both legacy team-match disputes and
// new marketplace-sourced disputes. The Dispute union type from api.ts
// carries optional fields (reporterTeam/reportedTeam vs buyer/seller/orderId).
// Source column disambiguates in the table.

const disputeFilters = [
  { key: 'all', label: '전체' },
  { key: 'marketplace', label: '장터' },
  { key: 'team_match', label: '팀 매치' },
  { key: 'filed', label: '접수됨' },
  { key: 'seller_responded', label: '판매자 응답' },
  { key: 'admin_reviewing', label: '검토중' },
  { key: 'resolved_refund', label: '환불 완료' },
  { key: 'resolved_release', label: '지급 완료' },
  { key: 'dismissed', label: '기각됨' },
];

// Status label map — covers all DisputeStatus enum values + legacy statuses
const statusConfig: Record<string, { label: string; color: string }> = {
  filed: { label: '접수됨', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  seller_responded: { label: '판매자 응답', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  admin_reviewing: { label: '검토중', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  resolved_refund: { label: '환불 완료', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  resolved_release: { label: '지급 완료', color: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' },
  dismissed: { label: '기각됨', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  withdrawn: { label: '취하됨', color: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500' },
  // Legacy statuses (pre-Task-70 team-match disputes)
  pending: { label: '대기중', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  investigating: { label: '조사중', color: 'bg-blue-50 text-blue-500 dark:bg-blue-950/30 dark:text-blue-300' },
  resolved: { label: '해결됨', color: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' },
};

const typeConfig: Record<string, { label: string; color: string }> = {
  // Marketplace
  item_not_received: { label: '미수령', color: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' },
  item_not_as_described: { label: '상태 불일치', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  payment_issue: { label: '결제 문제', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  other: { label: '기타', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  // Legacy team-match
  no_show: { label: '노쇼', color: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' },
  late: { label: '지각', color: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400' },
  level_mismatch: { label: '실력 차이', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  misconduct: { label: '비매너', color: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' },
};

export default function AdminDisputesPage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const { data: disputesPage, isLoading, isError, refetch } = useAdminDisputes();
  // CursorPage<Dispute> stores the array in `.data`
  const disputes = disputesPage?.data ?? [];

  const filtered = useMemo(() => {
    return disputes.filter((dispute) => {
      // Source-based filter
      if (activeFilter === 'marketplace') {
        if (!dispute.orderId) return false;
      } else if (activeFilter === 'team_match') {
        if (!dispute.teamMatchId) return false;
      } else if (activeFilter !== 'all') {
        // Status-based filter
        if (dispute.status !== activeFilter) return false;
      }

      // Search across multiple fields
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        dispute.id.toLowerCase().includes(q) ||
        dispute.buyer?.nickname?.toLowerCase().includes(q) ||
        dispute.seller?.nickname?.toLowerCase().includes(q) ||
        dispute.description.toLowerCase().includes(q)
      );
    });
  }, [disputes, search, activeFilter]);

  const pendingCount = disputes.filter((d) => d.status === 'filed').length;
  const reviewingCount = disputes.filter((d) => d.status === 'admin_reviewing').length;

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((d) => ({
        ID: d.id,
        출처: d.orderId ? '장터' : '팀매치',
        신고인: d.buyer?.nickname ?? '-',
        피신고인: d.seller?.nickname ?? '-',
        유형: typeConfig[d.type]?.label ?? d.type,
        상태: statusConfig[d.status]?.label ?? d.status,
        신고일: d.createdAt,
      })),
      '신고분쟁',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">신고/분쟁 관리</h1>
          <p className="text-base text-gray-500 mt-1">팀 매치 및 장터 분쟁을 처리하세요</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <Clock size={13} aria-hidden="true" />
              접수 {pendingCount}건
            </span>
          )}
          {reviewingCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <AlertCircle size={13} aria-hidden="true" />
              검토중 {reviewingCount}건
            </span>
          )}
        </div>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '분쟁 ID, 사용자명, 신고 내용으로 검색', id: 'admin-disputes-search' }}
        filters={disputeFilters}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onDownload={handleDownloadCSV}
        count={filtered.length}
        countLabel="건"
      />

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`dispute-skeleton-${index}`} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="분쟁 목록을 불러오지 못했어요" onRetry={() => void refetch()} />
      ) : (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">출처</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">신고인</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">피신고인</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">유형</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">상태</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">신고일</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((dispute) => {
                  const sc = statusConfig[dispute.status] ?? { label: dispute.status, color: 'bg-gray-100 text-gray-500' };
                  const tc = typeConfig[dispute.type] ?? { label: dispute.type, color: 'bg-gray-100 text-gray-500' };
                  const isMarketplace = !!dispute.orderId;
                  const reporter = dispute.buyer?.nickname ?? '-';
                  const reported = dispute.seller?.nickname ?? '-';

                  return (
                    <tr key={dispute.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${isMarketplace ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                          {isMarketplace ? '장터' : '팀매치'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-base font-medium text-gray-900 dark:text-white whitespace-nowrap">{reporter}</td>
                      <td className="px-5 py-3.5 text-base font-medium text-gray-900 dark:text-white whitespace-nowrap">{reported}</td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${tc.color}`}>
                          {tc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${sc.color}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {new Date(dispute.createdAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/disputes/${dispute.id}`}
                          className="flex items-center gap-1 text-sm font-medium text-blue-500 hover:text-blue-600 whitespace-nowrap min-h-[44px]"
                        >
                          상세
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={AlertCircle}
                        title="검색 조건에 맞는 분쟁이 없어요"
                        description="다른 조건으로 다시 찾아보세요"
                        size="sm"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
