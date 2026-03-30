'use client';

import { useState } from 'react';
import type { ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Pencil, Trash2, AlertTriangle, Eye, Plus, Info, Swords, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useTeamMatches } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

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
  recruiting: { text: '모집중', style: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' },
  matched: { text: '매칭완료', style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200' },
  cancelled: { text: '취소됨', style: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200' },
};

export default function MyTeamMatchesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: apiData } = useTeamMatches();
  const usingMock = !apiData?.items;
  const apiPosts = apiData?.items?.map((teamMatch) => ({
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
  const [localPosts, setLocalPosts] = useState(mockTeamMatches);
  const posts = apiPosts ?? localPosts;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Swords}
          title="로그인 후 팀 매칭 모집글을 관리할 수 있어요"
          description="팀 매칭 신청 현황과 운영 액션을 이 화면에서 빠르게 확인합니다."
          action={{ label: '로그인', href: '/login' }}
        />
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      await api.patch(`/team-matches/${id}`, { status: 'cancelled' });
      setLocalPosts((previous) => previous.map((post) => (post.id === id ? { ...post, status: 'cancelled' } : post)));
      toast('success', '모집글이 취소되었어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해주세요');
    }

    setDeleteTarget(null);
  };

  const summary = [
    { label: '운영 모집글', value: `${posts.length}건` },
    { label: '모집중', value: `${posts.filter((post) => post.status === 'recruiting').length}건` },
    { label: '누적 신청', value: `${posts.reduce((sum, post) => sum + post.applicants, 0)}건` },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <Swords size={14} />
                MatchUp Team Match Posts
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                팀 매칭 모집도 운영 대시보드처럼 봅니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                모집 상태, 신청 수, 일정 정보와 편집 액션을 한 카드에 묶어 관리 흐름을 단순화했습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.back()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <ArrowLeft size={14} />
                이전 화면
              </button>
              <Link
                href="/team-matches/new"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 dark:bg-white dark:text-slate-950"
              >
                <Plus size={14} />
                모집글 작성
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {usingMock && (
        <section className="px-5 @3xl:px-0 mt-4">
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-400/10 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <Info size={15} className="shrink-0" />
              API 연동 전 샘플 데이터가 표시되고 있습니다.
            </div>
          </div>
        </section>
      )}

      <section className="px-5 @3xl:px-0 mt-4 pb-8">
        {posts.length === 0 ? (
          <EmptyState
            icon={Swords}
            title="팀 매칭 모집글이 없어요"
            description="새로운 모집글을 작성해 팀을 위한 상대를 찾아보세요."
            action={{ label: '모집글 작성', href: '/team-matches/new' }}
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {posts.map((post) => {
              const status = statusLabel[post.status] || statusLabel.recruiting;
              return (
                <div key={post.id} className={`${softCard} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {sportLabel[post.sportType]}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.style}`}>
                        {status.text}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{post.teamName}</span>
                  </div>

                  <Link href={`/team-matches/${post.id}`}>
                    <h3 className="mt-3 text-base font-semibold text-slate-950 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-300">
                      {post.title}
                    </h3>
                  </Link>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <MatchInfo icon={Calendar} label="일정" value={post.matchDate} />
                    <MatchInfo icon={Clock} label="시간" value={`${post.startTime} ~ ${post.endTime}`} />
                    <MatchInfo icon={MapPin} label="장소" value={post.venue} />
                    <MatchInfo icon={Users} label="신청" value={`${post.applicants}팀`} />
                  </div>

                  {post.status !== 'cancelled' && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/team-matches/${post.id}`}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/15"
                      >
                        <Eye size={14} />
                        신청현황
                      </Link>
                      <Link
                        href={`/team-matches/${post.id}/edit`}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        <Pencil size={14} />
                        수정
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(post.id)}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
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
        )}
      </section>

      <Link
        href="/team-matches/new"
        aria-label="모집글 작성"
        className="@3xl:hidden fixed bottom-[calc(var(--safe-area-bottom)+80px)] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
      >
        <Plus size={22} />
      </Link>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-xl dark:bg-slate-950">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-400/10">
              <AlertTriangle size={24} className="text-rose-500" />
            </div>
            <h3 className="text-center text-lg font-bold text-slate-950 dark:text-white">모집글을 취소하시겠어요?</h3>
            <p className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
              취소하면 신청한 팀들에게 알림이 발송되며, 이후 자동 매칭 흐름이 중단됩니다.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-full bg-slate-100 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                돌아가기
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 rounded-full bg-rose-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
              >
                취소하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        <Icon size={12} />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}
