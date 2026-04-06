'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Pencil, Trash2, AlertTriangle, Eye, Plus, Info, Swords } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api } from '@/lib/api';
import { useTeamMatches, useMyTeamMatchApplications } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatDateDot } from '@/lib/utils';

const mockTeamMatches = [
  {
    id: 'tm-1',
    title: '주말 풋살 팀매치 모집',
    sportType: 'futsal',
    matchDate: '2026-04-05',
    startTime: '15:00',
    endTime: '17:00',
    venue: '잠실 풋살파크',
    teamName: 'FC 서울라이트',
    status: 'recruiting',
    applicants: 3,
  },
  {
    id: 'tm-2',
    title: '농구 3:3 팀전 상대 구합니다',
    sportType: 'basketball',
    matchDate: '2026-04-12',
    startTime: '19:00',
    endTime: '21:00',
    venue: '강남 실내체육관',
    teamName: '강남 슬래머즈',
    status: 'matched',
    applicants: 5,
  },
];

const statusLabel: Record<string, { text: string; style: string }> = {
  recruiting: { text: '모집중', style: 'bg-gray-100 text-gray-500' },
  matched: { text: '매칭완료', style: 'text-blue-500' },
  cancelled: { text: '취소됨', style: 'bg-red-50 text-red-500' },
};

const appStatusConfig: Record<string, { label: string; style: string }> = {
  pending: { label: '대기중', style: 'bg-blue-50 text-blue-600' },
  approved: { label: '승인됨', style: 'bg-green-50 text-green-600' },
  rejected: { label: '거절됨', style: 'bg-red-50 text-red-500' },
  withdrawn: { label: '취소됨', style: 'bg-gray-100 text-gray-500' },
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

  const { data: apiData } = useTeamMatches();
  const { data: myApplications = [], isLoading: appsLoading } = useMyTeamMatchApplications();

  const usingMock = !apiData?.items;
  const apiPosts = apiData?.items?.map((tm) => ({
    id: tm.id,
    title: tm.title,
    sportType: tm.sportType,
    matchDate: tm.matchDate,
    startTime: tm.startTime,
    endTime: tm.endTime,
    venue: tm.venueName || '',
    teamName: tm.hostTeam?.name || '',
    status: tm.status,
    applicants: tm.applicationCount ?? 0,
  }));
  const [localPosts, setLocalPosts] = useState(mockTeamMatches);
  const posts = apiPosts ?? localPosts;
  const setPosts = setLocalPosts;



  const handleDelete = async (id: string) => {
    try {
      await api.patch(`/team-matches/${id}`, { status: 'cancelled' });
      setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'cancelled' } : p));
      toast('success', '모집글이 취소되었어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'hosted', label: '내가 만든 매치' },
    { key: 'applied', label: '내가 신청한 매치' },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀 매칭</h1>
      </header>
      <div className="hidden @3xl:flex @3xl:items-center @3xl:justify-between mb-6 px-5 @3xl:px-0 pt-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀 매칭</h2>
          <p className="text-base text-gray-500 mt-1">팀 매칭 모집 및 신청 현황을 관리하세요</p>
        </div>
        {activeTab === 'hosted' && (
          <Link
            href="/team-matches/new"
            className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-base font-bold text-white hover:bg-blue-600 active:scale-[0.98] transition-[colors,transform]"
          >
            <Plus size={16} />
            모집글 작성
          </Link>
        )}
      </div>

      {/* Tab navigation */}
      <div className="px-5 @3xl:px-0 pt-3 pb-1">
        <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-700 p-1" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-lg py-2.5 text-base font-semibold transition-colors min-h-[44px] ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: 내가 만든 매치 */}
      {activeTab === 'hosted' && (
        <>
          {usingMock && (
            <div className="mx-5 @3xl:mx-0 mt-3 mb-1 flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-700 px-4 py-2.5">
              <Info size={16} className="text-gray-500 shrink-0" />
              <span className="text-sm text-gray-500">API 연동 전 샘플 데이터가 표시되고 있습니다</span>
            </div>
          )}

          <div className="px-5 @3xl:px-0 space-y-3 pb-8 mt-3">
            {posts.length === 0 ? (
              <EmptyState
                icon={Swords}
                title="팀 매칭 모집글이 없어요"
                description="새로운 모집글을 작성해보세요"
                action={{ label: '모집글 작성', href: '/team-matches/new' }}
              />
            ) : posts.map((post) => {
              const st = statusLabel[post.status] || statusLabel.recruiting;
              return (
                <div key={post.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500">
                      {sportLabel[post.sportType]}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${st.style}`}>
                      {st.text}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">{post.teamName}</span>
                  </div>

                  <Link href={`/team-matches/${post.id}`}>
                    <h3 className="text-md font-semibold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">{post.title}</h3>
                  </Link>

                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Calendar size={12} /><span>{post.matchDate}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Clock size={12} /><span>{post.startTime} ~ {post.endTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin size={12} /><span>{post.venue}</span>
                    </div>
                  </div>

                  {post.status !== 'cancelled' && (
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/team-matches/${post.id}`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <Eye size={14} />
                        신청현황
                        <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">{post.applicants}</span>
                      </Link>
                      <Link
                        href={`/team-matches/${post.id}/edit`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      >
                        <Pencil size={14} />
                        수정
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(post.id)}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={14} />
                        취소
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Tab: 내가 신청한 매치 */}
      {activeTab === 'applied' && (
        <div className="px-5 @3xl:px-0 space-y-3 pb-8 mt-3">
          {appsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-700" />
              ))}
            </div>
          ) : myApplications.length === 0 ? (
            <EmptyState
              icon={Swords}
              title="신청한 팀 매치가 없어요"
              description="팀 매치 목록에서 마음에 드는 상대팀을 찾아보세요"
              action={{ label: '팀 매칭 찾기', href: '/team-matches' }}
            />
          ) : (
            myApplications.map((app) => {
              const statusConf = appStatusConfig[app.status] ?? appStatusConfig.pending;
              const tm = app.teamMatch;
              return (
                <Link key={app.id} href={`/team-matches/${tm.id}`} className="block">
                  <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:border-gray-200 dark:hover:border-gray-600 transition-colors active:scale-[0.995]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusConf.style}`}>
                        {statusConf.label}
                      </span>
                      {tm.hostTeam && (
                        <span className="text-xs text-gray-500 ml-auto flex items-center gap-1">
                          <Users size={11} />
                          {tm.hostTeam.name}
                        </span>
                      )}
                    </div>

                    <h3 className="text-md font-semibold text-gray-900 dark:text-white truncate">{tm.title}</h3>

                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Calendar size={12} />
                        <span>{formatDateDot(tm.matchDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Clock size={12} />
                        <span>{tm.startTime} ~ {tm.endTime}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <MapPin size={12} />
                        <span>{tm.venueName}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {/* Mobile FAB (hosted tab only) */}
      {activeTab === 'hosted' && (
        <Link
          href="/team-matches/new"
          aria-label="모집글 작성"
          className="@3xl:hidden fixed bottom-[calc(var(--safe-area-bottom)+80px)] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 active:scale-95 transition-colors"
        >
          <Plus size={24} />
        </Link>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">모집글을 취소하시겠어요?</h3>
            <p className="text-base text-gray-500 text-center mt-2">취소하면 신청한 팀들에게 알림이 발송돼요.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">돌아가기</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors">취소하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
