'use client';

import Link from 'next/link';
import { Pencil, Trophy } from 'lucide-react';
import { useAdminMatches } from '@/hooks/use-api';
import type { Match } from '@/types/api';

const statusLabel: Record<string, string> = {
  recruiting: '모집중', full: '마감', in_progress: '진행중', completed: '완료', cancelled: '취소',
};

const statusColor: Record<string, string> = {
  recruiting: 'bg-blue-50 text-blue-500',
  full: 'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-50 text-blue-500',
  completed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-500',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function AdminMatchesPage() {
  const { data, isLoading } = useAdminMatches();

  const matches = data?.items ?? [];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">매치 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">전체 매치를 관리하세요</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">매치</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">종목</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">일시</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">인원</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">상태</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">호스트</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase tracking-wider">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : matches.map((m: Match) => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/admin/matches/${m.id}`}>
                <td className="px-5 py-3.5">
                  <p className="text-[14px] font-medium text-gray-900 truncate max-w-[200px]">{m.title?.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}</p>
                  <p className="text-[11px] text-gray-400">{m.venue?.name}</p>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{m.sportType}</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{formatDate(m.matchDate)} {m.startTime}</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{m.currentPlayers}/{m.maxPlayers}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor[m.status] || 'bg-gray-100'}`}>
                    {statusLabel[m.status] || m.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{m.host?.nickname}</td>
                <td className="px-5 py-3.5">
                  <Link
                    href={`/matches/${m.id}/edit`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-blue-500 transition-colors"
                  >
                    <Pencil size={12} />
                    수정
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && matches.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <Trophy size={24} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-[14px] text-gray-400">아직 등록된 매치가 없어요</p>
                  <p className="text-[12px] text-gray-300 mt-1">첫 번째 매치를 만들어보세요</p>
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
