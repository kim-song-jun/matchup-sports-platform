'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMatches, useTeams, useLessons, useListings, useTeamMatches } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ArrowRight, BadgeCheck, Calendar, ChevronRight, Gift, Sparkles, Swords, Target, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { sportLabel, sportCardAccent, levelLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge } from '@/lib/utils';
import { getSportImage, getListingImage } from '@/lib/sport-image';
import type { Match, SportTeam, Lesson, MarketplaceListing, TeamMatch } from '@/types/api';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/10';

const sportFilters = [
  'all', 'soccer', 'futsal', 'basketball', 'badminton',
  'ice_hockey', 'swimming', 'tennis',
] as const;

const banners = [
  { title: '팀 매칭 오픈', desc: 'S~D 등급으로 딱 맞는 상대 찾기', href: '/team-matches', icon: Swords, bg: 'from-emerald-950 via-emerald-900 to-slate-950', iconBg: 'bg-white/10', iconColor: 'text-emerald-200' },
  { title: '첫 매치 무료', desc: '지금 가입하고 무료 매치 즐기기', href: '/matches', icon: Gift, bg: 'from-blue-950 via-sky-900 to-slate-950', iconBg: 'bg-white/10', iconColor: 'text-blue-200' },
  { title: '용병 모집', desc: '팀에 빈 자리? 용병을 구해보세요', href: '/mercenary', icon: Users, bg: 'from-amber-950 via-orange-900 to-slate-950', iconBg: 'bg-white/10', iconColor: 'text-amber-200' },
] as const;

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const t = useTranslations('home');
  const te = useTranslations('empty');
  const ts = useTranslations('sports');
  const tc = useTranslations('common');
  const { data: matchData, isLoading } = useMatches();
  const { data: teamData } = useTeams();
  const { data: lessonData } = useLessons();
  const { data: listingData } = useListings();
  const { data: teamMatchData } = useTeamMatches();

  const allMatches = matchData?.items ?? [];
  const teams = (teamData?.items ?? []).slice(0, 6);
  const lessons = (lessonData?.items ?? []).slice(0, 4);
  const listings = (listingData?.items ?? []).slice(0, 4);
  const teamMatches = (teamMatchData?.items ?? []).slice(0, 3);

  const [activeSport, setActiveSport] = useState<string>('all');
  const [bannerIdx, setBannerIdx] = useState(0);
  const [bannerPaused, setBannerPaused] = useState(false);

  const filteredMatches = useMemo(() =>
    activeSport === 'all' ? allMatches : allMatches.filter((m: Match) => m.sportType === activeSport),
  [allMatches, activeSport]);

  const upcoming = useMemo(() =>
    allMatches.filter((m: Match) => {
      const diff = Math.ceil((new Date(m.matchDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 3;
    }).slice(0, 4),
  [allMatches]);

  const upcomingTeamMatches = useMemo(() =>
    (teamMatchData?.items ?? []).filter((match: TeamMatch) => {
      const diff = Math.ceil((new Date(match.matchDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 3;
    }).slice(0, 4),
  [teamMatchData]);

  const upcomingSchedule = useMemo(() => {
    const matchItems = upcoming.map((match: Match) => ({
      kind: 'match' as const,
      id: match.id,
      href: `/matches/${match.id}`,
      matchDate: match.matchDate,
      title: match.title,
      startTime: match.startTime,
      subtitle: match.venue?.name || sportLabel[match.sportType],
      meta: `${match.currentPlayers}/${match.maxPlayers}명`,
      metaLabel: '정원 현황',
    }));

    const teamItems = upcomingTeamMatches.map((match: TeamMatch) => ({
      kind: 'team' as const,
      id: match.id,
      href: `/team-matches/${match.id}`,
      matchDate: match.matchDate,
      title: match.title,
      startTime: match.startTime,
      subtitle: match.venueName || '팀 매칭',
      meta: `${match.applicationCount ?? 0}팀`,
      metaLabel: '신청 현황',
    }));

    return [...matchItems, ...teamItems]
      .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime())
      .slice(0, 4);
  }, [upcoming, upcomingTeamMatches]);

  const nextBanner = useMemo(() => banners[bannerIdx], [bannerIdx]);
  const BannerIcon = nextBanner.icon;

  const handleSportClick = useCallback((type: string) => {
    setActiveSport(prev => prev === type ? 'all' : type);
  }, []);

  useEffect(() => {
    if (bannerPaused) return;
    const timer = setInterval(() => setBannerIdx((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(timer);
  }, [bannerPaused]);

  const metrics = [
    { label: '추천 매치', value: String(filteredMatches.length), tone: 'text-slate-900 dark:text-white' },
    { label: '활성 팀', value: String(teams.length), tone: 'text-slate-900 dark:text-white' },
    { label: '강좌', value: String(lessons.length), tone: 'text-slate-900 dark:text-white' },
    { label: '장터', value: String(listings.length), tone: 'text-slate-900 dark:text-white' },
  ];

  return (
    <div className="relative isolate overflow-hidden pt-[var(--safe-area-top)] pb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-90"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(59,130,246,0.24), transparent 34%), radial-gradient(circle at 80% 12%, rgba(15,23,42,0.14), transparent 24%), linear-gradient(180deg, rgba(248,250,252,0.95) 0%, rgba(248,250,252,0.62) 44%, rgba(248,250,252,0) 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-80 dark:opacity-100"
        style={{
          background:
            'radial-gradient(circle at 30% 8%, rgba(96,165,250,0.15), transparent 38%), radial-gradient(circle at 72% 8%, rgba(14,165,233,0.08), transparent 32%)',
        }}
      />

      <section className="relative px-5 @3xl:px-0 pt-4">
        <div className="grid gap-4 @3xl:grid-cols-[1.18fr_0.82fr]">
          <div className={`${surfaceCard} p-6 sm:p-8`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-sky-50/90 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
              <Sparkles size={14} />
              MatchUp 운영 대시보드
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <div>
                <h1 className="max-w-[14ch] text-3xl font-black tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                  {isAuthenticated && user ? t('greeting', { nickname: user.nickname }) : '오늘 바로 맞는 상대를 찾는 가장 빠른 방법'}
                </h1>
                <p className="mt-3 max-w-[34rem] text-base leading-relaxed text-slate-600 dark:text-slate-300">
                  실력, 위치, 매너를 기준으로 경기와 팀을 정리합니다. 지금 필요한 건 더 많은 기능이 아니라 더 정확한 매칭과 더 신뢰감 있는 흐름입니다.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                {isAuthenticated ? (
                  <Link
                    href="/matches/new"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 active:translate-y-0 dark:bg-white dark:text-slate-950"
                  >
                    새 매치 만들기
                    <ArrowRight size={16} />
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 active:translate-y-0 dark:bg-white dark:text-slate-950"
                  >
                    시작하기
                    <ArrowRight size={16} />
                  </Link>
                )}
                <button
                  onClick={() => document.getElementById('home-match-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  추천 매치 보기
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-950/70">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{metric.label}</p>
                  <p className={`mt-2 text-2xl font-black tracking-tight ${metric.tone}`}>{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {isAuthenticated && (
              <div className={`${surfaceCard} p-5 sm:p-6`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">다음 일정</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">가까운 경기 흐름</h2>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                    {upcomingSchedule.length > 0 ? `${upcomingSchedule.length}건` : '대기 중'}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {upcomingSchedule.length > 0 ? upcomingSchedule.map((item) => {
                    const date = new Date(item.matchDate);
                    return (
                      <Link key={`${item.kind}-${item.id}`} href={item.href}>
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-900">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                            <span className="text-xs font-semibold">{date.getMonth() + 1}월</span>
                            <span className="ml-0.5 text-lg font-black leading-none">{date.getDate()}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{item.title}</p>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${item.kind === 'team' ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                                {item.kind === 'team' ? '팀' : '개인'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {item.startTime} · {item.subtitle}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {item.meta}
                            </p>
                            <p className="mt-1 text-2xs text-slate-500 dark:text-slate-400">{item.metaLabel}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  }) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center dark:border-slate-800 dark:bg-slate-900/70">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">다가오는 일정이 없습니다</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">새 매치를 만들거나 팀 매칭/개인 매치 추천 목록에서 바로 참가해보세요.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={`${surfaceCard} overflow-hidden`}>
              <Link
                href={nextBanner.href}
                onMouseEnter={() => setBannerPaused(true)}
                onMouseLeave={() => setBannerPaused(false)}
                onFocus={() => setBannerPaused(true)}
                onBlur={() => setBannerPaused(false)}
                className={`block bg-gradient-to-br ${nextBanner.bg} px-5 py-5 text-white transition-transform hover:scale-[0.99]`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold">{nextBanner.title}</p>
                    <p className="mt-1 text-sm text-white/65">{nextBanner.desc}</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${nextBanner.iconBg}`}>
                    <BannerIcon size={20} className={nextBanner.iconColor} />
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-2 px-5 py-4">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setBannerIdx(i)}
                    aria-label={`배너 ${i + 1}`}
                    className="flex h-8 min-w-8 items-center justify-center rounded-full"
                  >
                    <span className={`block h-1.5 rounded-full transition-[width,colors] duration-300 ${bannerIdx === i ? 'w-6 bg-slate-950 dark:bg-white' : 'w-2 bg-slate-300 dark:bg-slate-700'}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {!isAuthenticated && (
        <section className="relative mt-4 px-5 @3xl:px-0">
          <div className={`${surfaceCard} overflow-hidden p-5 sm:p-6`}>
            <div className="grid gap-5 @3xl:grid-cols-[1.1fr_0.9fr] @3xl:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
                  <Target size={14} />
                  신뢰 기반 매칭
                </div>
                <p className="mt-4 text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                  AI 추천, 평가, 일정, 결제를 한 흐름으로 정리합니다.
                </p>
                <p className="mt-2 max-w-[34rem] text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  기능을 더 넣기보다 화면의 우선순위를 다시 정렬했습니다. 첫 방문에서도 무엇을 해야 하는지 바로 보이고, 익숙해지면 매치와 팀 운영이 빠르게 이어집니다.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: '매칭', icon: Calendar, desc: '바로 찾기' },
                  { label: '신뢰', icon: BadgeCheck, desc: '평가 체계' },
                  { label: '프로필', icon: Users, desc: '운영 정보' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                    <item.icon size={18} className="text-slate-900 dark:text-white" />
                    <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="relative mt-6 px-5 @3xl:px-0">
        <div className={`${surfaceCard} p-4 sm:p-5`}>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {sportFilters.map((type) => (
              <button
                key={type}
                onClick={() => handleSportClick(type)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  activeSport === type
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                    : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'
                }`}
              >
                {type === 'all' ? ts('all') : sportLabel[type]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="home-match-list" className="relative mt-6 px-5 @3xl:px-0">
        <SectionHeader
          title={activeSport === 'all' ? t('recommendedMatches') : `${sportLabel[activeSport]} ${tc('matches')}`}
          count={filteredMatches.length}
          href={activeSport === 'all' ? '/matches' : `/matches?sport=${activeSport}`}
          moreLabel={t('viewMore')}
        />
        {isLoading ? (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-[108px] rounded-[24px] bg-slate-100/80 dark:bg-slate-800/70 skeleton-shimmer" />)}
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
          <div className="grid gap-3 @3xl:grid-cols-2">
            {filteredMatches.slice(0, 6).map((m: Match) => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </section>

      <div className="relative mt-8 px-5 @3xl:px-0">
        <div className="rounded-[32px] border border-slate-200/70 bg-white/70 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70">
          {teams.length > 0 && (
            <section>
              <SectionHeader title={t('activeTeams')} href="/teams" showMore={teams.length > 3} moreLabel={t('viewMore')} />
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pr-1 @3xl:grid @3xl:grid-cols-3 @3xl:gap-3">
                {teams.map((team: SportTeam) => {
                  const accent = sportCardAccent[team.sportType];
                  return (
                    <Link key={team.id} href={`/teams/${team.id}`} className="shrink-0 w-[220px] @3xl:w-auto">
                      <div className={`${softCard} h-full p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-white dark:hover:bg-slate-900`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${accent?.tint || 'bg-slate-100'} shrink-0`}>
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-200">{team.name?.charAt(0)}</span>
                            </div>
                            <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{team.name}</p>
                          </div>
                          {team.isRecruiting && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">모집중</span>}
                        </div>
                        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className={`${accent?.badge || 'bg-slate-100 text-slate-500'} rounded-full px-2 py-0.5 text-xs font-medium`}>{sportLabel[team.sportType]}</span>
                          <span>{team.memberCount}{tc('people')}</span>
                        </p>
                        {team.description && <p className="mt-2 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{team.description}</p>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {lessons.length > 0 && (
            <section className="mt-8">
              <SectionHeader title={t('recommendedLessons')} href="/lessons" showMore={lessons.length > 3} moreLabel={t('viewMore')} />
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pr-1 @3xl:grid @3xl:grid-cols-3 @3xl:gap-3">
                {lessons.map((l: Lesson) => {
                  const accent = sportCardAccent[l.sportType];
                  return (
                    <Link key={l.id} href={`/lessons/${l.id}`} className="shrink-0 w-[220px] @3xl:w-auto">
                      <div className={`${softCard} h-full p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-white dark:hover:bg-slate-900`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`${accent?.badge || 'bg-slate-100 text-slate-500'} rounded-full px-2.5 py-1 text-xs font-medium`}>{sportLabel[l.sportType]}</span>
                          <span className="text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(l.fee)}</span>
                        </div>
                        <p className="mt-3 truncate text-sm font-semibold text-slate-950 dark:text-white">{l.title}</p>
                        {l.coachName && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-2xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{l.coachName.charAt(0)}</span>
                            {l.coachName} 코치
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {listings.length > 0 && (
            <section className="mt-8">
              <SectionHeader title={t('latestMarketplace')} href="/marketplace" showMore={listings.length > 3} moreLabel={t('viewMore')} />
              <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3 @5xl:grid-cols-4">
                {listings.map((item: MarketplaceListing) => (
                  <Link key={item.id} href={`/marketplace/${item.id}`}>
                    <div className="overflow-hidden rounded-[24px] border border-slate-200/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/80">
                      <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <Image src={getListingImage(item.imageUrls)} alt={item.title} fill className="object-cover" sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw" unoptimized />
                      </div>
                      <div className="p-3">
                        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{item.title}</p>
                        <p className="mt-1 text-base font-bold text-slate-950 dark:text-white">{formatCurrency(item.price)}</p>
                        {item.listingType === 'rent' && (
                          <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">대여</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {teamMatches.length > 0 && (
        <section className="relative mt-6 px-5 @3xl:px-0">
          <SectionHeader title="팀 매칭" href="/team-matches" showMore={teamMatches.length > 2} moreLabel={t('viewMore')} />
          <div className="grid gap-3 @3xl:grid-cols-3">
            {teamMatches.map((match: TeamMatch) => (
              <Link key={match.id} href={`/team-matches/${match.id}`}>
                <div className={`${softCard} h-full p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-white dark:hover:bg-slate-900`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{sportLabel[match.sportType]}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{match.quarterCount}쿼터</span>
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-slate-950 dark:text-white">{match.title}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatMatchDate(match.matchDate)} {match.startTime}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  count,
  href,
  showMore = true,
  moreLabel = '더보기',
}: {
  title: string;
  count?: number;
  href: string;
  showMore?: boolean;
  moreLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Section</p>
        <div className="mt-1 flex items-baseline gap-2">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
          {count !== undefined && count > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">{count}</span>}
        </div>
      </div>
      {showMore && (
        <Link href={href} className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-slate-200 bg-white/70 px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:border-slate-700">
          {moreLabel}
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

const MatchCard = React.memo(function MatchCard({ match }: { match: Match }) {
  const filled = match.currentPlayers / match.maxPlayers;
  const isAlmostFull = filled >= 0.7;
  const timeBadge = getTimeBadge(match.matchDate);

  return (
    <Link href={`/matches/${match.id}`}>
      <div className={`${softCard} flex overflow-hidden transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:hover:bg-slate-900`}>
        <div className="relative w-32 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
          <Image src={getSportImage(match.sportType, match.imageUrl)} alt={match.title} fill className="object-cover" sizes="128px" unoptimized />
          {timeBadge && (
            <span className="absolute left-2 top-2 rounded-full bg-slate-950/80 px-2 py-1 text-2xs font-bold text-white backdrop-blur">
              {timeBadge.text}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-base font-semibold text-slate-950 dark:text-white">{match.title}</p>
            <span className={`rounded-full px-2.5 py-1 text-2xs font-semibold ${isAlmostFull ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              {match.currentPlayers}/{match.maxPlayers}
            </span>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className={`${sportCardAccent[match.sportType]?.badge || 'bg-slate-100 text-slate-500'} rounded-full px-2.5 py-1 text-xs font-medium`}>
              {sportLabel[match.sportType]}
            </span>
            <span>{formatMatchDate(match.matchDate)} {match.startTime}</span>
            {match.venue?.name && <span>{match.venue.name}</span>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(match.fee)}</span>
            {match.levelMin != null && match.levelMax != null && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
});
