'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, Plus } from 'lucide-react';

const sportLabel: Record<string, string> = { futsal: '풋살', basketball: '농구', badminton: '배드민턴', ice_hockey: '아이스하키' };

export default function AdminTeamsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: async () => { const res = await api.get('/admin/teams'); return (res as any).data; },
  });

  const teams = Array.isArray(data) ? data : [];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">팀 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">등록된 팀과 클럽을 관리하세요</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-600">
          <Plus size={16} /> 팀 등록
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase">팀명</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase">종목</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase">인원</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase">레벨</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase">지역</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase">모집</th>
              <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase">운영자</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? Array.from({length:2}).map((_,i) => (
              <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
            )) : teams.map((t: any) => (
              <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white text-[11px] font-black">{t.name.charAt(0)}</div>
                    <p className="text-[14px] font-medium text-gray-900">{t.name}</p>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{sportLabel[t.sportType] || t.sportType}</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{t.memberCount}명</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">Lv.{t.level}</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{t.city} {t.district}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.isRecruiting ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                    {t.isRecruiting ? '모집중' : '마감'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{t.owner?.nickname}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
