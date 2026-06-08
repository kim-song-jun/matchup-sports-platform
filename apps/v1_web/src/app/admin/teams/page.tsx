'use client';

import Link from 'next/link';
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

export default function AdminTeamsPage() {
  const { data: teamsData, isPending, isError, error, refetch } = useV1MyTeams();
  const teams = teamsData?.items ?? [];

  const managerTeam = teams.find(t => t.role === 'owner' || t.role === 'manager');
  const managerTeamId = managerTeam?.teamId ?? '';

  const { data: applicationsData, refetch: refetchApps } = useV1TeamJoinApplications(
    managerTeamId,
    { status: 'pending' },
    { enabled: Boolean(managerTeamId) },
  );
  const applications = applicationsData?.items ?? [];

  const approveMutation = useV1ApproveTeamJoinApplication(managerTeamId);
  const rejectMutation = useV1RejectTeamJoinApplication(managerTeamId);

  const handleApprove = async (applicationId: string) => {
    try {
      await approveMutation.mutateAsync({ applicationId });
      refetchApps();
    } catch (err) {
      alert(getErrorMessage(err, '수락 처리에 실패했어요.'));
    }
  };

  const handleReject = async (applicationId: string) => {
    try {
      await rejectMutation.mutateAsync({ applicationId });
      refetchApps();
    } catch (err) {
      alert(getErrorMessage(err, '거절 처리에 실패했어요.'));
    }
  };

  return (
    <AdminShell activeTab="teams">
      <AdminPageHeader
        eyebrow="팀 운영"
        title="내 팀"
        description="내가 소속된 팀과 가입 신청을 관리하세요."
        action={
          <Link
            href="/teams/new"
            className="bg-blue-500 hover:bg-blue-600 text-white text-[14px] font-semibold rounded-xl px-4 h-10 inline-flex items-center transition-colors"
          >
            + 팀 만들기
          </Link>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <AdminKpiCard label="소속 팀" value={teams.length} />
        <AdminKpiCard
          label="관리 팀"
          value={teams.filter(t => t.role === 'owner' || t.role === 'manager').length}
          tone="positive"
        />
        <AdminKpiCard
          label="가입 신청"
          value={applications.length}
          tone={applications.length > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {/* Pending applications */}
      {applications.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm mb-4">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
            <span className="text-[16px] font-bold text-gray-900">가입 신청</span>
            <span className="bg-amber-50 text-amber-600 text-[11px] font-bold rounded-full px-2 py-0.5">
              {applications.length}건 대기
            </span>
          </div>
          {applications.map(app => (
            <div
              key={app.applicationId}
              className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0"
            >
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-gray-900">
                  {app.applicant.displayName}
                </div>
                <div className="text-[13px] text-gray-500">{managerTeam?.name} 가입 신청</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(app.applicationId)}
                  disabled={approveMutation.isPending}
                  className="bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold rounded-lg px-3 h-8 transition-colors disabled:opacity-50"
                >
                  수락
                </button>
                <button
                  onClick={() => handleReject(app.applicationId)}
                  disabled={rejectMutation.isPending}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[13px] font-medium rounded-lg px-3 h-8 transition-colors disabled:opacity-50"
                >
                  거절
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Teams list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <span className="text-[16px] font-bold text-gray-900">소속 팀 목록</span>
          <span className="text-[13px] text-gray-400">{teams.length}개</span>
        </div>
        {isPending ? (
          <AdminListSkeleton />
        ) : isError ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] text-gray-500 mb-3">
              {getErrorMessage(error, '팀 목록을 불러오지 못했어요.')}
            </p>
            <button
              onClick={() => refetch()}
              className="text-[14px] text-blue-500 font-medium hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : teams.length === 0 ? (
          <AdminEmpty
            icon="👥"
            title="소속된 팀이 없어요"
            description="새 팀을 만들거나 기존 팀에 가입해보세요."
            action={
              <Link href="/teams/new" className="text-[14px] text-blue-500 font-medium">
                팀 만들기
              </Link>
            }
          />
        ) : (
          teams.map(team => (
            <AdminRow
              key={team.teamId}
              title={team.name}
              meta={`${team.memberCount}명 · ${team.sport.name}`}
              badge={<AdminBadge status={team.role} />}
              actions={
                <Link
                  href={team.detailRoute}
                  className="text-[13px] text-blue-500 font-medium hover:underline whitespace-nowrap"
                >
                  팀 홈
                </Link>
              }
            />
          ))
        )}
      </div>
    </AdminShell>
  );
}
