'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Swords } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useMyTeamMatchApplications } from '@/hooks/use-api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { formatDateDot } from '@/lib/utils';

const appStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: '대기중', className: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' },
  approved: { label: '승인됨', className: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' },
  rejected: { label: '거절됨', className: 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400' },
  withdrawn: { label: '취소됨', className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

export default function MyTeamMatchApplicationsPage() {
  const router = useRouter();
  useRequireAuth();

  const { data: applications = [], isLoading } = useMyTeamMatchApplications();

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀매칭 신청</h1>
      </header>

      <div className="hidden @3xl:block px-5 @3xl:px-0 pt-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀매칭 신청</h2>
        <p className="text-base text-gray-500 mt-1">신청한 팀 매칭의 현황을 확인하세요</p>
      </div>

      <div className="px-5 @3xl:px-0 space-y-3 pb-8 mt-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-700" />
            ))}
          </div>
        ) : applications.length === 0 ? (
          <EmptyState
            icon={Swords}
            title="신청한 팀 매치가 없어요"
            description="팀 매치 목록에서 마음에 드는 상대팀을 찾아보세요"
            action={{ label: '팀 매칭 찾기', href: '/team-matches' }}
          />
        ) : (
          applications.map((app) => {
            const statusConf = appStatusConfig[app.status] ?? appStatusConfig.pending;
            const tm = app.teamMatch;

            // Deleted match — render a tombstone card rather than crashing on null access
            if (!tm) {
              return (
                <div key={app.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 opacity-60">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusConf.className}`}>
                      {statusConf.label}
                    </span>
                  </div>
                  <h3 className="text-md font-semibold text-gray-500 dark:text-gray-400">삭제된 매칭</h3>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">이 팀 매칭은 더 이상 존재하지 않아요</p>
                </div>
              );
            }

            return (
              <Link key={app.id} href={`/team-matches/${tm.id}`} className="block">
                <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-600 dark:hover:bg-gray-700 transition-colors active:scale-[0.995]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusConf.className}`}>
                      {statusConf.label}
                    </span>
                    {tm.hostTeam && (
                      <span className="text-xs text-gray-500 ml-auto flex items-center gap-1">
                        <Users size={11} aria-hidden="true" />
                        {tm.hostTeam?.name ?? '—'}
                      </span>
                    )}
                  </div>

                  <h3 className="text-md font-semibold text-gray-900 dark:text-white truncate">{tm.title}</h3>

                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Calendar size={12} aria-hidden="true" />
                      <span>{formatDateDot(tm.matchDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Clock size={12} aria-hidden="true" />
                      <span>{tm.startTime} ~ {tm.endTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin size={12} aria-hidden="true" />
                      <span>{tm.venueName}</span>
                    </div>
                  </div>

                  {app.message && (
                    <p className="mt-2.5 text-xs text-gray-400 dark:text-gray-500 line-clamp-1 italic">
                      내 메시지: {app.message}
                    </p>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
