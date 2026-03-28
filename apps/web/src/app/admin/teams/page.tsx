'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Plus, Pencil } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAdminTeams } from '@/hooks/use-api';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import type { SportTeam } from '@/types/api';
import { sportLabel } from '@/lib/constants';

export default function AdminTeamsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const { data, isLoading } = useAdminTeams();

  const teams = Array.isArray(data) ? data : [];
  const filtered = teams
    .filter((t: SportTeam) => {
      if (!search) return true;
      return t.name.toLowerCase().includes(search.toLowerCase());
    })
    .filter((t: SportTeam) => {
      if (filter === 'all') return true;
      if (filter === 'recruiting') return t.isRecruiting === true;
      if (filter === 'closed') return t.isRecruiting === false;
      return true;
    });

  const handleDownload = () => {
    downloadCSV(
      filtered.map((t: SportTeam) => ({
        팀명: t.name,
        종목: sportLabel[t.sportType] || t.sportType,
        인원: `${t.memberCount}명`,
        레벨: `Lv.${t.level}`,
        지역: `${t.city} ${t.district}`,
        모집상태: t.isRecruiting ? '모집중' : '마감',
      })),
      'teams',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">팀 관리</h1>
          <p className="text-base text-gray-400 mt-1">등록된 팀과 클럽을 관리하세요</p>
        </div>
        <Link href="/teams/new" className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600">
          <Plus size={16} /> 팀 등록
        </Link>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '팀명 검색' }}
        filters={[
          { key: 'all', label: '전체' },
          { key: 'recruiting', label: '모집중' },
          { key: 'closed', label: '모집마감' },
        ]}
        activeFilter={filter}
        onFilterChange={setFilter}
        count={filtered.length}
        countLabel="개 팀"
        onDownload={handleDownload}
      />

      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">팀명</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">종목</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">인원</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">레벨</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">지역</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">모집</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">운영자</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {isLoading ? Array.from({length:2}).map((_,i) => (
              <tr key={i}><td colSpan={8} className="px-5 py-4"><div className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td></tr>
            )) : filtered.map((t: SportTeam) => (
              <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 dark:bg-gray-600 text-white text-xs font-black">{t.name.charAt(0)}</div>
                    <p className="text-base font-medium text-gray-900 dark:text-white">{t.name}</p>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{sportLabel[t.sportType] || t.sportType}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{t.memberCount}명</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">Lv.{t.level}</td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{t.city} {t.district}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.isRecruiting ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {t.isRecruiting ? '모집중' : '마감'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{t.owner?.nickname}</td>
                <td className="px-5 py-3.5">
                  <Link
                    href={`/teams/${t.id}/edit`}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-blue-500 transition-colors"
                  >
                    <Pencil size={12} />
                    수정
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    icon={Users}
                    title="아직 등록된 팀이 없어요"
                    description="팀이 등록되면 여기에 표시돼요"
                    size="sm"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
