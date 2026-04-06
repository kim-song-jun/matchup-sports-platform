'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, MapPin, Pencil, Trash2, AlertTriangle, UserCog, Star, Trophy, Info } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api } from '@/lib/api';
import { useTeams } from '@/hooks/use-api';
import { sportLabel, levelLabel } from '@/lib/constants';

const mockMyTeams = [
  {
    id: 'team-1',
    name: 'FC 서울라이트',
    sportType: 'futsal',
    description: '서울 강남 지역 풋살 팀입니다. 주말마다 활동합니다.',
    memberCount: 12,
    maxMembers: 15,
    region: '서울 강남구',
    level: 3,
    mannerScore: 4.5,
    matchCount: 28,
    winCount: 18,
  },
  {
    id: 'team-2',
    name: '강남 슬래머즈',
    sportType: 'basketball',
    description: '농구 좋아하는 직장인 모임. 평일 저녁 위주로 활동.',
    memberCount: 8,
    maxMembers: 12,
    region: '서울 강남구',
    level: 2,
    mannerScore: 4.7,
    matchCount: 15,
    winCount: 10,
  },
];

export default function MyTeamsPage() {
  const router = useRouter();
  const { toast } = useToast();
  useRequireAuth();
  const { data: apiData } = useTeams();
  const usingMock = !apiData?.items;
  const apiTeams = apiData?.items?.map((t) => ({
    id: t.id,
    name: t.name,
    sportType: t.sportType,
    description: t.description || '',
    memberCount: t.memberCount,
    maxMembers: 15,
    region: [t.city, t.district].filter(Boolean).join(' ') || '',
    level: t.level,
    mannerScore: t.mannerScore ?? 0,
    matchCount: 0,
    winCount: 0,
  }));
  const [localTeams, setLocalTeams] = useState(mockMyTeams);
  const teams = apiTeams ?? localTeams;
  const setTeams = setLocalTeams;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteTarget) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeleteTarget(null); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteTarget]);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/teams/${id}`);
      setTeams(prev => prev.filter(t => t.id !== id));
      toast('success', '팀이 삭제되었어요');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀</h1>
      </header>
      <div className="hidden @3xl:block mb-6 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀</h2>
        <p className="text-base text-gray-500 dark:text-gray-400 mt-1">내가 운영하는 팀을 관리하세요</p>
      </div>

      {usingMock && (
        <div className="mx-5 @3xl:mx-0 mb-3 flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-2.5">
          <Info size={16} className="text-gray-500 dark:text-gray-400 shrink-0" />
          <span className="text-sm text-gray-500 dark:text-gray-400">API 연동 전 샘플 데이터가 표시되고 있습니다</span>
        </div>
      )}

      <div className="px-5 @3xl:px-0 space-y-3 pb-8">
        {teams.length === 0 ? (
          <EmptyState
            icon={Users}
            title="운영 중인 팀이 없어요"
            description="팀을 만들고 동료를 찾아보세요"
            action={{ label: '팀 만들기', href: '/teams/new' }}
          />
        ) : (
          teams.map((team) => (
            <div key={team.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-500">
                      {sportLabel[team.sportType]}
                    </span>
                    <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      {levelLabel[team.level]}
                    </span>
                  </div>
                  <Link href={`/teams/${team.id}`}>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">{team.name}</h3>
                  </Link>
                </div>
                <div className="flex items-center gap-0.5 text-amber-500">
                  <Star size={14} fill="currentColor" />
                  <span className="text-sm font-semibold">{team.mannerScore}</span>
                </div>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{team.description}</p>

              <div className="mt-3 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Users size={12} />
                  <span>{team.memberCount}/{team.maxMembers}명</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin size={12} />
                  <span>{team.region}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Trophy size={12} />
                  <span>{team.matchCount}전 {team.winCount}승</span>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  href={`/teams/${team.id}/edit`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-700 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <Pencil size={14} />
                  수정
                </Link>
                <Link
                  href={`/teams/${team.id}/members`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <UserCog size={14} />
                  멤버관리
                </Link>
                <button
                  onClick={() => setDeleteTarget(team.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-900/30 py-2.5 text-sm font-semibold text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5" onClick={() => setDeleteTarget(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="delete-team-modal-title" className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 id="delete-team-modal-title" className="text-lg font-bold text-gray-900 dark:text-white text-center">팀을 삭제하시겠어요?</h3>
            <p className="text-base text-gray-500 dark:text-gray-400 text-center mt-2">팀을 삭제하면 모든 멤버에게 알림이 발송돼요. 이 작업은 되돌릴 수 없어요.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">돌아가기</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors">삭제하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
