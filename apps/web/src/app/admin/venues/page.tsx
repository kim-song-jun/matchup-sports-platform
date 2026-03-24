'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Star, Plus, Building2, Pencil } from 'lucide-react';
import { useAdminVenues } from '@/hooks/use-api';
import type { Venue } from '@/types/api';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};

const venueTypeLabel: Record<string, string> = {
  futsal_court: '풋살장', basketball_court: '농구장', badminton_court: '배드민턴장',
  ice_rink: '아이스링크', gymnasium: '체육관',
};

export default function AdminVenuesPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useAdminVenues();

  const venues = Array.isArray(data) ? data : [];
  const filtered = search
    ? venues.filter((v: Venue) => v.name.toLowerCase().includes(search.toLowerCase()))
    : venues;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">시설 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">등록된 시설을 관리하고 새 시설을 추가하세요</p>
        </div>
        <Link href="/admin/venues/new" className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-600 transition-colors">
          <Plus size={16} />
          시설 추가
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="시설명으로 검색"
          className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-9 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all" />
      </div>

      {!isLoading && <p className="text-[13px] text-gray-400 mb-3">{filtered.length}개의 시설</p>}

      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">시설명</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">유형</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">종목</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">주소</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">평점</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">시간당</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
            )) : filtered.map((v: Venue) => (
              <tr key={v.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/admin/venues/${v.id}`}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                      <Building2 size={16} />
                    </div>
                    <p className="text-[14px] font-medium text-gray-900">{v.name}</p>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{venueTypeLabel[v.type] || v.type}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1 flex-wrap">
                    {v.sportTypes?.map((s: string) => (
                      <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{sportLabel[s] || s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600 truncate max-w-[200px]">{v.city} {v.district}</td>
                <td className="px-5 py-3.5">
                  {v.rating > 0 && (
                    <div className="flex items-center gap-1 text-[13px]">
                      <Star size={12} className="text-amber-400" fill="currentColor" />
                      <span className="text-gray-700">{v.rating.toFixed(1)}</span>
                      <span className="text-gray-300">({v.reviewCount})</span>
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-800 font-medium">
                  {v.pricePerHour ? `${new Intl.NumberFormat('ko-KR').format(v.pricePerHour)}원` : '-'}
                </td>
                <td className="px-5 py-3.5">
                  <Link
                    href={`/admin/venues/${v.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-blue-500 transition-colors"
                  >
                    <Pencil size={12} />
                    수정
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <Building2 size={24} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-[14px] text-gray-400">등록된 시설이 없어요</p>
                  <p className="text-[12px] text-gray-300 mt-1">시설을 등록해서 사용자들이 찾을 수 있게 해보세요</p>
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
