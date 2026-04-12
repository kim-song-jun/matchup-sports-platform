'use client';

import Link from 'next/link';
import { Trophy, ChevronRight, Users, Calendar } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useState } from 'react';
import { useAdminMatches } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import type { Match } from '@/types/api';
import { formatDateShort } from '@/lib/utils';

const matchFilters = [
  { key: '', label: '전체' },
  { key: 'recruiting', label: '모집중' },
  { key: 'full', label: '마감' },
  { key: 'in_progress', label: '진행중' },
  { key: 'completed', label: '완료' },
  { key: 'cancelled', label: '취소' },
];

const statusLabel: Record<string, string> = {
  recruiting: '모집중', full: '마감', in_progress: '진행중', completed: '완료', cancelled: '취소',
};

const statusBadgeClass: Record<string, string> = {
  recruiting: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  full: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  in_progress: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  cancelled: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

export default function AdminMatchesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = useAdminMatches();

  const matches = data?.items ?? [];

  const filtered = matches.filter((m: Match) => {
    const matchesSearch = !search ||
      m.title?.toLowerCase().includes(search.toLowerCase()) ||
      m.host?.nickname?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDownload = () => {
    downloadCSV(
      filtered.map((m: Match) => ({
        제목: m.title || '',
        종목: sportLabel[m.sportType] || m.sportType,
        일시: `${formatDateShort(m.matchDate)} ${m.startTime || ''}`,
        인원: `${m.currentPlayers}/${m.maxPlayers}`,
        상태: statusLabel[m.status] || m.status,
        호스트: m.host?.nickname || '',
      })),
      'matches',
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">매치 관리</h1>
        <p className="text-base text-gray-400 mt-1">전체 매치를 관리하세요</p>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '매치명 또는 호스트 검색' }}
        filters={matchFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        count={filtered.length}
        countLabel="건의 매치"
        onDownload={handleDownload}
      />

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
              <div className="h-4 w-3/5 bg-gray-100 dark:bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-3 w-2/5 bg-gray-50 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
            <EmptyState
              icon={Trophy}
              title="아직 등록된 매치가 없어요"
              description="첫 번째 매치를 만들어보세요"
              size="sm"
            />
          </div>
        ) : (
          filtered.map((m: Match) => (
            <Link
              key={m.id}
              href={`/admin/matches/${m.id}`}
              className="flex items-center justify-between rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              {/* Left — key info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-400">
                    {sportLabel[m.sportType] || m.sportType}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${statusBadgeClass[m.status] || 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {statusLabel[m.status] || m.status}
                  </span>
                </div>
                <p className="text-md font-medium text-gray-900 dark:text-white truncate">
                  {m.title}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar size={12} className="text-gray-400" />
                    {formatDateShort(m.matchDate)} {m.startTime}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Users size={12} className="text-gray-400" />
                    {m.currentPlayers}/{m.maxPlayers}명
                  </span>
                  {m.host?.nickname && (
                    <span className="text-xs text-gray-400">
                      {m.host.nickname}
                    </span>
                  )}
                </div>
              </div>

              {/* Right — chevron */}
              <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 ml-3 shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
