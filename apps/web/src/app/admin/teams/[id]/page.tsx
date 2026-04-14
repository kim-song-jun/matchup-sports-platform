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

const roleLabel: Record<AdminTeamMember['role'], string> = {
  owner: '운영자',
  manager: '매니저',
  member: '멤버',
};

const roleColor: Record<AdminTeamMember['role'], string> = {
  owner: 'bg-blue-50 text-blue-500',
  manager: 'bg-gray-100 text-gray-600',
  member: 'bg-gray-100 text-gray-500',
};

const statusLabel: Record<string, string> = {
  recruiting: '모집중',
  approved: '매칭완료',
  matched: '매칭완료',
  completed: '경기완료',
  cancelled: '취소됨',
};

export default function AdminTeamDetailPage() {
  const params = useParams();
  const teamId = params.id as string;
  const { data: team, isLoading, isError, refetch } = useAdminTeam(teamId);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
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
        description="삭제되었거나 존재하지 않는 팀이에요"
        action={{ label: '목록으로', href: '/admin/teams' }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/admin/teams" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">팀 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">{team.name}</span>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-500">
                    {sportLabel[team.sportType] || team.sportType}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                    {team.isRecruiting ? '모집중' : '모집마감'}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{team.name}</h1>
                {team.description ? (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{team.description}</p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">등록된 팀 소개가 없어요.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <StatCard label="팀 레벨" value={levelLabel[team.level] || String(team.level)} />
              <StatCard label="멤버 수" value={`${team.memberCount}명`} />
              <StatCard label="활동 지역" value={[team.city, team.district].filter(Boolean).join(' ') || '미등록'} />
              <StatCard label="생성일" value={team.createdAt ? new Date(team.createdAt).toLocaleDateString('ko-KR') : '-'} />
            </div>
          </section>

          <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">멤버 ({team.members.length}명)</h2>
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
                  <div key={member.id} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-xs font-bold text-blue-500">
                        {member.nickname.charAt(0)}
                      </div>
                      <div>
                        <p className="text-base font-medium text-gray-900 dark:text-white">{member.nickname}</p>
                        <p className="text-xs text-gray-400">가입 {new Date(member.joinedAt).toLocaleDateString('ko-KR')}</p>
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

          <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">최근 팀 매칭</h2>
            {team.recentTeamMatches.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="표시할 팀 매칭이 없어요"
                description="실제 팀 매칭이 생기면 여기에 표시돼요"
                size="sm"
              />
            ) : (
              <div className="space-y-2">
                {team.recentTeamMatches.map((match) => (
                  <div key={match.id} className="rounded-xl bg-gray-50 dark:bg-gray-700/50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-medium text-gray-900 dark:text-white">{match.title}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(match.matchDate).toLocaleDateString('ko-KR')} · {match.startTime} - {match.endTime}
                        </p>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                        {statusLabel[match.status] || match.status}
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
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">운영자</h2>
            {team.owner ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-base font-bold text-blue-500">
                  {team.owner.nickname.charAt(0)}
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{team.owner.nickname}</p>
                  <p className="text-xs text-gray-400">{team.owner.email ?? '이메일 미등록'}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">운영자 정보를 찾을 수 없어요.</p>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">운영 메모</h2>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4 text-sm text-gray-600 dark:text-gray-300">
              팀 상세는 실제 데이터만 보여주며, mock 기반 제재/배지 편집 액션은 제거했습니다.
            </div>
          </section>

          <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">관리자 셸 유지</h2>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4 text-sm text-gray-600 dark:text-gray-300">
              팀을 검토한 뒤에도 운영자는 계속 `/admin/*` 맥락 안에서 후속 화면으로 이동합니다.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-md font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
    </div>
  );
}
