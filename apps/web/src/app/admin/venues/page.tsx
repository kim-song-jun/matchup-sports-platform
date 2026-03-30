'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, Plus, Building2, Pencil, MapPin } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAdminVenues } from '@/hooks/use-api';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import type { Venue } from '@/types/api';
import { sportLabel } from '@/lib/constants';

const venueTypeLabel: Record<string, string> = {
  futsal_court: '풋살장', basketball_court: '농구장', badminton_court: '배드민턴장',
  ice_rink: '아이스링크', gymnasium: '체육관',
};

export default function AdminVenuesPage() {
  const [search, setSearch] = useState('');
  const router = useRouter();

  const { data, isLoading } = useAdminVenues();

  const venues = Array.isArray(data) ? data : [];
  const filtered = search
    ? venues.filter((v: Venue) => v.name.toLowerCase().includes(search.toLowerCase()))
    : venues;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">시설 관리</h1>
          <p className="text-base text-gray-400 mt-1">등록된 시설을 관리하고 새 시설을 추가하세요</p>
        </div>
        <Link href="/admin/venues/new" className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 transition-colors">
          <Plus size={16} />
          시설 추가
        </Link>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '시설명으로 검색' }}
        count={filtered.length}
        countLabel="개의 시설"
        onDownload={() => {
          downloadCSV(
            filtered.map((v: Venue) => ({
              시설명: v.name,
              종류: venueTypeLabel[v.type] || v.type,
              주소: `${v.city} ${v.district}`,
              평점: v.rating > 0 ? v.rating.toFixed(1) : '-',
              리뷰수: v.reviewCount ?? 0,
              시간당가격: v.pricePerHour ? `${new Intl.NumberFormat('ko-KR').format(v.pricePerHour)}원` : '-',
            })),
            'venues',
          );
        }}
      />

      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">시설명</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">유형</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">종목</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">주소</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">평점</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">시간당</th>
              <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {isLoading ? Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td></tr>
            )) : filtered.map((v: Venue) => (
              <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" role="link" tabIndex={0} onClick={() => router.push(`/admin/venues/${v.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/admin/venues/${v.id}`); }}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                      <Building2 size={16} />
                    </div>
                    <p className="text-base font-medium text-gray-900 dark:text-white">{v.name}</p>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{venueTypeLabel[v.type] || v.type}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1 flex-wrap">
                    {v.sportTypes?.map((s: string) => (
                      <span key={s} className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-2xs text-gray-500 dark:text-gray-400">{sportLabel[s] || s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px]">{v.city} {v.district}</td>
                <td className="px-5 py-3.5">
                  {v.rating > 0 && (
                    <div className="flex items-center gap-1 text-sm">
                      <Star size={12} className="text-amber-400" fill="currentColor" />
                      <span className="text-gray-700 dark:text-gray-300">{v.rating.toFixed(1)}</span>
                      <span className="text-gray-300 dark:text-gray-500">({v.reviewCount})</span>
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-800 dark:text-gray-200 font-medium">
                  {v.pricePerHour ? `${new Intl.NumberFormat('ko-KR').format(v.pricePerHour)}원` : '-'}
                </td>
                <td className="px-5 py-3.5">
                  <Link
                    href={`/admin/venues/${v.id}`}
                    onClick={(e) => e.stopPropagation()}
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
                <td colSpan={7}>
                  <EmptyState
                    icon={MapPin}
                    title="등록된 시설이 없어요"
                    description="시설을 등록해서 사용자들이 찾을 수 있게 해보세요"
                    size="sm"
                    action={{ label: '시설 추가', href: '/admin/venues/new' }}
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
