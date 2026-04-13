'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Star, Trophy, Users, Shield, Calendar, TrendingUp, User } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useUserProfile } from '@/hooks/use-api';
import type { SportProfile } from '@/types/api';
import { sportLabel, levelLabel } from '@/lib/constants';

function getMannerLabel(score: number) {
  if (score >= 4.5) return { text: '최고', color: 'text-green-500 bg-green-50' };
  if (score >= 3.5) return { text: '좋음', color: 'text-blue-500 bg-blue-50' };
  if (score >= 2.5) return { text: '보통', color: 'text-gray-500 bg-gray-100' };
  return { text: '주의', color: 'text-red-500 bg-red-50' };
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const { data: user, isLoading } = useUserProfile(userId);

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-32 bg-gray-100 rounded-lg" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={User}
          title="사용자를 찾을 수 없어요"
          description="탈퇴했거나 존재하지 않는 사용자예요"
          action={{ label: '홈으로', href: '/home' }}
        />
      </div>
    );
  }

  const mannerInfo = getMannerLabel(user.mannerScore || 3);
  const sportProfiles = user.sportProfiles ?? [];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <MobileGlassHeader className="gap-3">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="glass-mobile-icon-button flex min-h-[44px] min-w-11 items-center justify-center rounded-xl">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">프로필</h1>
      </MobileGlassHeader>

      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
        <Link href="/home" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">홈</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">{user.nickname} 프로필</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl">
        {/* Profile header */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 @3xl:p-6 mb-3">
          <div className="flex items-center gap-4">
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-3xl font-black text-blue-500">
              {user.nickname?.charAt(0)}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{user.nickname}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${mannerInfo.color}`}>
                  매너 {mannerInfo.text}
                </span>
                {user.city && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">{user.city} {user.district}</span>
                )}
              </div>
            </div>
          </div>

          {user.bio && (
            <p className="mt-4 text-base text-gray-600 dark:text-gray-300 leading-relaxed">{user.bio}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Star size={16} className="text-amber-400" fill="currentColor" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{(user.mannerScore || 0).toFixed(1)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">매너점수</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Trophy size={16} className="text-gray-500 dark:text-gray-400" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{user.totalMatches || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">매치 참여</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Users size={16} className="text-gray-500 dark:text-gray-400" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{user.teamCount || 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">소속 팀</p>
          </div>
        </div>

        {/* Sport profiles */}
        {sportProfiles.length > 0 && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              <TrendingUp size={16} className="inline mr-1.5 text-gray-500 dark:text-gray-400" />
              종목별 프로필
            </h3>
            <div className="space-y-3">
              {sportProfiles.map((profile: SportProfile) => {
                const SportIcon = SportIconMap[profile.sportType];
                return (
                  <div key={profile.sportType} className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {SportIcon && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-gray-700 text-blue-500">
                            <SportIcon size={16} />
                          </div>
                        )}
                        <span className="text-base font-semibold text-gray-900 dark:text-white">{sportLabel[profile.sportType]}</span>
                      </div>
                      <span className="text-sm font-medium text-blue-500">
                        {levelLabel[profile.level]}
                      </span>
                    </div>
                    {/* Level bar */}
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                        style={{ width: `${(profile.level / 5) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {profile.matchCount > 0 && <span>매치 {profile.matchCount}회</span>}
                      {profile.position && <span>포지션: {profile.position}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manner score detail */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            <Shield size={16} className="inline mr-1.5 text-gray-500 dark:text-gray-400" />
            매너 정보
          </h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    (user.mannerScore || 0) >= 3.5 ? 'bg-green-500' : (user.mannerScore || 0) >= 2.5 ? 'bg-gray-400' : 'bg-red-500'
                  }`}
                  style={{ width: `${((user.mannerScore || 0) / 5) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-md font-bold text-gray-900 dark:text-white">{(user.mannerScore || 0).toFixed(1)} / 5.0</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">매너 점수는 매치 후 상대방의 평가를 기반으로 산정됩니다</p>
        </div>
      </div>

    </div>
  );
}
