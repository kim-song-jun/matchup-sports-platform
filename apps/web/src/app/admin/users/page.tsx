'use client';

import Link from 'next/link';
import { Star, Users, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useAdminUsers } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import type { UserProfile } from '@/types/api';

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useAdminUsers(search ? { search } : undefined);

  const users = data?.items ?? [];

  const handleDownload = () => {
    downloadCSV(
      users.map((u: UserProfile) => ({
        닉네임: u.nickname || '',
        이메일: u.email || '',
        매너점수: u.mannerScore?.toFixed(1) || '',
        경기수: u.totalMatches ?? 0,
        지역: u.locationCity || '',
        가입일: u.createdAt ? new Date(u.createdAt).toLocaleDateString('ko-KR') : '',
      })),
      'users',
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-gray-900">사용자 관리</h1>
        <p className="text-[14px] text-gray-400 mt-1">등록된 사용자를 관리하세요</p>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '닉네임으로 검색' }}
        count={users.length}
        countLabel="명"
        onDownload={handleDownload}
      />

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gray-100 animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-1.5" />
                  <div className="h-3 w-32 bg-gray-50 rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))
        ) : users.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-100 py-16 text-center">
            <Users size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-[14px] text-gray-400">아직 등록된 사용자가 없습니다</p>
          </div>
        ) : (
          users.map((u: UserProfile) => (
            <Link
              key={u.id}
              href={`/admin/users/${u.id}`}
              className="flex items-center justify-between rounded-xl bg-white border border-gray-100 p-4 hover:bg-gray-50 transition-colors"
            >
              {/* Left — avatar + info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-[13px] font-bold text-gray-500 shrink-0">
                  {u.nickname?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-medium text-gray-900 truncate">{u.nickname}</p>
                    <span className="flex items-center gap-0.5 text-[12px] text-amber-500 shrink-0">
                      <Star size={11} fill="currentColor" />
                      {u.mannerScore?.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] text-gray-400">{u.totalMatches}경기</span>
                    {u.locationCity && (
                      <span className="text-[12px] text-gray-400">{u.locationCity}</span>
                    )}
                    {u.sportTypes?.slice(0, 2).map((s: string) => (
                      <span key={s} className="text-[11px] text-gray-400">
                        {sportLabel[s] || s}
                      </span>
                    ))}
                    {u.createdAt && (
                      <span className="text-[11px] text-gray-300">
                        {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </div>
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
