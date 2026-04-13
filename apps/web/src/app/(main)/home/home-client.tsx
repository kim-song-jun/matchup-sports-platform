'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMatches, useTeams, useLessons, useListings, useTeamMatches } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import {
  Plus, ArrowRight, Calendar, Swords, GraduationCap, UserPlus, MapPin,
  Search, Users, ShoppingBag, ChevronRight, Clock,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SafeImage } from '@/components/ui/safe-image';
import { SectionHeader } from '@/components/ui/section-header';
import { sportLabel, sportCardAccent, levelLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge } from '@/lib/utils';
import { getSportDetailImageSet, getTeamLogo, getListingImage } from '@/lib/sport-image';
import type { Match, SportTeam, Lesson, MarketplaceListing, TeamMatch } from '@/types/api';

const sportFilters = [
  'all', 'soccer', 'futsal', 'basketball', 'badminton',
  'ice_hockey', 'swimming', 'tennis',
] as const;

const banners = [
  {
    title: '팀 매칭 찾기',
    subtitle: 'AI가 우리 팀 실력에 맞는 상대를 추천해드려요',
    cta: '매칭 보기',
    href: '/team-matches',
    bg: 'bg-gradient-to-br from-blue-400 to-blue-600',
    dark: true,
  },
  {
    title: '첫 매치 무료',
    subtitle: '지금 가입하면 첫 참가비 0원으로 즐길 수 있어요',
    cta: '지금 시작',
    href: '/matches',
    bg: 'bg-gradient-to-br from-gray-700 to-gray-900',
    dark: true,
  },
  {
    title: '용병 구하기',
    subtitle: '팀 빈 자리를 용병으로 채워 완벽한 라인업을',
    cta: '용병 찾기',
    href: '/mercenary',
    bg: 'bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-700',
    dark: false,
  },
];

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

// Quick action grid items — always visible, answers "what does this app do?"
const quickActions = [
  {
    href: '/matches',
    icon: Search,
    label: '매치 찾기',
    desc: '오늘 바로 참가하세요',
  },
  {
    href: '/team-matches',
    icon: Users,
    label: '팀 매칭',
    desc: '상대팀을 AI로 추천',
  },
  {
    href: '/mercenary',
    icon: UserPlus,
    label: '용병 모집',
    desc: '빈 자리 채우기',
  },
  {
    href: '/marketplace',
    icon: ShoppingBag,
    label: '장터',
    desc: '장비 사고팔기',
  },
];

export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const canRenderAuthenticated = mounted && isAuthenticated;
  const t = useTranslations('home');
  const te = useTranslations('empty');
  const ts = useTranslations('sports');
  const tc = useTranslations('common');
  const tn = useTranslations('nav');
  const { data: matchData, isLoading } = useMatches();
  const { data: teamData } = useTeams({ limit: '6' });
  const { data: lessonData } = useLessons({ limit: '4' });
  const { data: listingData } = useListings({ limit: '4' });
  const { data: teamMatchData } = useTeamMatches({ limit: '3' });

  const allMatches = matchData?.items ?? [];
  const teams = teamData?.items ?? [];
  const lessons = lessonData?.items ?? [];
  const listings = listingData?.items ?? [];
  const teamMatches = teamMatchData?.items ?? [];

  const [activeSport, setActiveSport] = useState<string>('all');
  const [bannerIdx, setBannerIdx] = useState(0);

  const filteredMatches = useMemo(() =>
    activeSport === 'all' ? allMatches : allMatches.filter((m: Match) => m.sportType === activeSport),
  [allMatches, activeSport]);

  // Upcoming schedule: next 3 days, max 3 items
  const upcoming = useMemo(() =>
    allMatches.filter((m: Match) => {
      const diff = Math.ceil((new Date(m.matchDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 3;
    }).slice(0, 3),
  [allMatches]);

  // AI recommended matches: first 3 from allMatches (separate from filtered list).
  // These are always the top 3 regardless of sport filter. ZONE 2 list offsets by 3
  // when unfiltered so the same cards don't appear twice in a row.
  const recommendedMatches = useMemo(() => allMatches.slice(0, 3), [allMatches]);

  const handleSportClick = useCallback((type: string) => {
    setActiveSport(prev => prev === type ? 'all' : type);
  }, []);

  const [bannerPaused, setBannerPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  useEffect(() => {
    if (bannerPaused || prefersReducedMotion) return;
    const t = setInterval(() => setBannerIdx(i => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [bannerPaused, prefersReducedMotion]);

  // Today's date string for hero
  const todayLabel = useMemo(() => {
    const d = new Date();
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
  }, []);

  return (
    <div className="pt-[var(--safe-area-top)]">

      {/* ═══ ZONE 1: 헤더 — 큰 인사, 날짜, CTA ═══ */}
      <header className="px-5 @3xl:px-0 pt-4 pb-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 tracking-tight">오늘의 매치</p>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mt-0.5">
          {mounted && isAuthenticated ? (
            user ? (
              user.nickname ? `${user.nickname}님` : '안녕하세요'
            ) : (
              <span className="animate-pulse bg-gray-100 dark:bg-gray-700 rounded w-20 h-5 inline-block" />
            )
          ) : 'TeamMeet'}
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{todayLabel}</p>
        <div className="mt-3">
          {canRenderAuthenticated ? (
            <Link
              href="/matches/new"
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              {t('createMatch')}
              <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
            >
              {tc('login')}
              <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      {/* ═══ 빠른 액션 그리드 — 서비스 핵심 기능 2×2 ═══ */}
      <section className="mt-10 px-5 @3xl:px-0">
        <div className="grid grid-cols-2 gap-3.5">
          {quickActions.map(({ href, icon: Icon, label, desc }, idx) => {
            const iconStyles = [
              'bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400',
              'bg-violet-50 dark:bg-violet-900/30 text-violet-500 dark:text-violet-400',
              'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
              'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
            ];
            return (
              <Link key={href} href={href}>
                <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:bg-gray-50 dark:hover:bg-gray-700/80 active:scale-[0.97] transition-[colors,transform] h-full">
                  <div className={`inline-flex items-center justify-center rounded-xl p-3 ${iconStyles[idx]}`}>
                    <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white tracking-tight">{label}</p>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ═══ 다가오는 일정 — 로그인 유저 전용, 최대 3개 ═══ */}
      {canRenderAuthenticated && (upcoming.length > 0 || teamMatches.length > 0) && (
        <section className="mt-10 px-5 @3xl:px-0">
          <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">{t('upcomingSchedule')}</h2>
              <Link href="/my/matches" className="text-sm text-blue-500 font-medium min-h-[44px] flex items-center">{t('viewAll')}</Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {upcoming.map((m: Match, idx) => {
                const d = new Date(m.matchDate);
                const accent = sportCardAccent[m.sportType];
                const isFirst = idx === 0;
                return isFirst ? (
                  // 첫 번째(가장 가까운) 일정 — 하이라이트 카드
                  <Link key={m.id} href={`/matches/${m.id}`}>
                    <div className="flex items-center gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 px-3 py-3 mb-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 active:scale-[0.98] transition-colors">
                      <div className="flex flex-col items-center justify-center w-10 shrink-0">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{d.getMonth()+1}/{d.getDate()}</span>
                        <span className="text-2xs text-blue-400 dark:text-blue-500">{weekdays[d.getDay()]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{m.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{m.startTime} · {m.venue?.name || sportLabel[m.sportType]}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {accent && <span className={`h-2 w-2 rounded-full ${accent.dot}`} aria-hidden="true" />}
                        <span className={`text-xs font-semibold ${m.currentPlayers / m.maxPlayers >= 0.7 ? 'text-amber-500' : 'text-blue-500'}`}>
                          {m.currentPlayers}/{m.maxPlayers}
                        </span>
                      </div>
                    </div>
                  </Link>
                ) : (
                  // 나머지 일정 — 컴팩트 리스트
                  <Link key={m.id} href={`/matches/${m.id}`}>
                    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white dark:hover:bg-gray-800 active:scale-[0.98] transition-colors">
                      <div className="flex flex-col items-center justify-center w-10 shrink-0">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{d.getMonth()+1}/{d.getDate()}</span>
                        <span className="text-2xs text-gray-500">{weekdays[d.getDay()]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.title}</p>
                        <p className="text-xs text-gray-500">{m.startTime} · {m.venue?.name || sportLabel[m.sportType]}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {accent && <span className={`h-2 w-2 rounded-full ${accent.dot}`} aria-hidden="true" />}
                        <span className={`text-xs font-semibold ${m.currentPlayers / m.maxPlayers >= 0.7 ? 'text-amber-500' : 'text-gray-500'}`}>
                          {m.currentPlayers}/{m.maxPlayers}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {teamMatches.map((tm: TeamMatch) => {
                const d = new Date(tm.matchDate);
                return (
                  <Link key={tm.id} href={`/team-matches/${tm.id}`}>
                    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white dark:hover:bg-gray-800 active:scale-[0.98] transition-colors">
                      <div className="flex flex-col items-center justify-center w-10 shrink-0">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{d.getMonth()+1}/{d.getDate()}</span>
                        <span className="text-2xs text-gray-500">{weekdays[d.getDay()]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{tm.title}</p>
                        <p className="text-xs text-gray-500">{tm.startTime} · {t('teamMatch')}</p>
                      </div>
                      <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" aria-hidden="true" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 비로그인 가치 제안 — 토스 스타일 다크 패널 */}
      {!canRenderAuthenticated && (
        <section className="mt-8 px-5 @3xl:px-0">
          <div className="rounded-2xl bg-gray-900 dark:bg-gray-800 p-5">
            <p className="text-base font-bold text-white tracking-tight">{t('aiMatchIntro')}</p>
            <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{t('valueProposition')}</p>
            <Link href="/login" className="inline-flex items-center gap-1.5 mt-4 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors">
              {t('getStarted')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      {/* ═══ AI 추천 매치 — 가로 스크롤 프리뷰 ═══ */}
      {recommendedMatches.length > 0 && (
        <section className="mt-8 px-5 @3xl:px-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">AI 추천 매치</h2>
            <Link href="/matches" className="text-sm text-blue-500 font-medium min-h-[44px] flex items-center gap-0.5">
              더보기 <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-5 px-5 @3xl:mx-0 @3xl:px-0">
            {recommendedMatches.map((m: Match, idx) => (
              <RecommendedMatchCard key={m.id} match={m} priority={idx === 0} />
            ))}
          </div>
        </section>
      )}

      {/* 배너 (로그인 유저) — translateX 슬라이드 */}
      {canRenderAuthenticated && (
        <section className="mt-8 px-5 @3xl:px-0">
          <div
            className="relative h-32 overflow-hidden rounded-2xl"
            onMouseEnter={() => setBannerPaused(true)}
            onMouseLeave={() => setBannerPaused(false)}
            onFocus={() => setBannerPaused(true)}
            onBlur={() => setBannerPaused(false)}
          >
            {/* 슬라이드 레일 */}
            <div
              className="flex h-full transition-transform duration-500 ease-in-out"
              style={{
                width: `${banners.length * 100}%`,
                transform: `translateX(-${bannerIdx * (100 / banners.length)}%)`,
              }}
            >
              {banners.map((banner, i) => {
                const isDark = banner.dark;
                return (
                  <Link
                    key={i}
                    href={banner.href}
                    style={{ width: `${100 / banners.length}%` }}
                    className="shrink-0 h-full"
                    tabIndex={bannerIdx === i ? 0 : -1}
                    aria-hidden={bannerIdx !== i}
                  >
                    <div className={`relative h-full ${banner.bg} px-5 py-5 flex items-center justify-between overflow-hidden`}>
                      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 pointer-events-none" aria-hidden="true" />
                      <div className="absolute -right-2 top-10 w-14 h-14 rounded-full bg-white/5 pointer-events-none" aria-hidden="true" />
                      <div className="min-w-0 flex-1 relative z-10">
                        <p className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                          {banner.title}
                        </p>
                        <p className={`text-sm mt-1 leading-snug ${isDark ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                          {banner.subtitle}
                        </p>
                        <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${isDark ? 'text-white/80' : 'text-blue-500'}`}>
                          {banner.cta} <ArrowRight size={12} aria-hidden="true" />
                        </div>
                      </div>
                      <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/20 to-transparent rounded-r-2xl pointer-events-none" aria-hidden="true" />
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* 인디케이터 */}
            <div className="absolute bottom-3 right-4 flex gap-1.5 z-20">
              {banners.map((_, i) => {
                const activeDark = banners[bannerIdx].dark;
                return (
                  <button
                    key={i}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBannerIdx(i); }}
                    aria-label={`배너 ${i + 1}`}
                    className="p-[10px]"
                  >
                    <span className={`block h-1.5 rounded-full transition-[width,background-color] duration-300 ${
                      bannerIdx === i
                        ? `w-4 ${activeDark ? 'bg-white' : 'bg-gray-700 dark:bg-white'}`
                        : `w-1.5 ${activeDark ? 'bg-white/40' : 'bg-gray-700/30 dark:bg-white/40'}`
                    }`} />
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══ ZONE 2: 매치 탐색 — 종목 필터 + 리스트 ═══ */}
      <section className="mt-10 px-5 @3xl:px-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-0.5">
          {sportFilters.map((type) => (
            <button key={type} onClick={() => handleSportClick(type)} aria-pressed={activeSport === type}
              className={`shrink-0 min-h-[44px] rounded-full px-3 py-1.5 flex items-center text-sm font-medium transition-colors ${
                activeSport === type
                  ? 'bg-blue-500 text-white dark:bg-blue-500 dark:text-white'
                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}>
              {type === 'all' ? ts('all') : sportLabel[type]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 px-5 @3xl:px-0">
        <SectionHeader
          title={activeSport === 'all' ? t('recommendedMatches') : `${sportLabel[activeSport]} ${tc('matches')}`}
          count={filteredMatches.length}
          href={activeSport === 'all' ? '/matches' : `/matches?sport=${activeSport}`}
          moreLabel={t('viewMore')}
        />
        {isLoading ? (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {[1,2,3].map(i => <div key={i} className="h-[92px] rounded-xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer" />)}
          </div>
        ) : filteredMatches.length === 0 ? (
          <EmptyState
            icon={Calendar}
            size="sm"
            title={te('noMatches')}
            description={te('noMatchesDesc')}
            {...(activeSport !== 'all' && {
              secondaryAction: {
                label: t('viewAllMatches'),
                onClick: () => setActiveSport('all'),
              },
            })}
          />
        ) : (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
            {(activeSport === 'all' ? filteredMatches.slice(3, 9) : filteredMatches.slice(0, 6)).map((m: Match, idx) => <MatchCard key={m.id} match={m} priority={idx === 0} />)}
          </div>
        )}
      </section>

      {/* ═══ ZONE 3: 팀 · 강좌 · 장터 — 배경 구분 ═══ */}
      <div className="mt-10 bg-gray-50 dark:bg-gray-900/50 py-8">
        {/* 팀 */}
        {teams.length > 0 && (
          <section className="px-5 @3xl:px-0">
            <SectionHeader title={t('activeTeams')} href="/teams" showMore={teams.length > 3} moreLabel={t('viewMore')} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pr-5 @3xl:grid @3xl:grid-cols-3 @3xl:gap-3">
              {teams.map((team: SportTeam) => {
                const accent = sportCardAccent[team.sportType];
                const teamLogo = getTeamLogo(team.name, team.sportType, team.logoUrl, team.id);
                const fallbackTeamLogo = getTeamLogo(team.name, team.sportType, undefined, team.id);
                const region = team.district || team.city;
                return (
                  <Link key={team.id} href={`/teams/${team.id}`} className="shrink-0 w-[200px] @3xl:w-auto">
                    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors h-full flex flex-col">
                      {/* 로고 + 팀명 */}
                      <div className="flex items-center gap-2">
                        <div className={`relative h-7 w-7 rounded-lg ${accent?.tint || 'bg-gray-100 dark:bg-gray-700'} shrink-0 overflow-hidden`}>
                          <SafeImage src={teamLogo} fallbackSrc={fallbackTeamLogo} alt={`${team.name} logo`} fill className="rounded-lg object-cover" sizes="28px" />
                        </div>
                        <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{team.name}</p>
                      </div>

                      {/* 종목 · city · 모집중 */}
                      <div className="flex items-center gap-1 mt-1.5 min-w-0">
                        <span className={`${accent?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-1.5 py-0.5 text-2xs font-medium shrink-0`}>
                          {sportLabel[team.sportType]}
                        </span>
                        {team.city && (
                          <span className="flex items-center gap-0.5 text-2xs text-gray-400 dark:text-gray-500 shrink-0">
                            <MapPin size={9} aria-hidden="true" />
                            {team.city}
                          </span>
                        )}
                        {team.isRecruiting && (
                          <span className="ml-auto shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-2xs font-medium text-emerald-600 dark:text-emerald-400">
                            {t('recruiting')}
                          </span>
                        )}
                      </div>

                      {/* 소개 (있을 때만) */}
                      {team.description ? (
                        <p className="mt-1.5 text-2xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-1 leading-relaxed">
                          {team.description}
                        </p>
                      ) : <div className="flex-1" />}

                      {/* 인원수 + 레벨 */}
                      <div className="mt-2 flex items-center gap-1 text-2xs text-gray-400 dark:text-gray-500">
                        <Users size={9} className="shrink-0" aria-hidden="true" />
                        <span className="font-medium text-gray-700 dark:text-gray-300">{team.memberCount}{tc('people')}</span>
                        <span aria-hidden="true">·</span>
                        <span>{levelLabel[team.level] ?? '미정'}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* 강좌 */}
        {lessons.length > 0 && (
          <section className="mt-8 px-5 @3xl:px-0">
            <SectionHeader title={t('recommendedLessons')} href="/lessons" showMore={lessons.length > 3} moreLabel={t('viewMore')} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pr-5 @3xl:grid @3xl:grid-cols-3 @3xl:gap-3">
              {lessons.map((l: Lesson) => {
                const activePlans = l.ticketPlans?.filter(p => p.isActive) ?? [];
                const multiPlan = activePlans.find(p => p.type === 'multi');
                const sessionInfo = multiPlan?.totalSessions ? `${multiPlan.totalSessions}회` : null;
                const location = l.venueName || l.venue?.name || null;
                return (
                  <Link key={l.id} href={`/lessons/${l.id}`} className="shrink-0 w-[200px] @3xl:w-auto">
                    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors h-full flex flex-col">
                      {/* 제목 — 1순위 */}
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">{l.title}</p>

                      {/* 종목 배지 + 지역 — 2순위 */}
                      <div className="flex items-center gap-1 mt-2 min-w-0">
                        <span className={`${sportCardAccent[l.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-1.5 py-0.5 text-2xs font-medium shrink-0`}>
                          {sportLabel[l.sportType]}
                        </span>
                        {location && (
                          <span className="flex items-center gap-0.5 text-2xs text-gray-400 dark:text-gray-500 min-w-0">
                            <MapPin size={9} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{location}</span>
                          </span>
                        )}
                      </div>

                      {/* 날짜 · 시간 — 3순위 */}
                      <div className="flex items-center gap-1 mt-1 text-2xs text-gray-500 dark:text-gray-400">
                        <Clock size={9} className="shrink-0" aria-hidden="true" />
                        <span className="font-medium text-gray-700 dark:text-gray-300 shrink-0">{formatMatchDate(l.lessonDate)}</span>
                        <span className="shrink-0">{l.startTime}~{l.endTime}</span>
                      </div>

                      {/* 가격 + 부가정보 — 하단 고정 */}
                      <div className="mt-auto pt-2.5">
                        <span className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none">{formatCurrency(l.fee)}</span>
                        {(sessionInfo || l.coachName) && (
                          <p className="mt-0.5 text-2xs text-gray-400 dark:text-gray-500 truncate">
                            {[sessionInfo, l.coachName ? `${l.coachName} 코치` : null].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* 장터 */}
        {listings.length > 0 && (
          <section className="mt-8 px-5 @3xl:px-0">
            <SectionHeader title={t('latestMarketplace')} href="/marketplace" showMore={listings.length > 3} moreLabel={t('viewMore')} />
            <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3 @5xl:grid-cols-4">
              {listings.map((item: MarketplaceListing) => {
                const listingImage = getListingImage(item.imageUrls, item.id);
                const fallbackListingImage = getListingImage(undefined, item.id);
                const location = item.locationDistrict || item.locationCity;
                const daysAgoText = (() => {
                  if (!item.createdAt) return null;
                  const diff = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                  if (diff === 0) return '오늘';
                  if (diff === 1) return '어제';
                  return `${diff}일 전`;
                })();
                const typeLabel = item.listingType === 'rent' ? '대여' : item.listingType === 'group_buy' ? '공동구매' : '판매';
                return (
                  <Link key={item.id} href={`/marketplace/${item.id}`}>
                    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors active:scale-[0.98]">
                      <div className="relative aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <SafeImage src={listingImage} fallbackSrc={fallbackListingImage} alt={item.title} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
                        {/* 리스팅 타입 배지 */}
                        <span className={`absolute top-2 left-2 rounded-full px-1.5 py-0.5 text-2xs font-medium leading-none ${item.listingType === 'rent' ? 'bg-amber-500/90 text-white' : item.listingType === 'group_buy' ? 'bg-green-500/90 text-white' : 'bg-gray-900/70 text-white'}`}>
                          {typeLabel}
                        </span>
                      </div>
                      <div className="p-3 flex flex-col">
                        {/* 제목 — 1순위 */}
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">{item.title}</p>

                        {/* 카테고리 · 위치 — 2순위, 한 줄 */}
                        {(item.category || location) && (
                          <p className="mt-1 text-2xs text-gray-400 dark:text-gray-500 truncate">
                            {[item.category, location].filter(Boolean).join(' · ')}
                          </p>
                        )}

                        {/* 가격 + 등록일 — 하단 */}
                        <div className="mt-2 flex items-baseline justify-between gap-1">
                          <span className="text-base font-bold text-gray-900 dark:text-gray-100 leading-none">{formatCurrency(item.price)}</span>
                          {daysAgoText && (
                            <span className="text-2xs text-gray-400 dark:text-gray-500 shrink-0">{daysAgoText}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* 하단 내비 여백 */}
      <div className="h-24" />
    </div>
  );
}

// MatchCard — ZONE 2 리스트용 (이미지 + 정보 가로 배치)
const MatchCard = React.memo(function MatchCard({ match, priority = false }: { match: Match; priority?: boolean }) {
  const filled = match.currentPlayers / match.maxPlayers;
  const isAlmostFull = filled >= 0.7;
  const timeBadge = getTimeBadge(match.matchDate);
  const matchImage = getSportDetailImageSet(
    match.sportType,
    [match.imageUrl, ...(match.venue?.imageUrls ?? [])],
    match.id,
    1,
  )[0];
  const fallbackMatchImage = getSportDetailImageSet(match.sportType, undefined, match.id, 1)[0];

  return (
    <Link href={`/matches/${match.id}`}>
      <div className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden flex h-[100px] bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        {/* 이미지 */}
        <div className="relative w-[100px] shrink-0 bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <SafeImage
            src={matchImage}
            fallbackSrc={fallbackMatchImage}
            alt={match.title}
            fill
            className="object-cover"
            sizes="100px"
            priority={priority}
          />
          {timeBadge && (
            <span className="absolute top-1.5 left-1.5 text-2xs font-bold bg-gray-900/70 text-white rounded-md px-1.5 py-0.5">{timeBadge.text}</span>
          )}
        </div>
        {/* 정보 */}
        <div className="flex-1 px-3.5 py-3 min-w-0 flex flex-col justify-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate tracking-tight">
            {match.title}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
            {sportLabel[match.sportType]} · {formatMatchDate(match.matchDate)} {match.startTime}
            {match.venue?.name && ` · ${match.venue.name}`}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`text-xs font-medium ${isAlmostFull ? 'text-amber-500' : 'text-gray-600 dark:text-gray-300'}`}>
              {match.currentPlayers}/{match.maxPlayers}명
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{formatCurrency(match.fee)}</span>
            {match.levelMin != null && match.levelMax != null && (
              <>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
});

// RecommendedMatchCard — AI 추천 섹션용 가로 스크롤 컴팩트 카드
const RecommendedMatchCard = React.memo(function RecommendedMatchCard({ match, priority = false }: { match: Match; priority?: boolean }) {
  const filled = match.currentPlayers / match.maxPlayers;
  const isAlmostFull = filled >= 0.7;
  const accent = sportCardAccent[match.sportType];
  const timeBadge = getTimeBadge(match.matchDate);
  const matchImage = getSportDetailImageSet(
    match.sportType,
    [match.imageUrl, ...(match.venue?.imageUrls ?? [])],
    match.id,
    1,
  )[0];
  const fallbackMatchImage = getSportDetailImageSet(match.sportType, undefined, match.id, 1)[0];

  return (
    <Link href={`/matches/${match.id}`} className="shrink-0 w-[260px]">
      <div className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.97] transition-[colors,transform]">
        {/* 썸네일 이미지 */}
        <div className="relative h-[120px] bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <SafeImage
            src={matchImage}
            fallbackSrc={fallbackMatchImage}
            alt={match.title}
            fill
            className="object-cover"
            sizes="260px"
            priority={priority}
          />
          {timeBadge && (
            <span className="absolute top-2 left-2 text-2xs font-bold bg-gray-900/70 text-white rounded-md px-1.5 py-0.5">{timeBadge.text}</span>
          )}
          {accent && (
            <span className={`absolute top-2 right-2 text-xs font-medium rounded-full px-2 py-0.5 ${accent.badge}`}>
              {sportLabel[match.sportType]}
            </span>
          )}
        </div>
        {/* 정보 */}
        <div className="px-3 pt-2.5 pb-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{match.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
            {formatMatchDate(match.matchDate)} {match.startTime}
            {match.venue?.name && ` · ${match.venue.name}`}
          </p>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs font-medium ${isAlmostFull ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {match.currentPlayers}/{match.maxPlayers}명
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(match.fee)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
});
