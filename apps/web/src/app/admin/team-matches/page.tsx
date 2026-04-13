'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Swords } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { sportLabel } from '@/lib/constants';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { useTeamMatches } from '@/hooks/use-api';

const statusLabel: Record<string, string> = {
  recruiting: '모집중',
  approved: '매칭완료',
  matched: '매칭완료',
  completed: '경기완료',
  cancelled: '취소됨',
};

const statusColor: Record<string, string> = {
  recruiting: 'bg-blue-50 text-blue-500',
  approved: 'bg-green-50 text-green-600',
  matched: 'bg-green-50 text-green-600',
  completed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-500',
};

const teamMatchFilters = [
  { key: 'all', label: '전체' },
  { key: 'recruiting', label: '모집중' },
  { key: 'matched', label: '매칭완료' },
  { key: 'completed', label: '경기종료' },
  { key: 'cancelled', label: '취소' },
];

export default function AdminTeamMatchesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data, isLoading, isError, refetch } = useTeamMatches();

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((tm) => {
      const hostTeamName = tm.hostTeam?.name ?? '';
      const matchesSearch = !search ||
        tm.title.toLowerCase().includes(search.toLowerCase()) ||
        hostTeamName.toLowerCase().includes(search.toLowerCase()) ||
        tm.id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'matched' ? ['approved', 'matched'].includes(tm.status) : tm.status === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [data?.items, search, statusFilter]);

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((tm) => ({
        ID: tm.id,
        제목: tm.title,
        호스트팀: tm.hostTeam?.name ?? '-',
        종목: sportLabel[tm.sportType] || tm.sportType,
        날짜: tm.matchDate,
        상태: statusLabel[tm.status] || tm.status,
        신청수: tm.applicationCount ?? 0,
      })),
      '팀매칭'
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
        <Link href="/admin/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">관리자</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 dark:text-gray-300 font-medium">팀 매칭</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">팀 매칭 관리</h1>
          <p className="text-base text-gray-400 mt-1">관리자 셸 안에서 팀 간 모집글을 검토하세요</p>
        </div>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '제목 또는 팀명으로 검색' }}
        filters={teamMatchFilters}
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
        <ErrorState message="팀 매칭 목록을 불러오지 못했어요" onRetry={() => void refetch()} />
      ) : (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">ID</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">제목</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">호스트팀</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">종목</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">날짜</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">상태</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">신청수</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((tm) => (
                  <tr key={tm.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-mono text-gray-500 dark:text-gray-400">{tm.id}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-base font-medium text-gray-900 dark:text-white truncate max-w-[220px]">{tm.title}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{tm.hostTeam?.name ?? '-'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{sportLabel[tm.sportType] || tm.sportType}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{tm.matchDate}</td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${statusColor[tm.status] || 'bg-gray-100 text-gray-500'}`}>
                        {statusLabel[tm.status] || tm.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 text-center">{tm.applicationCount ?? 0}건</td>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/team-matches/${tm.id}`} className="flex items-center gap-1 text-sm font-medium text-blue-500 hover:text-blue-600 whitespace-nowrap">
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
                        icon={Swords}
                        title="검색 조건에 맞는 팀 매칭이 없어요"
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
