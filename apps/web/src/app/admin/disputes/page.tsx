'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { useAdminDisputes } from '@/hooks/use-api';

const typeLabel: Record<string, string> = {
  no_show: '노쇼',
  late: '지각',
  level_mismatch: '실력 차이',
  misconduct: '비매너',
};

const typeColor: Record<string, string> = {
  no_show: 'bg-red-50 text-red-600',
  late: 'bg-amber-50 text-amber-600',
  level_mismatch: 'bg-gray-100 text-gray-600',
  misconduct: 'bg-red-50 text-red-500',
};

const statusLabel: Record<string, string> = {
  pending: '대기중',
  investigating: '조사중',
  resolved: '해결됨',
  dismissed: '기각됨',
};

const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  investigating: 'bg-blue-50 text-blue-500',
  resolved: 'bg-green-50 text-green-500',
  dismissed: 'bg-gray-100 text-gray-500',
};

const disputeFilters = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기중' },
  { key: 'investigating', label: '조사중' },
  { key: 'resolved', label: '해결됨' },
  { key: 'dismissed', label: '기각됨' },
];

export default function AdminDisputesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: disputes = [], isLoading, isError, refetch } = useAdminDisputes();

  const filtered = useMemo(() => {
    return disputes.filter((dispute) => {
      const matchesSearch = !search ||
        dispute.reporterTeam?.name?.toLowerCase().includes(search.toLowerCase()) ||
        dispute.reportedTeam?.name?.toLowerCase().includes(search.toLowerCase()) ||
        dispute.id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || dispute.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [disputes, search, statusFilter]);

  const pendingCount = disputes.filter((d) => d.status === 'pending').length;
  const investigatingCount = disputes.filter((d) => d.status === 'investigating').length;

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((dispute) => ({
        ID: dispute.id,
        신고팀: dispute.reporterTeam?.name ?? '-',
        피신고팀: dispute.reportedTeam?.name ?? '-',
        매치일: dispute.match?.date ?? '-',
        유형: typeLabel[dispute.type] ?? dispute.type,
        상태: statusLabel[dispute.status] ?? dispute.status,
        신고일: dispute.createdAt,
      })),
      '신고분쟁'
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">신고/분쟁 관리</h1>
          <p className="text-base text-gray-400 mt-1">실제 운영 로그와 함께 분쟁을 처리하세요</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <Clock size={14} />
              대기 {pendingCount}건
            </span>
          )}
          {investigatingCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <AlertCircle size={14} />
              조사중 {investigatingCount}건
            </span>
          )}
        </div>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '팀명 또는 ID로 검색' }}
        filters={disputeFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        onDownload={handleDownloadCSV}
        count={filtered.length}
        countLabel="건"
      />

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800" />
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
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">ID</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">신고팀</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">피신고팀</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">매치일</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">유형</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">상태</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">신고일</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((dispute) => (
                  <tr key={dispute.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-mono text-gray-500 dark:text-gray-400">{dispute.id}</td>
                    <td className="px-5 py-3.5 text-base font-medium text-gray-900 dark:text-white whitespace-nowrap">{dispute.reporterTeam?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 text-base font-medium text-gray-900 dark:text-white whitespace-nowrap">{dispute.reportedTeam?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{dispute.match?.date ?? '-'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${typeColor[dispute.type] || 'bg-gray-100 text-gray-500'}`}>
                        {typeLabel[dispute.type] ?? dispute.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${statusColor[dispute.status] || 'bg-gray-100 text-gray-500'}`}>
                        {statusLabel[dispute.status] ?? dispute.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {new Date(dispute.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/disputes/${dispute.id}`} className="flex items-center gap-1 text-sm font-medium text-blue-500 hover:text-blue-600 whitespace-nowrap">
                        상세
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        icon={AlertCircle}
                        title="검색 조건에 맞는 신고가 없어요"
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
