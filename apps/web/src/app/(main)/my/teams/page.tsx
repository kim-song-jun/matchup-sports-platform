'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, MapPin, Pencil, Trash2, AlertTriangle, UserCog } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api } from '@/lib/api';
import { useMyTeams, queryKeys } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';

export default function MyTeamsPage() {
  const router = useRouter();
  const { toast } = useToast();
  useRequireAuth();
  const queryClient = useQueryClient();
  const { data: teams = [], isLoading } = useMyTeams();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/teams/${id}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.me });
      toast('success', '팀이 삭제되었어요');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  if (isLoading) {
    return <div className="px-5 pt-8 text-center text-gray-500 dark:text-gray-400">로딩 중...</div>;
  }

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
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${sportCardAccent[team.sportType]?.badge ?? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500'}`}>
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
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{team.description}</p>

              <div className="mt-3 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Users size={12} aria-hidden="true" />
                  <span>{team.memberCount}명</span>
                </div>
                {(team.city || team.district) && (
                  <div className="flex items-center gap-1">
                    <MapPin size={12} aria-hidden="true" />
                    <span>{[team.city, team.district].filter(Boolean).join(' ')}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  href={`/teams/${team.id}/edit`}
                  aria-label={`${team.name} 수정`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-700 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <Pencil size={14} aria-hidden="true" />
                  수정
                </Link>
                <Link
                  href={`/teams/${team.id}/members`}
                  aria-label={`${team.name} 멤버 관리`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <UserCog size={14} aria-hidden="true" />
                  멤버관리
                </Link>
                <button
                  onClick={() => setDeleteTarget(team.id)}
                  aria-label={`${team.name} 삭제`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-900/30 py-2.5 text-sm font-semibold text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 mx-auto mb-4">
          <AlertTriangle size={24} className="text-red-500 dark:text-red-400" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">팀을 삭제하시겠어요?</h3>
        <p className="text-base text-gray-500 dark:text-gray-400 text-center mt-2">팀을 삭제하면 모든 멤버에게 알림이 발송돼요. 이 작업은 되돌릴 수 없어요.</p>
        <div className="mt-6 flex gap-3">
          <button onClick={() => setDeleteTarget(null)} className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">돌아가기</button>
          <button onClick={() => deleteTarget && handleDelete(deleteTarget)} className="flex-1 min-h-[44px] rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors">삭제하기</button>
        </div>
      </Modal>
    </div>
  );
}
