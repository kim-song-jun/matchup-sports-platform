'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, ChevronRight, MapPin, Shield, Star, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAdminTeam } from '@/hooks/use-api';
import { levelLabel, sportLabel } from '@/lib/constants';
import { formatAmount } from '@/lib/utils';
import type { AdminTeamMember } from '@/types/api';
import { getTeamMatchStatusMeta } from '@/lib/team-match-operations';

const roleLabel: Record<AdminTeamMember['role'], string> = {
  owner: '운영진',
  manager: '매니저',
  member: '멤버',
};

const roleColor: Record<AdminTeamMember['role'], string> = {
  owner: 'bg-blue-50 text-blue-500',
  manager: 'bg-gray-100 text-gray-600',
  member: 'bg-gray-100 text-gray-500',
};

export default function AdminTeamDetailPage() {
  const params = useParams();
  const teamId = params.id as string;
  const { data: team, isLoading, isError, refetch } = useAdminTeam(teamId);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="팀 상세를 불러오지 못했어요" onRetry={() => void refetch()} />;
  }

  if (!team) {
    return (
      <EmptyState
        icon={Users}
        title="팀을 찾을 수 없어요"
        description="삭제됐거나 존재하지 않는 팀이에요"
        action={{ label: '목록으로', href: '/admin/teams' }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/teams" className="transition-colors hover:text-gray-600 dark:hover:text-gray-300">팀 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">{team.name}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-500">
                    {sportLabel[team.sportType] || team.sportType}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                    {team.isRecruiting ? '모집중' : '모집마감'}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{team.name}</h1>
                {team.description ? (
                  <p className="mt-3 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{team.description}</p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">등록된 팀 소개가 없어요</p>
                )}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatCard label="팀 레벨" value={levelLabel[team.level] || String(team.level)} />
              <StatCard label="멤버 수" value={`${team.memberCount}명`} />
              <StatCard label="활동 지역" value={[team.city, team.district].filter(Boolean).join(' ') || '미등록'} />
              <StatCard label="생성일" value={team.createdAt ? new Date(team.createdAt).toLocaleDateString('ko-KR') : '-'} />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">멤버 ({team.members.length}명)</h2>
            {team.members.length === 0 ? (
              <EmptyState
                icon={Users}
                title="표시할 멤버가 없어요"
                description="실제 멤버가 연결되면 여기에 표시돼요"
                size="sm"
              />
            ) : (
              <div className="space-y-2">
                {team.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-700/50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-500 dark:bg-blue-900/30">
                        {member.nickname.charAt(0)}
                      </div>
                      <div>
                        <p className="text-base font-medium text-gray-900 dark:text-white">{member.nickname}</p>
                        <p className="text-xs text-gray-400">가입일 {new Date(member.joinedAt).toLocaleDateString('ko-KR')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.mannerScore != null ? (
                        <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <Star size={12} fill="currentColor" />
                          <span>{member.mannerScore.toFixed(1)}</span>
                        </div>
                      ) : null}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roleColor[member.role]}`}>
                        {roleLabel[member.role]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">최근 팀 매칭</h2>
            {team.recentTeamMatches.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="표시할 팀 매칭이 없어요"
                description="실제 팀 매칭이 연결되면 여기에 표시돼요"
                size="sm"
              />
            ) : (
              <div className="space-y-2">
                {team.recentTeamMatches.map((match) => {
                  const statusMeta = getTeamMatchStatusMeta(match.status);
                  return (
                    <div key={match.id} className="rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-700/50">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-medium text-gray-900 dark:text-white">{match.title}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            {new Date(match.matchDate).toLocaleDateString('ko-KR')} · {match.startTime} - {match.endTime}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} />
                          {match.venueName}
                        </span>
                        <span>{formatAmount(match.opponentFee || match.totalFee)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">운영자</h2>
            {team.owner ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-base font-bold text-blue-500 dark:bg-blue-900/30">
                  {team.owner.nickname.charAt(0)}
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{team.owner.nickname}</p>
                  <p className="text-xs text-gray-400">{team.owner.email ?? '이메일 미등록'}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">운영자 정보를 찾을 수 없어요</p>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">운영 메모</h2>
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-700/50 dark:text-gray-300">
              팀 상세는 실제 데이터만 보여주고, mock 기반 제재/배지 직접 액션은 제거된 상태예요.
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">관리자 안내</h2>
            <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-700/50 dark:text-gray-300">
              팀 검토 이후의 운영 판단은 계속 `/admin/*` 내부에서 이어지도록 유지해요.
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">운영 체크리스트</h2>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-start gap-2">
                <Calendar size={14} className="mt-0.5 text-gray-400" />
                <span>팀 정보와 최근 팀 매칭 상태가 실제 운영 기록과 일치하는지 확인</span>
              </div>
              <div className="flex items-start gap-2">
                <Users size={14} className="mt-0.5 text-gray-400" />
                <span>운영자/매니저/멤버 권한 구성이 과장 없이 보이는지 검토</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield size={14} className="mt-0.5 text-gray-400" />
                <span>운영 조치는 상세 화면과 분쟁/정산 화면을 함께 보고 판단</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3.5 dark:bg-gray-700/50">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-md font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
