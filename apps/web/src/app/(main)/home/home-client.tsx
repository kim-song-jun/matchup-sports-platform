'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMatches, useTeams, useLessons, useListings, useTeamMatches } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { Plus, Clock, ArrowRight, Calendar, Swords, Gift, Users, GraduationCap, UserPlus, MapPin, Trophy } from 'lucide-react';
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
  { title: '팀 매칭 오픈', desc: 'S~D 등급으로 딱 맞는 상대 찾기', href: '/team-matches', icon: Swords, bg: 'bg-slate-800 dark:bg-slate-900', iconBg: 'bg-white/10', iconColor: 'text-emerald-300' },
  { title: '첫 매치 무료', desc: '지금 가입하고 무료 매치 즐기기', href: '/matches', icon: Gift, bg: 'bg-gray-900 dark:bg-gray-950', iconBg: 'bg-white/10', iconColor: 'text-blue-300' },
  { title: '용병 모집', desc: '팀에 빈 자리? 용병을 구해보세요', href: '/mercenary', icon: Users, bg: 'bg-slate-900 dark:bg-slate-950', iconBg: 'bg-white/10', iconColor: 'text-amber-300' },
] as const;

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];


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

  const upcoming = useMemo(() =>
    allMatches.filter((m: Match) => {
      const diff = Math.ceil((new Date(m.matchDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 3;
    }).slice(0, 4),
  [allMatches]);

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

  return (
    <div className="pt-[var(--safe-area-top)]">

      {/* ═══ ZONE 1: 헤더 (토스 스타일 — 큰 인사, 부제, CTA) ═══ */}
      <header className="px-5 @3xl:px-0 pt-4 pb-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 tracking-tight">오늘의 매치</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mt-0.5">
          {mounted && isAuthenticated && user ? t('greeting', { nickname: user.nickname }) : 'MatchUp'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {canRenderAuthenticated
            ? upcoming.length > 0 ? `${t('upcomingSchedule')} ${t('upcomingCount', { count: upcoming.length })}` : t('findMatchToday')
            : t('findPartner')}
        </p>
        <div className="mt-3">
          {canRenderAuthenticated ? (
            <Link href="/matches/new" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600">
              <Plus size={16} strokeWidth={2.5} className="mr-1" aria-hidden="true" />
              {t('createMatch')}
            </Link>
          ) : (
            <Link href="/login" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600">
              {tc('login')}
            </Link>
          )}
        </div>
      </header>

      {/* 다가오는 일정 — 토스 스타일 컴팩트 리스트 */}
      {canRenderAuthenticated && (upcoming.length > 0 || teamMatches.length > 0) && (
        <section className="mt-6 px-5 @3xl:px-0">
          <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">{t('upcomingSchedule')}</h2>
              <Link href="/my/matches" className="text-sm text-blue-500 font-medium min-h-[44px] flex items-center">{t('viewAll')}</Link>
            </div>
            <div className="space-y-2">
              {upcoming.map((m: Match) => {
                const d = new Date(m.matchDate);
                return (
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
                      <span className={`shrink-0 text-xs font-semibold ${m.currentPlayers / m.maxPlayers >= 0.7 ? 'text-amber-500' : 'text-gray-500'}`}>
                        {m.currentPlayers}/{m.maxPlayers}
                      </span>
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
        <section className="mt-6 px-5 @3xl:px-0">
          <div className="rounded-2xl bg-gray-900 dark:bg-gray-800 p-5">
            <p className="text-lg font-bold text-white tracking-tight">{t('aiMatchIntro')}</p>
            <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{t('valueProposition')}</p>
            <Link href="/login" className="inline-flex items-center gap-1.5 mt-4 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors">
              {t('getStarted')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      {/* 배너 (로그인 유저) */}
      {canRenderAuthenticated && (
        <section className="mt-4 px-5 @3xl:px-0">
          <div className="relative h-24 overflow-hidden rounded-xl" onMouseEnter={() => setBannerPaused(true)} onMouseLeave={() => setBannerPaused(false)} onFocus={() => setBannerPaused(true)} onBlur={() => setBannerPaused(false)}>
            {/* Crossfade layers */}
              {banners.map((banner, i) => {
                const BannerIcon = banner.icon;
                return (
                  <Link key={i} href={banner.href}
                    className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${bannerIdx === i ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                    aria-hidden={bannerIdx !== i}
                    tabIndex={bannerIdx === i ? 0 : -1}
                  >
                    <div className={`h-full ${banner.bg} px-5 py-4 flex items-center justify-between`}>
                      <div>
                        <p className="text-md font-bold text-white">{banner.title}</p>
                        <p className="text-xs text-white/60 mt-1">{banner.desc}</p>
                      </div>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${banner.iconBg} shrink-0`}>
                        <BannerIcon size={20} className={banner.iconColor} />
                      </div>
                    </div>
                  </Link>
                );
              })}
              {/* Indicator dots */}
              <div className="absolute bottom-0 right-2 flex gap-0 z-20">
                {banners.map((_, i) => (
                  <button key={i} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBannerIdx(i); }}
                    aria-label={`배너 ${i + 1}`}
                    className="relative flex min-h-[44px] min-w-[44px] items-center justify-center p-2.5">
                    <span className={`block h-1.5 rounded-full transition-[width,background-color] duration-300 ${bannerIdx === i ? 'w-4 bg-white' : 'w-1.5 bg-white/30'}`} />
                  </button>
                ))}
              </div>
          </div>
        </section>
      )}

      {/* 빠른 탐색 칩 — 토스 스타일 pill row */}
      <section className="px-5 @3xl:px-0 mt-8">
        <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight mb-3">더 찾아보기</h2>
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
          {[
            { href: '/lessons', icon: GraduationCap, label: tn('lessons') },
            { href: '/team-matches', icon: Swords, label: tn('teamMatching') },
            { href: '/mercenary', icon: UserPlus, label: tn('mercenary') },
            { href: '/venues', icon: MapPin, label: tn('venues') },
            { href: '/tournaments', icon: Trophy, label: tn('tournaments') },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href}
              className="flex shrink-0 items-center min-h-[44px] gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      {/* ═══ ZONE 2: 매치 탐색 (핵심 기능) ═══ */}
      <section className="mt-10 px-5 @3xl:px-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-0.5">
          {sportFilters.map((type) => (
            <button key={type} onClick={() => handleSportClick(type)} aria-pressed={activeSport === type}
              className={`shrink-0 rounded-lg px-3 min-h-[44px] flex items-center text-sm font-medium transition-colors ${
                activeSport === type
                  ? 'bg-blue-500 text-white dark:bg-blue-500 dark:text-white'
                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}>
              {type === 'all' ? ts('all') : sportLabel[type]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 px-5 @3xl:px-0">
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
            title={te('noMatches')}
            description={te('noMatchesDesc')}
            size="sm"
            secondaryAction={activeSport !== 'all' ? { label: t('viewAllMatches'), onClick: () => setActiveSport('all') } : undefined}
          />
        ) : (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
            {filteredMatches.slice(0, 6).map((m: Match, idx) => <MatchCard key={m.id} match={m} priority={idx === 0} />)}
          </div>
        )}
      </section>

      {/* ═══ ZONE 3: 탐색 섹션 (팀 · 강좌 · 장터) — 토스 스타일 배경 구분 ═══ */}
      <div className="mt-10 bg-gray-50 dark:bg-gray-900/50 py-8">
        {/* 팀 — 컴팩트 리스트 카드 */}
        {teams.length > 0 && (
          <section className="px-5 @3xl:px-0">
            <SectionHeader title={t('activeTeams')} href="/teams" showMore={teams.length > 3} moreLabel={t('viewMore')} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pr-5 @3xl:grid @3xl:grid-cols-3 @3xl:gap-3">
              {teams.map((team: SportTeam) => {
                const accent = sportCardAccent[team.sportType];
                const teamLogo = getTeamLogo(team.name, team.sportType, team.logoUrl, team.id);
                const fallbackTeamLogo = getTeamLogo(team.name, team.sportType, undefined, team.id);
                return (
                  <Link key={team.id} href={`/teams/${team.id}`} className="shrink-0 w-[200px] @3xl:w-auto">
                    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors h-full">
                      <div className="flex items-center gap-2.5">
                        <div className={`relative h-9 w-9 rounded-xl ${accent?.tint || 'bg-gray-100'} shrink-0 overflow-hidden`}>
                          <SafeImage src={teamLogo} fallbackSrc={fallbackTeamLogo} alt={`${team.name} logo`} fill className="rounded-[10px] object-cover" sizes="36px" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{team.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{sportLabel[team.sportType]} · {team.memberCount}{tc('people')}</p>
                        </div>
                        {team.isRecruiting && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">{t('recruiting')}</span>}
                      </div>
                      {team.description && <p className="text-xs text-gray-500 mt-2 line-clamp-1">{team.description}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* TODO: Tournament section — awaiting useTournaments hook (frontend-data-dev).
            Pattern: hooks/api/use-tournaments.ts, endpoint GET /tournaments,
            type Tournament from types/api.ts, query keys already defined in query-keys.ts. */}

        {/* 강좌 — 컴팩트 리스트 카드 */}
        {lessons.length > 0 && (
          <section className="mt-8 px-5 @3xl:px-0">
            <SectionHeader title={t('recommendedLessons')} href="/lessons" showMore={lessons.length > 3} moreLabel={t('viewMore')} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pr-5 @3xl:grid @3xl:grid-cols-3 @3xl:gap-3">
              {lessons.map((l: Lesson) => {
                const accent = sportCardAccent[l.sportType];
                return (
                  <Link key={l.id} href={`/lessons/${l.id}`} className="shrink-0 w-[200px] @3xl:w-auto">
                    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors h-full">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{l.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{sportLabel[l.sportType]}</p>
                      <div className="flex items-center justify-between mt-3">
                        {l.coachName && (
                          <p className="text-xs text-gray-500 flex items-center gap-1.5">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-2xs font-bold text-gray-500">{l.coachName.charAt(0)}</span>
                            {l.coachName} {t('coach')}
                          </p>
                        )}
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(l.fee)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* 장터 — 이미지 그리드 (상품은 이미지가 핵심) */}
        {listings.length > 0 && (
          <section className="mt-8 px-5 @3xl:px-0">
            <SectionHeader title={t('latestMarketplace')} href="/marketplace" showMore={listings.length > 3} moreLabel={t('viewMore')} />
            <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3 @5xl:grid-cols-4">
              {listings.map((item: MarketplaceListing) => {
                const listingImage = getListingImage(item.imageUrls, item.id);
                const fallbackListingImage = getListingImage(undefined, item.id);
                return (
                  <Link key={item.id} href={`/marketplace/${item.id}`}>
                    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <div className="relative aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <SafeImage src={listingImage} fallbackSrc={fallbackListingImage} alt={item.title} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                        <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(item.price)}</p>
                        {item.listingType === 'rent' && (
                          <span className="inline-block mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">{t('rent')}</span>
                        )}
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
    <Link href={`/matches/${match.id}`} className="cursor-pointer">
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex h-24 hover:border-gray-200 dark:hover:border-gray-700 active:scale-[0.98] transition-[border-color,transform] duration-150">
        {/* 이미지: 1:1 정사각형 고정 */}
        <div className="relative w-24 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <SafeImage
            src={matchImage}
            fallbackSrc={fallbackMatchImage}
            alt={match.title}
            fill
            className="object-cover"
            sizes="96px"
            priority={priority}
          />
          {timeBadge && (
            <span className="absolute top-1.5 left-1.5 text-2xs font-bold bg-gray-900/70 text-white rounded-md px-1.5 py-0.5">{timeBadge.text}</span>
          )}
        </div>
        {/* 텍스트 */}
        <div className="flex-1 bg-white dark:bg-gray-900 px-3.5 py-3 min-w-0 flex flex-col justify-center">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
            {match.title}
          </p>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 truncate">
            <span className={`${sportCardAccent[match.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal shrink-0`}>
              {sportLabel[match.sportType]}
            </span>
            <span className="shrink-0">{formatMatchDate(match.matchDate)} {match.startTime}</span>
            {match.venue?.name && <><span className="shrink-0">·</span><span className="truncate">{match.venue.name}</span></>}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-xs font-normal ${isAlmostFull ? 'text-amber-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {match.currentPlayers}/{match.maxPlayers}명
            </span>
            <span className="text-xs text-gray-500">{formatCurrency(match.fee)}</span>
            {match.levelMin != null && match.levelMax != null && (
              <span className="text-2xs text-gray-500 dark:text-gray-400">{levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
});
