'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Pencil, Trash2, AlertTriangle, Eye, Plus, Swords } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api } from '@/lib/api';
import { useTeamMatches, useMyTeams, useMyTeamMatchApplications, queryKeys } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatDateDot } from '@/lib/utils';
import { getTeamMatchStatusMeta, TEAM_MATCH_HISTORY_STATUS_FILTER } from '@/lib/team-match-operations';

const appStatusConfig: Record<string, { label: string; style: string }> = {
  pending: { label: '대기중', style: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  approved: { label: '승인됨', style: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: '거절됨', style: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
  withdrawn: { label: '취소됨', style: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

type TabKey = 'hosted' | 'applied';

export default function MyTeamMatchesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  useRequireAuth();

  const initialTab = (searchParams.get('tab') as TabKey) || 'hosted';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: myTeams = [] } = useMyTeams();
  const myManagedTeamIds = new Set(
    myTeams.filter((team) => team.role === 'owner' || team.role === 'manager').map((team) => team.id),
  );

  const { data: apiData, isLoading: postsLoading } = useTeamMatches({ status: TEAM_MATCH_HISTORY_STATUS_FILTER });
  const { data: myApplications = [], isLoading: appsLoading } = useMyTeamMatchApplications();

  const posts = (apiData?.items ?? [])
    .filter((teamMatch) => myManagedTeamIds.has(teamMatch.hostTeamId))
    .map((teamMatch) => ({
      id: teamMatch.id,
      title: teamMatch.title,
      sportType: teamMatch.sportType,
      matchDate: teamMatch.matchDate,
      startTime: teamMatch.startTime,
      endTime: teamMatch.endTime,
      venue: teamMatch.venueName || '',
      teamName: teamMatch.hostTeam?.name || '',
      status: teamMatch.status,
      applicants: teamMatch.applicationCount ?? 0,
    }));

  const handleDelete = async (id: string) => {
    try {
      await api.patch(`/team-matches/${id}`, { status: 'cancelled' });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMatches.all });
      toast('success', '모집글을 취소했어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해 주세요');
    }
    setDeleteTarget(null);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'hosted', label: '내가 만든 매치' },
    { key: 'applied', label: '내가 신청한 매치' },
  ];

  return (
    <div className="animate-fade-in pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="@3xl:hidden flex items-center gap-3 border-b border-gray-50 px-5 py-3 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="-ml-2 flex min-h-[44px] min-w-11 items-center justify-center rounded-xl p-2 transition-[colors,transform] hover:bg-gray-100 active:scale-[0.98] dark:hover:bg-gray-700"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀 매칭</h1>
      </header>

      <div className="hidden @3xl:flex @3xl:items-center @3xl:justify-between mb-6 px-5 pt-4 @3xl:px-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀 매칭</h2>
          <p className="mt-1 text-base text-gray-500 dark:text-gray-400">팀 매칭 모집과 신청 현황을 관리해요</p>
        </div>
        {activeTab === 'hosted' && (
          <Link
            href="/team-matches/new"
            className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-base font-bold text-white transition-[colors,transform] hover:bg-blue-600 active:scale-[0.98]"
          >
            <Plus size={16} />
            모집글 작성
          </Link>
        )}
      </div>

      <div className="px-5 pb-1 pt-3 @3xl:px-0">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[44px] flex-1 rounded-lg py-2.5 text-base font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'hosted' && (
        <div className="mt-3 space-y-3 px-5 pb-8 @3xl:px-0">
          {postsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-40 animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-700" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState
              icon={Swords}
              title="팀 매칭 모집글이 없어요"
              description="새로운 모집글을 작성해 보세요"
              action={{ label: '모집글 작성', href: '/team-matches/new' }}
            />
          ) : (
            posts.map((post) => {
              const statusMeta = getTeamMatchStatusMeta(post.status);

              return (
                <div key={post.id} className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${sportCardAccent[post.sportType]?.badge ?? 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                      {sportLabel[post.sportType]}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">{post.teamName}</span>
                  </div>

                  <Link href={`/team-matches/${post.id}`}>
                    <h3 className="truncate text-md font-semibold text-gray-900 transition-colors hover:text-blue-500 dark:text-white">
                      {post.title}
                    </h3>
                  </Link>

                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Calendar size={12} aria-hidden="true" />
                      <span>{formatDateDot(post.matchDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Clock size={12} aria-hidden="true" />
                      <span>{post.startTime} ~ {post.endTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin size={12} aria-hidden="true" />
                      <span>{post.venue}</span>
                    </div>
                  </div>

                  {['recruiting', 'scheduled'].includes(post.status) && (
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/team-matches/${post.id}`}
                        aria-label={`${post.title} 신청현황 보기`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                      >
                        <Eye size={14} aria-hidden="true" />
                        신청현황
                        <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                          {post.applicants}
                        </span>
                      </Link>
                      <Link
                        href={`/team-matches/${post.id}/edit`}
                        aria-label={`${post.title} 수정`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      >
                        <Pencil size={14} aria-hidden="true" />
                        수정
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(post.id)}
                        aria-label={`${post.title} 취소`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        취소
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'applied' && (
        <div className="mt-3 space-y-3 px-5 pb-8 @3xl:px-0">
          {appsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-32 animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-700" />
              ))}
            </div>
          ) : myApplications.length === 0 ? (
            <EmptyState
              icon={Swords}
              title="신청한 팀 매칭이 없어요"
              description="팀 매칭 목록에서 마음에 드는 상대를 찾아보세요"
              action={{ label: '팀 매칭 찾기', href: '/team-matches' }}
            />
          ) : (
            myApplications.map((application) => {
              const applicationStatus = appStatusConfig[application.status] ?? appStatusConfig.pending;
              const teamMatchStatus = getTeamMatchStatusMeta(application.teamMatch.status);
              const teamMatch = application.teamMatch;

              return (
                <Link key={application.id} href={`/team-matches/${teamMatch.id}`} className="block">
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 transition-colors hover:border-gray-200 active:scale-[0.995] dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${applicationStatus.style}`}>
                        {applicationStatus.label}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${teamMatchStatus.className}`}>
                        {teamMatchStatus.label}
                      </span>
                      {teamMatch.hostTeam && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                          <Users size={11} aria-hidden="true" />
                          {teamMatch.hostTeam.name}
                        </span>
                      )}
                    </div>

                    <h3 className="truncate text-md font-semibold text-gray-900 dark:text-white">{teamMatch.title}</h3>

                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Calendar size={12} aria-hidden="true" />
                        <span>{formatDateDot(teamMatch.matchDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Clock size={12} aria-hidden="true" />
                        <span>{teamMatch.startTime} ~ {teamMatch.endTime}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <MapPin size={12} aria-hidden="true" />
                        <span>{teamMatch.venueName}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'hosted' && (
        <Link
          href="/team-matches/new"
          aria-label="모집글 작성"
          className="@3xl:hidden fixed bottom-[calc(var(--safe-area-bottom)+80px)] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 active:scale-95"
        >
          <Plus size={24} />
        </Link>
      )}

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="모집글 취소">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
          <AlertTriangle size={24} className="text-red-500 dark:text-red-400" aria-hidden="true" />
        </div>
        <h3 className="text-center text-lg font-bold text-gray-900 dark:text-white">모집글을 취소하시겠어요?</h3>
        <p className="mt-2 text-center text-base text-gray-500 dark:text-gray-400">
          취소하면 더 이상 상대 팀을 받을 수 없어요.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setDeleteTarget(null)}
            className="min-h-[44px] flex-1 rounded-xl bg-gray-100 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            돌아가기
          </button>
          <button
            onClick={() => deleteTarget && handleDelete(deleteTarget)}
            className="min-h-[44px] flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white transition-colors hover:bg-red-600"
          >
            취소하기
          </button>
        </div>
      </Modal>
    </div>
  );
}
