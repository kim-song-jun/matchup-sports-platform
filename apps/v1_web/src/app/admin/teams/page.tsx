'use client';

import Link from 'next/link';
import { Users, Plus, UserCheck, Inbox } from 'lucide-react';
import {
  useV1MyTeams,
  useV1TeamJoinApplications,
  useV1ApproveTeamJoinApplication,
  useV1RejectTeamJoinApplication,
} from '@/hooks/use-v1-api';
import {
  AdminShell,
  AdminPageHeader,
  AdminKpiCard,
  AdminBadge,
  AdminRow,
  AdminEmpty,
  AdminListSkeleton,
} from '@/components/admin';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function roleLabel(role: string) {
  if (role === 'owner') return '팀장';
  if (role === 'manager') return '운영진';
  return '멤버';
}

// Sub-component: handles one team's join applications
// (hooks must be called per-component, NOT in a loop)
function TeamApplicationsSection({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { data, refetch } = useV1TeamJoinApplications(
    teamId,
    { status: 'pending' },
    { enabled: true },
  );
  const approveMutation = useV1ApproveTeamJoinApplication(teamId);
  const rejectMutation = useV1RejectTeamJoinApplication(teamId);
  const apps = data?.items ?? [];

  if (apps.length === 0) return null;

  const handleApprove = async (applicationId: string) => {
    try {
      await approveMutation.mutateAsync({ applicationId });
      void refetch();
    } catch (err) {
      alert(getErrorMessage(err, '수락 처리에 실패했어요.'));
    }
  };

  const handleReject = async (applicationId: string) => {
    try {
      await rejectMutation.mutateAsync({ applicationId });
      void refetch();
    } catch (err) {
      alert(getErrorMessage(err, '거절 처리에 실패했어요.'));
    }
  };

  return (
    <>
      <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className="text-[12px] font-semibold text-gray-500">{teamName}</span>
      </div>
      {apps.map((app) => (
        <div
          key={app.applicationId}
          className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 min-h-[56px]"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 truncate">
              {app.applicant.displayName}
            </p>
            <p className="text-[13px] text-gray-400 mt-0.5">{teamName} 가입 신청</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleApprove(app.applicationId)}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              className="bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-3.5 min-h-[44px] md:min-h-[36px] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              수락
            </button>
            <button
              type="button"
              onClick={() => void handleReject(app.applicationId)}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[13px] font-medium rounded-lg px-3.5 min-h-[44px] md:min-h-[36px] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              거절
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

// We pre-render up to N manager teams; React hooks require fixed call count at component level.
// Strategy: render fixed-size slots (up to 10), show nothing for unused slots.
function ApplicationsPanel({ managerTeams }: { managerTeams: { teamId: string; name: string }[] }) {
  // Render all at once — each TeamApplicationsSection self-hides if empty
  return (
    <>
      {managerTeams.map((t) => (
        <TeamApplicationsSection key={t.teamId} teamId={t.teamId} teamName={t.name} />
      ))}
    </>
  );
}

export default function AdminTeamsPage() {
  const { data: teamsData, isPending, isError, error, refetch } = useV1MyTeams();
  const teams = teamsData?.items ?? [];

  const managerTeams = teams.filter((t) => t.role === 'owner' || t.role === 'manager');

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="팀 운영"
        title="내 팀"
        description="소속 팀과 가입 신청을 관리하세요."
        action={
          <Link
            href="/teams/new"
            className="bg-blue-500 hover:bg-blue-600 text-white text-[14px] font-semibold rounded-xl px-4 h-10 inline-flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Plus size={15} aria-hidden="true" />
            팀 만들기
          </Link>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <AdminKpiCard label="소속 팀" value={teams.length} icon={<Users size={16} />} />
        <AdminKpiCard
          label="관리 중인 팀"
          value={managerTeams.length}
          icon={<UserCheck size={16} />}
          tone="positive"
        />
      </div>

      {/* Pending applications — only for manager/owner teams */}
      {!isPending && managerTeams.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 mb-4">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
            <UserCheck size={16} className="text-amber-500" aria-hidden="true" />
            <span className="text-[15px] font-bold text-gray-900">가입 신청</span>
            <span className="text-[12px] text-amber-600 font-medium ml-auto">관리자만 볼 수 있어요</span>
          </div>
          <ApplicationsPanel managerTeams={managerTeams} />
          {/* Fallback: shown if ApplicationsPanel renders nothing */}
          <div id="no-apps-fallback" className="hidden last:block px-5 py-8 text-center text-[14px] text-gray-400">
            대기 중인 가입 신청이 없어요.
          </div>
        </div>
      )}

      {/* Teams list */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-400" aria-hidden="true" />
            <span className="text-[15px] font-bold text-gray-900">소속 팀 목록</span>
          </div>
          <span className="text-[13px] text-gray-400">{teams.length}개</span>
        </div>

        {isPending ? (
          <AdminListSkeleton />
        ) : isError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[14px] text-gray-500 mb-3">
              {getErrorMessage(error, '팀 목록을 불러오지 못했어요.')}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-[14px] text-blue-500 font-medium"
            >
              다시 시도
            </button>
          </div>
        ) : teams.length === 0 ? (
          <AdminEmpty
            icon={<Inbox size={36} />}
            title="소속된 팀이 없어요"
            description="새 팀을 만들거나 기존 팀에 가입해보세요."
            action={
              <Link href="/teams/new" className="text-[14px] text-blue-500 font-medium">
                팀 만들기
              </Link>
            }
          />
        ) : (
          teams.map((team) => (
            <AdminRow
              key={team.teamId}
              title={team.name}
              meta={`${team.sport.name} · ${team.memberCount}명`}
              badge={<AdminBadge status={team.role} label={roleLabel(team.role)} />}
              actions={
                <Link
                  href={team.detailRoute}
                  className="text-[13px] text-blue-500 font-medium hover:text-blue-600 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
                >
                  팀 홈 →
                </Link>
              }
            />
          ))
        )}
      </div>
    </AdminShell>
  );
}
