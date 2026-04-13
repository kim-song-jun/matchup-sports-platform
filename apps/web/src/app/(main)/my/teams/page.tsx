'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, MapPin, UserCog, Shield, Crown } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useMyTeams } from '@/hooks/use-api';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';

const teamRoleMeta = {
  owner: {
    label: '팀장',
    icon: Crown,
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  manager: {
    label: '운영자',
    icon: Shield,
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  member: {
    label: '멤버',
    icon: Users,
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  },
} as const;

export default function MyTeamsPage() {
  const router = useRouter();
  useRequireAuth();
  const { data: teams = [], isLoading } = useMyTeams();

  if (isLoading) {
    return <div className="px-5 pt-8 text-center text-gray-500 dark:text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀</h1>
      </header>
      <div className="hidden @3xl:block mb-6 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 팀</h2>
        <p className="text-base text-gray-500 dark:text-gray-400 mt-1">소속 팀과 현재 역할을 확인하세요</p>
      </div>

      <div className="px-5 @3xl:px-0 space-y-3 pb-8">
        {teams.length === 0 ? (
          <EmptyState
            icon={Users}
            title="소속된 팀이 없어요"
            description="팀을 만들거나 가입해보세요"
            action={{ label: '팀 만들기', href: '/teams/new' }}
          />
        ) : (
          teams.map((team) => (
            <div
              key={team.id}
              data-testid={`my-team-card-${team.id}`}
              className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {(team.sportTypes ?? [team.sportType]).slice(0, 2).map((st) => (
                      <span key={st} className={`rounded-md px-2 py-0.5 text-xs font-semibold ${sportCardAccent[st]?.badge ?? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500'}`}>
                        {sportLabel[st]}
                      </span>
                    ))}
                    <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      {levelLabel[team.level]}
                    </span>
                    <span
                      data-testid={`my-team-role-${team.id}`}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${teamRoleMeta[team.role].className}`}
                    >
                      {(() => {
                        const RoleIcon = teamRoleMeta[team.role].icon;
                        return <RoleIcon size={12} aria-hidden="true" />;
                      })()}
                      {teamRoleMeta[team.role].label}
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
                  href={`/teams/${team.id}`}
                  data-testid={`my-team-detail-${team.id}`}
                  aria-label={`${team.name} 상세`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-700 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  상세 보기
                </Link>
                <Link
                  href={`/teams/${team.id}/members`}
                  data-testid={`my-team-members-${team.id}`}
                  aria-label={`${team.name} ${team.role === 'member' ? '멤버 목록' : '멤버 관리'}`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <UserCog size={14} aria-hidden="true" />
                  {team.role === 'member' ? '멤버 목록' : '멤버 관리'}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
