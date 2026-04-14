'use client';

import { Users, CheckCircle2, XCircle, Star } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import {
  useTeamMatchApplications,
  useApproveTeamMatchApplication,
  useRejectTeamMatchApplication,
} from '@/hooks/use-api';
import type { TeamMatchApplication } from '@/types/api';

const appStatusMap: Record<string, { label: string; className: string }> = {
  pending: { label: '대기중', className: 'bg-amber-50 text-amber-800' },
  approved: { label: '승인', className: 'bg-green-50 text-green-700' },
  rejected: { label: '거절', className: 'bg-red-50 text-red-600' },
};

interface ApplicationsSectionProps {
  matchId: string;
  isRecruiting: boolean;
}

export function ApplicationsSection({ matchId, isRecruiting }: ApplicationsSectionProps) {
  const { toast } = useToast();
  const { data: applications = [], isLoading } = useTeamMatchApplications(matchId);
  const approveMutation = useApproveTeamMatchApplication();
  const rejectMutation = useRejectTeamMatchApplication();

  function handleApprove(applicationId: string) {
    approveMutation.mutate(
      { matchId, applicationId },
      {
        onSuccess: () => toast('success', '신청을 승인했어요'),
        onError: () => toast('error', '승인에 실패했어요. 다시 시도해주세요'),
      },
    );
  }

  function handleReject(applicationId: string) {
    rejectMutation.mutate(
      { matchId, applicationId },
      {
        onSuccess: () => toast('success', '신청을 거절했어요'),
        onError: () => toast('error', '거절에 실패했어요. 다시 시도해주세요'),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
        <div className="h-5 w-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700 mb-3" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-50 dark:bg-gray-700" />
          ))}
        </div>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Users size={16} className="text-blue-500" />
          신청 현황
        </h2>
        <EmptyState
          icon={Users}
          title="아직 신청한 팀이 없어요"
          description={isRecruiting ? '상대 팀의 신청을 기다리고 있어요' : '신청이 마감되었어요'}
          size="sm"
        />
      </div>
    );
  }

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Users size={16} className="text-blue-500" />
        신청 현황
        <span className="ml-auto text-sm font-normal text-gray-500">{applications.length}팀</span>
      </h2>

      <div className="space-y-3">
        {applications.map((app: TeamMatchApplication) => {
          const appStatus = appStatusMap[app.status] ?? appStatusMap.pending;
          const team = app.applicantTeam;

          return (
            <div key={app.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300">
                    {(app.teamName ?? team?.name ?? '?').charAt(0)}
                  </div>
                  <div>
                    <span className="text-base font-semibold text-gray-900 dark:text-white">
                      {app.teamName ?? team?.name ?? '알 수 없는 팀'}
                    </span>
                    {team?.mannerScore != null && (
                      <div className="flex items-center gap-0.5 text-xs text-amber-500 mt-0.5">
                        <Star size={10} fill="currentColor" />
                        <span className="font-semibold">{team.mannerScore.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${appStatus.className}`}>
                  {appStatus.label}
                </span>
              </div>

              {app.message && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 pl-10 line-clamp-2">
                  {app.message}
                </p>
              )}

              {app.status === 'pending' && (
                <div className="flex gap-2 pl-10">
                  <button
                    onClick={() => handleApprove(app.id)}
                    disabled={isPending}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 py-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-40 min-h-[44px]"
                  >
                    <CheckCircle2 size={14} />
                    승인
                  </button>
                  <button
                    onClick={() => handleReject(app.id)}
                    disabled={isPending}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-gray-50 dark:bg-gray-700 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-40 min-h-[44px]"
                  >
                    <XCircle size={14} />
                    거절
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
