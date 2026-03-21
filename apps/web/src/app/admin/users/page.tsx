'use client';

import { Star, Search } from 'lucide-react';
import { useState } from 'react';
import { useAdminUsers } from '@/hooks/use-api';
import type { UserProfile } from '@/types/api';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useAdminUsers(search ? { search } : undefined);

  const users = data?.items ?? [];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">사용자 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">등록된 사용자를 관리하세요</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="닉네임으로 검색"
          className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-9 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
        />
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">사용자</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">매너</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">경기</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">종목</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">지역</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">가입일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : users.map((u: UserProfile) => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/admin/users/${u.id}`}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-500">
                      {u.nickname?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-gray-900">{u.nickname}</p>
                      <p className="text-[11px] text-gray-400">{u.email || '-'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1 text-[13px] text-amber-500">
                    <Star size={12} fill="currentColor" />
                    {u.mannerScore?.toFixed(1)}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{u.totalMatches}경기</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1 flex-wrap">
                    {u.sportTypes?.slice(0, 2).map((s: string) => (
                      <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{u.locationCity || '-'}</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('ko-KR') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
