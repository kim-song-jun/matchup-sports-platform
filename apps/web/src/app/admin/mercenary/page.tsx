'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, ChevronRight, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { sportLabel } from '@/lib/constants';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';

type MercenaryStatus = 'recruiting' | 'closed' | 'completed';

interface MercenaryPost {
  id: string;
  teamName: string;
  sportType: string;
  position: string;
  matchDate: string;
  applicationCount: number;
  status: MercenaryStatus;
}

const mockMercenaries: MercenaryPost[] = [
  {
    id: 'MRC-001',
    teamName: 'FC 강남유나이티드',
    sportType: 'futsal',
    position: '골키퍼',
    matchDate: '2026-03-28',
    applicationCount: 4,
    status: 'recruiting',
  },
  {
    id: 'MRC-002',
    teamName: '마포 킥커즈',
    sportType: 'soccer',
    position: '공격수',
    matchDate: '2026-03-29',
    applicationCount: 7,
    status: 'recruiting',
  },
  {
    id: 'MRC-003',
    teamName: '서초 FC',
    sportType: 'futsal',
    position: '수비수',
    matchDate: '2026-03-22',
    applicationCount: 2,
    status: 'closed',
  },
  {
    id: 'MRC-004',
    teamName: '용산 스트라이커즈',
    sportType: 'soccer',
    position: '미드필더',
    matchDate: '2026-03-15',
    applicationCount: 5,
    status: 'completed',
  },
  {
    id: 'MRC-005',
    teamName: '성동 유나이티드',
    sportType: 'futsal',
    position: '윙어',
    matchDate: '2026-03-30',
    applicationCount: 1,
    status: 'recruiting',
  },
];

const statusLabel: Record<MercenaryStatus, string> = {
  recruiting: '모집중', closed: '마감', completed: '완료',
};

const statusColor: Record<MercenaryStatus, string> = {
  recruiting: 'bg-blue-50 text-blue-500',
  closed: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-50 text-green-600',
};

const mercenaryFilters = [
  { key: 'all', label: '전체' },
  { key: 'recruiting', label: '모집중' },
  { key: 'closed', label: '마감' },
];

export default function AdminMercenaryPage() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<MercenaryPost[]>(mockMercenaries);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const handleDelete = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    toast('success', '용병 모집글이 삭제되었어요');
  };

  const filtered = posts.filter((m) => {
    const matchesSearch = !search ||
      m.teamName.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((m) => ({
        ID: m.id,
        팀명: m.teamName,
        종목: sportLabel[m.sportType] || m.sportType,
        포지션: m.position,
        날짜: m.matchDate,
        지원수: m.applicationCount,
        상태: statusLabel[m.status],
      })),
      '용병모집'
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
        <Link href="/admin/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">관리자</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 dark:text-gray-300 font-medium">용병</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">용병 관리</h1>
          <p className="text-base text-gray-400 mt-1">용병 모집글을 관리하세요</p>
        </div>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '팀명 또는 ID로 검색' }}
        filters={mercenaryFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        onDownload={handleDownloadCSV}
        count={filtered.length}
        countLabel="건"
      />

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">ID</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">팀명</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">종목</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">포지션</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">날짜</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">신청수</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">상태</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-mono text-gray-500 dark:text-gray-400">{m.id}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 dark:bg-gray-600 text-white text-xs font-black">
                        {m.teamName.charAt(0)}
                      </div>
                      <span className="text-base font-medium text-gray-900 dark:text-white whitespace-nowrap">{m.teamName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{sportLabel[m.sportType] || m.sportType}</td>
                  <td className="px-5 py-3.5">
                    <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {m.position}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{m.matchDate}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 text-center">{m.applicationCount}건</td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${statusColor[m.status]}`}>
                      {statusLabel[m.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={UserPlus}
                      title="아직 용병 모집글이 없어요"
                      description="용병 모집이 등록되면 여기에 표시돼요"
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
