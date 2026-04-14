'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Trash2, UserPlus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toast';
import { sportLabel } from '@/lib/constants';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { useAdminMercenaryPosts, useDeleteAdminMercenaryPost } from '@/hooks/use-api';
import type { MercenaryPost } from '@/types/api';

const statusLabel: Record<string, string> = {
  open: '모집중',
  filled: '충원완료',
  closed: '마감',
  cancelled: '취소',
};

const statusColor: Record<string, string> = {
  open: 'bg-blue-50 text-blue-500',
  filled: 'bg-green-50 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-600',
};

const mercenaryFilters = [
  { key: 'all', label: '전체' },
  { key: 'open', label: '모집중' },
  { key: 'filled', label: '충원완료' },
  { key: 'closed', label: '마감' },
  { key: 'cancelled', label: '취소' },
];

export default function AdminMercenaryPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data = [], isLoading, isError, refetch } = useAdminMercenaryPosts();
  const deletePost = useDeleteAdminMercenaryPost();

  const filtered = useMemo(() => {
    return data.filter((post) => {
      const query = search.toLowerCase();
      const teamName = post.team?.name ?? '';
      const matchesSearch = !search
        || teamName.toLowerCase().includes(query)
        || post.id.toLowerCase().includes(query)
        || (post.position ?? '').toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || post.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data, search, statusFilter]);

  const handleDelete = async (id: string) => {
    try {
      await deletePost.mutateAsync(id);
      toast('success', '용병 모집글이 삭제되었어요');
    } catch (error) {
      const axiosErr = error as { response?: { data?: { message?: string } } };
      toast('error', axiosErr.response?.data?.message || '삭제하지 못했어요. 다시 시도해주세요');
    }
  };

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((post) => ({
        ID: post.id,
        팀명: post.team?.name ?? '-',
        종목: sportLabel[post.sportType] || post.sportType,
        포지션: post.position ?? '-',
        날짜: post.matchDate,
        지원수: post.applicationCount ?? 0,
        상태: statusLabel[post.status] ?? post.status,
      })),
      '용병모집',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
        <Link href="/admin/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">관리자</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 dark:text-gray-300 font-medium">용병</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">용병 관리</h1>
          <p className="text-base text-gray-400 mt-1">실제 등록된 모집글만 검토하고 삭제할 수 있습니다</p>
        </div>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '팀명, 포지션, ID 검색' }}
        filters={mercenaryFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        onDownload={handleDownloadCSV}
        count={filtered.length}
        countLabel="건"
      />

      {isLoading ? (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-gray-50 dark:bg-gray-700" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="용병 모집글을 불러오지 못했어요" onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
          <EmptyState
            icon={UserPlus}
            title="조건에 맞는 모집글이 없어요"
            description="실제 모집글이 등록되면 여기에 표시돼요"
            size="sm"
          />
        </div>
      ) : (
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
                {filtered.map((post: MercenaryPost) => (
                  <tr key={post.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-mono text-gray-500 dark:text-gray-400">{post.id}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 dark:bg-gray-600 text-white text-xs font-black">
                          {post.team?.name?.charAt(0) ?? '?'}
                        </div>
                        <span className="text-base font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {post.team?.name ?? '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {sportLabel[post.sportType] || post.sportType}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {post.position ?? '-'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {new Date(post.matchDate).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 text-center">
                      {post.applicationCount ?? 0}건
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${statusColor[post.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {statusLabel[post.status] ?? post.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => void handleDelete(post.id)}
                        disabled={deletePost.isPending}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
