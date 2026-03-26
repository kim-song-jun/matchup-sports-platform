'use client';

import Link from 'next/link';
import { Trophy, ChevronRight, Users, Calendar } from 'lucide-react';
import { useState } from 'react';
import { useAdminMatches } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import type { Match } from '@/types/api';

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

const statusTextColor: Record<string, string> = {
  recruiting: 'text-blue-500',
  full: 'text-gray-400',
  in_progress: 'text-blue-500',
  completed: 'text-gray-400',
  cancelled: 'text-red-500',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

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
        일시: `${formatDate(m.matchDate)} ${m.startTime || ''}`,
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
        <h1 className="text-[22px] font-bold text-gray-900">매치 관리</h1>
        <p className="text-[14px] text-gray-400 mt-1">전체 매치를 관리하세요</p>
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
            <div key={i} className="rounded-xl bg-white border border-gray-100 p-4">
              <div className="h-4 w-3/5 bg-gray-100 rounded animate-pulse mb-2" />
              <div className="h-3 w-2/5 bg-gray-50 rounded animate-pulse" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-100 py-16 text-center">
            <Trophy size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-[14px] text-gray-400">아직 등록된 매치가 없어요</p>
            <p className="text-[12px] text-gray-300 mt-1">첫 번째 매치를 만들어보세요</p>
          </div>
        ) : (
          filtered.map((m: Match) => (
            <Link
              key={m.id}
              href={`/admin/matches/${m.id}`}
              className="flex items-center justify-between rounded-xl bg-white border border-gray-100 p-4 hover:bg-gray-50 transition-colors"
            >
              {/* Left — key info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] text-gray-400">
                    {sportLabel[m.sportType] || m.sportType}
                  </span>
                  <span className={`text-[12px] font-medium ${statusTextColor[m.status] || 'text-gray-400'}`}>
                    {statusLabel[m.status] || m.status}
                  </span>
                </div>
                <p className="text-[15px] font-medium text-gray-900 truncate">
                  {m.title?.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[12px] text-gray-400">
                    <Calendar size={12} className="text-gray-400" />
                    {formatDate(m.matchDate)} {m.startTime}
                  </span>
                  <span className="flex items-center gap-1 text-[12px] text-gray-400">
                    <Users size={12} className="text-gray-400" />
                    {m.currentPlayers}/{m.maxPlayers}명
                  </span>
                  {m.host?.nickname && (
                    <span className="text-[12px] text-gray-400">
                      {m.host.nickname}
                    </span>
                  )}
                </div>
              </div>

              {/* Right — chevron */}
              <ChevronRight size={16} className="text-gray-300 ml-3 shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
