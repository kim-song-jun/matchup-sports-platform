'use client';

import { useState } from 'react';
import { ArrowLeft, Star, Clock, Shield, CheckCircle, Sparkles, Trophy, Flame, Heart, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAllBadgeTypes } from '@/hooks/use-api';
import { formatDateCompact } from '@/lib/utils';
import { TrustSignalBanner } from '@/components/ui/trust-signal-banner';

interface BadgeInfo {
  id: string;
  type: string;
  name: string;
  description: string;
  requirement: string;
  icon: typeof Star;
  color: string;
  bg: string;
  earned: boolean;
  earnedAt?: string;
  progress?: string;
}

const allBadges: BadgeInfo[] = [
  {
    id: 'badge-1',
    type: 'manner_player',
    name: '매너 플레이어',
    description: '상대방을 존중하며 경기하는 선수',
    requirement: '매너 점수 4.5 이상',
    icon: Star,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    earned: true,
    earnedAt: '2026-02-15',
  },
  {
    id: 'badge-2',
    type: 'punctual',
    name: '시간 약속왕',
    description: '항상 정시에 도착하는 시간 약속의 달인',
    requirement: '지각률 0%',
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    earned: true,
    earnedAt: '2026-01-20',
  },
  {
    id: 'badge-3',
    type: 'referee_hero',
    name: '심판 영웅',
    description: '공정한 경기를 위해 심판을 자청하는 영웅',
    requirement: '심판 5회 이상',
    icon: Shield,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    earned: false,
    progress: '3/5',
  },
  {
    id: 'badge-4',
    type: 'honest_team',
    name: '정직한 팀',
    description: '등록한 팀 정보와 실제가 일치하는 믿을 수 있는 팀',
    requirement: '정보 일치도 95% 이상',
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-50',
    earned: true,
    earnedAt: '2026-03-01',
  },
  {
    id: 'badge-5',
    type: 'newcomer',
    name: '신규 팀',
    description: '플랫폼에 새롭게 합류한 팀',
    requirement: '팀 등록 완료',
    icon: Sparkles,
    color: 'text-gray-500',
    bg: 'bg-gray-100',
    earned: true,
    earnedAt: '2025-12-01',
  },
  {
    id: 'badge-6',
    type: 'veteran',
    name: '베테란',
    description: '풍부한 경험을 가진 베테랑 선수/팀',
    requirement: '50경기 이상',
    icon: Trophy,
    color: 'text-orange-500',
    bg: 'bg-orange-50',
    earned: false,
    progress: '32/50',
  },
  {
    id: 'badge-7',
    type: 'winning_streak',
    name: '연승 행진',
    description: '멈출 수 없는 승리의 행진',
    requirement: '5연승 이상',
    icon: Flame,
    color: 'text-red-500',
    bg: 'bg-red-50',
    earned: false,
    progress: '2/5',
  },
  {
    id: 'badge-8',
    type: 'fair_play',
    name: '페어플레이',
    description: '분쟁 없는 깨끗한 경기를 이어가는 스포츠맨',
    requirement: '무분쟁 20경기 이상',
    icon: Heart,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    earned: true,
    earnedAt: '2026-02-28',
  },
];

// 아이콘/색상 매핑 (API에서 제공하지 않는 UI 메타데이터)
const badgeVisualConfig: Record<string, { icon: typeof Star; color: string; bg: string }> = {
  manner_player: { icon: Star, color: 'text-amber-500', bg: 'bg-amber-50' },
  punctual: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50' },
  referee_hero: { icon: Shield, color: 'text-blue-500', bg: 'bg-blue-50' },
  honest_team: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
  newcomer: { icon: Sparkles, color: 'text-gray-500', bg: 'bg-gray-100' },
  veteran: { icon: Trophy, color: 'text-orange-500', bg: 'bg-orange-50' },
  winning_streak: { icon: Flame, color: 'text-red-500', bg: 'bg-red-50' },
  fair_play: { icon: Heart, color: 'text-rose-500', bg: 'bg-rose-50' },
};

const defaultVisual = { icon: Star, color: 'text-gray-500', bg: 'bg-gray-100' };

export default function BadgesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');
  const { data: apiBadges } = useAllBadgeTypes();
  const hasLiveCatalog = Boolean(apiBadges?.length);

  // API 뱃지가 있으면 로컬 UI 메타데이터와 병합, 없으면 목업 폴백
  const badges: BadgeInfo[] = apiBadges
    ? apiBadges.map((ab) => {
        const visual = badgeVisualConfig[ab.type] || defaultVisual;
        const local = allBadges.find((lb) => lb.type === ab.type);
        return {
          id: ab.id,
          type: ab.type,
          name: ab.name || local?.name || ab.type,
          description: ab.description || local?.description || '',
          requirement: local?.requirement || '',
          icon: visual.icon,
          color: visual.color,
          bg: visual.bg,
          earned: (ab as unknown as Record<string, unknown>).earned as boolean ?? local?.earned ?? false,
          earnedAt: (ab as unknown as Record<string, unknown>).earnedAt as string | undefined ?? local?.earnedAt,
          progress: local?.progress,
        };
      })
    : allBadges;

  const earnedBadges = badges.filter((b) => b.earned);
  const displayBadges = activeTab === 'my' ? earnedBadges : badges;

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Header */}
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center gap-3">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-[colors,transform] @3xl:hidden min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">뱃지</h1>
      </header>

      {/* Summary */}
      <div className="px-5 @3xl:px-0 mb-4">
        <div className="mb-4">
          <TrustSignalBanner
            tone={hasLiveCatalog ? 'info' : 'warning'}
            label={hasLiveCatalog ? '혼합 데이터' : '샘플 데이터'}
            title={hasLiveCatalog ? '뱃지 카탈로그만 실데이터로 연결되어 있어요' : '현재 뱃지 화면은 샘플 기반입니다'}
            description={hasLiveCatalog
              ? '뱃지 종류는 API에서 불러오지만, 획득 여부와 진행률 일부는 로컬 추정값을 사용합니다.'
              : '획득 여부와 진행률, 발급 일시는 UI 검증용 샘플이므로 실제 신뢰 지표로 사용하면 안 됩니다.'}
          />
        </div>
        <div className="rounded-xl bg-blue-500 p-5 text-white">
          <p className="text-sm text-blue-100">획득한 뱃지</p>
          <div className="flex items-end gap-1 mt-1">
            <span className="text-4xl font-black leading-none">{earnedBadges.length}</span>
            <span className="text-base text-blue-200 mb-0.5">/ {allBadges.length}</span>
          </div>
          <div className="mt-3 flex gap-1.5">
            {earnedBadges.map((badge, idx) => {
              const Icon = badge.icon;
              return (
                <div
                  key={badge.id || `earned-${idx}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-gray-800/20 backdrop-blur-sm"
                >
                  <Icon size={14} />
                </div>
              );
            })}
          </div>
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
          전체 뱃지 ({allBadges.length})
        </button>
      </div>

      {/* Badge grid */}
      <div className="px-5 @3xl:px-0">
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
                      badge.earned ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-300'
                    }`}
                  >
                    {badge.earned ? <Icon size={20} /> : <Lock size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-md font-semibold ${
                          badge.earned ? 'text-gray-900 dark:text-white' : 'text-gray-500'
                        }`}
                      >
                        {badge.name}
                      </h3>
                      {badge.earned && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-2xs font-semibold text-gray-500">
                          획득
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-0.5 ${badge.earned ? 'text-gray-500' : 'text-gray-500'}`}>
                      {badge.description}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">
                        {badge.requirement}
                      </span>
                      {badge.earned && badge.earnedAt ? (
                        <span className="text-xs text-gray-500">
                          {formatDateCompact(badge.earnedAt)} 획득
                        </span>
                      ) : badge.progress ? (
                        <span className="text-xs font-medium text-gray-500">
                          {badge.progress}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">미달성</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
