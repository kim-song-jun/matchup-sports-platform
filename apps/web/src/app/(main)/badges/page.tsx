'use client';

import { useState } from 'react';
import { ArrowLeft, Star, Clock, Shield, CheckCircle, Sparkles, Trophy, Flame, Heart, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAllBadgeTypes } from '@/hooks/use-api';
import { formatDateCompact } from '@/lib/utils';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

interface BadgeInfo {
  id: string;
  type: string;
  name: string;
  description: string;
  icon: typeof Star;
  color: string;
  bg: string;
  earned: boolean;
  earnedAt?: string;
}

// Icon/color/bg metadata — API does not provide these UI properties
const badgeVisualConfig: Record<string, { icon: typeof Star; color: string; bg: string }> = {
  manner_player: { icon: Star, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' },
  punctual: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  referee_hero: { icon: Shield, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30' },
  honest_team: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/30' },
  newcomer: { icon: Sparkles, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-700' },
  veteran: { icon: Trophy, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/30' },
  winning_streak: { icon: Flame, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/30' },
  fair_play: { icon: Heart, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/30' },
};

const defaultVisual = { icon: Star, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-700' };

export default function BadgesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');
  const { data: apiBadges, isLoading, isError, refetch } = useAllBadgeTypes();

  // Map API data to display format using visual config for icons/colors
  const badges: BadgeInfo[] = (apiBadges ?? []).map((ab) => {
    const visual = badgeVisualConfig[ab.type] ?? defaultVisual;
    return {
      id: ab.id,
      type: ab.type,
      name: ab.name || ab.type,
      description: ab.description || '',
      icon: visual.icon,
      color: visual.color,
      bg: visual.bg,
      earned: ab.earned ?? false,
      earnedAt: ab.earnedAt,
    };
  });

  const earnedBadges = badges.filter((b) => b.earned);
  const displayBadges = activeTab === 'my' ? earnedBadges : badges;

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-3 animate-pulse">
          <div className="h-8 w-24 rounded-lg bg-gray-100 dark:bg-gray-800" />
          <div className="h-32 rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <ErrorState message="뱃지 정보를 불러오지 못했어요" onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Header */}
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center gap-3">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-[colors,transform] @3xl:hidden min-w-11 min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">뱃지</h1>
      </header>

      {/* Summary */}
      <div className="px-5 @3xl:px-0 mb-4">
        <div className="rounded-xl bg-blue-500 p-5 text-white">
          <p className="text-sm text-blue-100">획득한 뱃지</p>
          <div className="flex items-end gap-1 mt-1">
            <span className="text-4xl font-black leading-none">{earnedBadges.length}</span>
            <span className="text-base text-blue-200 mb-0.5">/ {badges.length}</span>
          </div>
          {earnedBadges.length > 0 && (
            <div className="mt-3 flex gap-1.5">
              {earnedBadges.map((badge, idx) => {
                const Icon = badge.icon;
                return (
                  <div
                    key={badge.id || `earned-${idx}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-gray-800"
                  >
                    <Icon size={14} className={badge.color} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2">
        <button
          onClick={() => setActiveTab('my')}
          className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'my'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'
          }`}
        >
          내 뱃지 ({earnedBadges.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'all'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'
          }`}
        >
          전체 뱃지 ({badges.length})
        </button>
      </div>

      {/* Badge grid */}
      <div className="px-5 @3xl:px-0 pb-8">
        {displayBadges.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={activeTab === 'my' ? '아직 획득한 뱃지가 없어요' : '등록된 뱃지가 없어요'}
            description={activeTab === 'my' ? '경기에 참가하고 활동하면 뱃지를 획득할 수 있어요' : ''}
            size="sm"
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {displayBadges.map((badge, idx) => {
              const Icon = badge.icon;

              return (
                <div
                  key={badge.id || `badge-${idx}`}
                  className={`rounded-xl border p-4 transition-colors ${
                    badge.earned
                      ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                      : 'bg-gray-50/50 dark:bg-gray-800/50 border-gray-100/60 dark:border-gray-700/60'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        badge.earned ? `${badge.bg} ${badge.color}` : 'bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-600'
                      }`}
                    >
                      {badge.earned ? <Icon size={20} /> : <Lock size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`text-base font-semibold ${
                            badge.earned ? 'text-gray-900 dark:text-white' : 'text-gray-500'
                          }`}
                        >
                          {badge.name}
                        </h3>
                        {badge.earned && (
                          <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-2xs font-semibold text-gray-500 dark:text-gray-400">
                            획득
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-0.5 text-gray-500">
                        {badge.description}
                      </p>
                      <div className="flex items-center justify-end mt-2">
                        {badge.earned && badge.earnedAt ? (
                          <span className="text-xs text-gray-500">
                            {formatDateCompact(badge.earnedAt)} 획득
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">미달성</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
