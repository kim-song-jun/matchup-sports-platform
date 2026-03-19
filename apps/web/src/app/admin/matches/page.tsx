'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const statusLabel: Record<string, string> = {
  recruiting: '모집중', full: '마감', in_progress: '진행중', completed: '완료', cancelled: '취소',
};

const statusColor: Record<string, string> = {
  recruiting: 'bg-emerald-50 text-emerald-600',
  full: 'bg-amber-50 text-amber-600',
  in_progress: 'bg-blue-50 text-blue-600',
  completed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-500',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function AdminMatchesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'matches'],
    queryFn: async () => {
      const res = await api.get('/admin/matches');
      return (res as any).data;
    },
  });

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
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">매치</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">종목</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">일시</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">인원</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">상태</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">호스트</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : matches.map((m: any) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
