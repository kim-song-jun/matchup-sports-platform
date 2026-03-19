'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, MapPin, MessageCircle, Plus } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

export default function TeamsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get('/teams');
      return (res as any).data;
    },
  });

  const teams = data?.items ?? data ?? [];

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0">
      <header className="flex items-center justify-between px-5 lg:px-0 pt-4 pb-3">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">팀·클럽</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">동호회와 팀을 찾아보세요</p>
        </div>
        <Link href="/teams/new" className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white">
          <Plus size={16} strokeWidth={2.5} />
          팀 등록
        </Link>
      </header>

      <div className="px-5 lg:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-[140px] animate-pulse rounded-2xl bg-gray-50" />)}
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Users size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">등록된 팀이 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">첫 번째 팀을 등록해보세요!</p>
          </div>
        ) : (
          <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {teams.map((team: any) => {
              const SportIcon = SportIconMap[team.sportType];
              return (
                <Link key={team.id} href={`/teams/${team.id}`} className="block rounded-2xl bg-white border border-gray-100 p-5 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-200">
                  <div className="flex items-start gap-4">
                    {/* Team logo */}
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-white text-[18px] font-black">
                      {team.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-[17px] font-bold text-gray-900">{team.name}</h3>
                        {team.isRecruiting && (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">모집중</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[13px] text-gray-400">
                        {SportIcon && <SportIcon size={14} />}
                        <span>{sportLabel[team.sportType]}</span>
                        <span className="text-gray-200">|</span>
                        <span>Lv.{team.level} {levelLabel[team.level]}</span>
                      </div>
                    </div>
                  </div>

                  {team.description && (
                    <p className="mt-3 text-[14px] text-gray-600 leading-relaxed">{team.description}</p>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[13px] text-gray-500">
                      <span className="flex items-center gap-1"><Users size={14} />{team.memberCount}명</span>
                      {team.city && <span className="flex items-center gap-1"><MapPin size={14} />{team.city} {team.district}</span>}
                    </div>
                    {team.contactInfo && (
                      <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                        <MessageCircle size={14} />
                        연락하기
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-[12px] text-gray-400">
                    <span>운영: {team.owner?.nickname}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <div className="h-8" />
    </div>
  );
}
