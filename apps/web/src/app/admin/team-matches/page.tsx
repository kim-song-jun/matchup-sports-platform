'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Swords } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { sportLabel } from '@/lib/constants';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { useTeamMatches } from '@/hooks/use-api';
import { formatDateShort } from '@/lib/utils';
import { getTeamMatchStatusMeta, TEAM_MATCH_HISTORY_STATUS_FILTER } from '@/lib/team-match-operations';

const teamMatchFilters = [
  { key: 'all', label: '전체' },
  { key: 'recruiting', label: '모집중' },
  { key: 'scheduled', label: '경기예정' },
  { key: 'checking_in', label: '도착확인중' },
  { key: 'in_progress', label: '경기중' },
  { key: 'completed', label: '경기종료' },
  { key: 'cancelled', label: '취소' },
];

export default function AdminTeamMatchesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data, isLoading, isError, refetch } = useTeamMatches({ status: TEAM_MATCH_HISTORY_STATUS_FILTER });

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((teamMatch) => {
      const hostTeamName = teamMatch.hostTeam?.name ?? '';
      const matchesSearch = !search
        || teamMatch.title.toLowerCase().includes(search.toLowerCase())
        || hostTeamName.toLowerCase().includes(search.toLowerCase())
        || teamMatch.id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || teamMatch.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data?.items, search, statusFilter]);

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((teamMatch) => ({
        ID: teamMatch.id,
        제목: teamMatch.title,
        호스트팀: teamMatch.hostTeam?.name ?? '-',
        종목: sportLabel[teamMatch.sportType] || teamMatch.sportType,
        날짜: formatDateShort(teamMatch.matchDate),
        상태: getTeamMatchStatusMeta(teamMatch.status).label,
        신청수: teamMatch.applicationCount ?? 0,
      })),
      '팀매칭',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/admin/dashboard" className="transition-colors hover:text-gray-600 dark:hover:text-gray-300">관리자</Link>
        <ChevronRight size={12} />
        <span className="font-medium text-gray-700 dark:text-gray-300">팀 매칭</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">팀 매칭 관리</h1>
          <p className="mt-1 text-base text-gray-500">관리자 화면에서 팀 매칭 모집글을 검토해요</p>
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
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="팀 매칭 목록을 불러오지 못했어요" onRetry={() => void refetch()} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-300">ID</th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-300">제목</th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-300">호스트팀</th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-300">종목</th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-300">날짜</th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-300">상태</th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-300">신청수</th>
                  <th className="whitespace-nowrap px-5 py-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-300"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((teamMatch) => {
                  const statusMeta = getTeamMatchStatusMeta(teamMatch.status);
                  return (
                    <tr key={teamMatch.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-5 py-3.5 font-mono text-sm text-gray-500 dark:text-gray-400">{teamMatch.id}</td>
                      <td className="px-5 py-3.5">
                        <p className="max-w-[220px] truncate text-base font-medium text-gray-900 dark:text-white">{teamMatch.title}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{teamMatch.hostTeam?.name ?? '-'}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{sportLabel[teamMatch.sportType] || teamMatch.sportType}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{formatDateShort(teamMatch.matchDate)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center text-sm text-gray-600 dark:text-gray-300">{teamMatch.applicationCount ?? 0}건</td>
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/team-matches/${teamMatch.id}`} className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-blue-500 hover:text-blue-600">
                          상세
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
