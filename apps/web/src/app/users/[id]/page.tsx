'use client';

import { useParams, useRouter, notFound } from 'next/navigation';
import { ArrowLeft, Star, MessageCircle, Loader2 } from 'lucide-react';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toast';
import { sportCardAccent, sportLabel, levelLabel } from '@/lib/constants';
import { extractErrorMessage } from '@/lib/utils';
import { useUserPublicProfile, useStartDirectChat } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';

// Public profile page — no authentication required (per task §S3, §9.3)
// PII fields (email, phone, birthYear, realName) must NEVER be rendered here.
// Uses useUserPublicProfile which returns UserPublicProfile (PII-stripped type).
// Chat CTA: authenticated users start a direct chat; unauthenticated users are sent to login.
export default function UserPublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const { toast } = useToast();
  const { user } = useAuthStore();
  const startDirectChat = useStartDirectChat();

  const { data: profile, isLoading, isError, refetch } = useUserPublicProfile(userId);

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 pt-[var(--safe-area-top)]">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" aria-hidden="true" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {isLoading ? '프로필' : profile ? `${profile.nickname}의 프로필` : '사용자 프로필'}
        </h1>
      </header>

      <main id="main-content" className="max-w-lg mx-auto px-5 py-6 space-y-4">
        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <ErrorState
            message="프로필을 불러오지 못했어요"
            onRetry={() => void refetch()}
          />
        ) : !profile ? (
          notFound()
        ) : (
          <>
            {/* Identity card */}
            <section
              aria-label="사용자 기본 정보"
              className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5"
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                {profile.profileImageUrl ? (
                  <img
                    src={profile.profileImageUrl}
                    alt={`${profile.nickname} 프로필 사진`}
                    className="h-16 w-16 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl font-bold text-gray-500 dark:text-gray-400 shrink-0 select-none"
                    aria-hidden="true"
                  >
                    {profile.nickname.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                    {profile.nickname}
                  </h2>

                  {/* Manner score */}
                  {profile.mannerScore != null && (
                    <div className="flex items-center gap-1 mt-1">
                      <Star
                        size={14}
                        className="fill-amber-400 text-amber-400"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {profile.mannerScore.toFixed(1)}
                      </span>
                      <span className="text-xs text-gray-400">매너점수</span>
                    </div>
                  )}

                  {/* Recent match count — public aggregate from UserPublicProfile */}
                  {profile.recentMatchCount != null && profile.recentMatchCount > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      최근 경기 {profile.recentMatchCount}회
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Sport profiles */}
            {profile.sportProfiles && profile.sportProfiles.length > 0 && (
              <section
                aria-label="스포츠 프로필"
                className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5"
              >
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                  스포츠 프로필
                </h3>
                <div className="space-y-2">
                  {profile.sportProfiles.map((sp) => {
                    const accent = sportCardAccent[sp.sportType];
                    return (
                      <div
                        key={sp.id}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                          accent?.tint ?? 'bg-gray-50 dark:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                              accent?.badge ??
                              'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {sportLabel[sp.sportType] ?? sp.sportType}
                          </span>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            {levelLabel[sp.level] ?? `레벨 ${sp.level}`}
                          </span>
                        </div>

                        {/* Aggregate match count — public info, not individual match history */}
                        {sp.matchCount > 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {sp.matchCount}경기
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Chat CTA — authenticated users open chat directly; unauthenticated users are redirected to login */}
            <div className="pt-2 pb-6">
              <button
                type="button"
                disabled={startDirectChat.isPending}
                onClick={async () => {
                  if (!user) {
                    router.push(`/login?redirect=/users/${userId}`);
                    return;
                  }
                  try {
                    const room = await startDirectChat.mutateAsync({ withUserId: userId });
                    router.push(`/chat/${room.id}`);
                  } catch (err) {
                    toast('error', extractErrorMessage(err, '채팅 시작에 실패했어요'));
                  }
                }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 min-h-[52px] px-6 py-3 text-base font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
                aria-label={`${profile.nickname}에게 채팅 보내기`}
              >
                {startDirectChat.isPending ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <MessageCircle size={18} aria-hidden="true" />
                )}
                채팅 보내기
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-label="불러오는 중">
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-700 shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-6 w-36 rounded-lg bg-gray-100 dark:bg-gray-700" />
            <div className="h-4 w-24 rounded-lg bg-gray-100 dark:bg-gray-700" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-3">
        <div className="h-5 w-28 rounded-lg bg-gray-100 dark:bg-gray-700" />
        <div className="h-12 rounded-xl bg-gray-100 dark:bg-gray-700" />
        <div className="h-12 rounded-xl bg-gray-100 dark:bg-gray-700" />
      </div>
    </div>
  );
}

