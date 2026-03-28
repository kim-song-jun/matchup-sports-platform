'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useMatches, useTeams, useLessons, useListings, useTeamMatches } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ChevronRight, Plus, Clock, ArrowRight, Calendar, Swords, Gift, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge } from '@/lib/utils';
import { getSportImage, getTeamImage, getListingImage } from '@/lib/sport-image';
import type { Match, SportTeam, Lesson, MarketplaceListing, TeamMatch } from '@/types/api';

const sportFilters = [
  'all', 'soccer', 'futsal', 'basketball', 'badminton',
  'ice_hockey', 'swimming', 'tennis',
] as const;

const banners = [
  { title: '팀 매칭 오픈', desc: 'S~D 등급으로 딱 맞는 상대 찾기', href: '/team-matches', icon: Swords, bg: 'bg-emerald-900 dark:bg-emerald-950', iconBg: 'bg-emerald-700/50', iconColor: 'text-emerald-300' },
  { title: '첫 매치 무료', desc: '지금 가입하고 무료 매치 즐기기', href: '/matches', icon: Gift, bg: 'bg-blue-900 dark:bg-blue-950', iconBg: 'bg-blue-700/50', iconColor: 'text-blue-300' },
  { title: '용병 모집', desc: '팀에 빈 자리? 용병을 구해보세요', href: '/mercenary', icon: Users, bg: 'bg-amber-900 dark:bg-amber-950', iconBg: 'bg-amber-700/50', iconColor: 'text-amber-300' },
] as const;

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];


export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
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
  useEffect(() => {
    if (bannerPaused) return;
    const t = setInterval(() => setBannerIdx(i => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [bannerPaused]);

  return (
    <div className="pt-[var(--safe-area-top)]">

      {/* ═══ ZONE 1: 헤더 + 일정 (개인화 영역) ═══ */}
      <section className="px-5 @3xl:px-0 pt-4 pb-1">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {isAuthenticated && user ? `${user.nickname}님` : 'TeamMeet'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isAuthenticated
                ? upcoming.length > 0 ? `다가오는 일정 ${upcoming.length}개` : '오늘 매치를 찾아보세요'
                : '같이 운동할 사람을 찾아보세요'
              }
            </p>
          </div>
          {isAuthenticated ? (
            <Link href="/matches/new" className="flex items-center gap-1 rounded-xl bg-blue-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-600 transition-colors">
              <Plus size={14} strokeWidth={2.5} />
              매치 만들기
            </Link>
          ) : (
            <Link href="/login" className="rounded-xl bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 transition-colors">
              로그인
            </Link>
          )}
        </div>
      </section>

      {/* 다가오는 일정 — 컴팩트 리스트 (이미지 없음, 긴급성 강조) */}
      {isAuthenticated && (upcoming.length > 0 || teamMatches.length > 0) && (
        <section className="mt-3 px-5 @3xl:px-0">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">다가오는 일정</h2>
              <Link href="/my/matches" className="text-xs text-gray-500 min-h-[44px] flex items-center">전체 →</Link>
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
                      <span className={`shrink-0 text-xs font-semibold ${m.currentPlayers / m.maxPlayers >= 0.7 ? 'text-red-500' : 'text-gray-500'}`}>
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
                        <p className="text-xs text-gray-500">{tm.startTime} · 팀 매치</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 비로그인 가치 제안 */}
      {!isAuthenticated && (
        <section className="mt-3 px-5 @3xl:px-0">
          <div className="rounded-xl bg-gray-900 dark:bg-gray-800 p-5">
            <p className="text-lg font-bold text-white">AI가 딱 맞는 상대를 찾아줘요</p>
            <p className="text-xs text-gray-500 mt-1">실력에 맞는 상대, 5분이면 매칭 완료</p>
            <Link href="/login" className="inline-flex items-center gap-1 mt-3 rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-600 transition-colors">
              시작하기 <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      )}

      {/* 배너 (로그인 유저) */}
      {isAuthenticated && (
        <section className="mt-4 px-5 @3xl:px-0">
          <div className="relative rounded-xl overflow-hidden h-[96px]" onMouseEnter={() => setBannerPaused(true)} onMouseLeave={() => setBannerPaused(false)} onFocus={() => setBannerPaused(true)} onBlur={() => setBannerPaused(false)}>
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
                  className="relative flex items-center justify-center p-2.5">
                  <span className={`block h-1.5 rounded-full transition-[width,colors] duration-300 ${bannerIdx === i ? 'w-4 bg-white' : 'w-1.5 bg-white/30'}`} />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ ZONE 2: 매치 탐색 (핵심 기능) ═══ */}
      <section className="mt-6 px-5 @3xl:px-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-0.5">
          {sportFilters.map((type) => (
            <button key={type} onClick={() => handleSportClick(type)}
              className={`shrink-0 rounded-lg px-3 min-h-[44px] flex items-center text-sm font-medium transition-colors ${
                activeSport === type
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}>
              {type === 'all' ? '전체' : sportLabel[type]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-3 px-5 @3xl:px-0">
        <SectionHeader
          title={activeSport === 'all' ? '추천 매치' : `${sportLabel[activeSport]} 매치`}
          count={filteredMatches.length}
          href={activeSport === 'all' ? '/matches' : `/matches?sport=${activeSport}`}
        />
        {isLoading ? (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {[1,2,3].map(i => <div key={i} className="h-[92px] rounded-xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer" />)}
          </div>
        ) : filteredMatches.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="아직 매치가 없네요"
            description="첫 매치를 만들어보는 건 어때요?"
            size="sm"
            secondaryAction={activeSport !== 'all' ? { label: '전체 보기', onClick: () => setActiveSport('all') } : undefined}
          />
        ) : (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {filteredMatches.slice(0, 6).map((m: Match) => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </section>

      {/* ═══ ZONE 3: 탐색 섹션 (팀 · 강좌 · 장터) — 배경 구분 ═══ */}
      <div className="mt-8 bg-gray-50/50 dark:bg-gray-800/20 py-6">
        {/* 팀 — 텍스트 카드 */}
        {teams.length > 0 && (
          <section className="px-5 @3xl:px-0">
            <SectionHeader title="활동 중인 팀" href="/teams" showMore={teams.length > 3} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pr-5 @3xl:grid @3xl:grid-cols-3 @3xl:gap-3">
              {teams.map((t: SportTeam) => {
                const accent = sportCardAccent[t.sportType];
                return (
                  <Link key={t.id} href={`/teams/${t.id}`} className="shrink-0 w-[200px] @3xl:w-auto">
                    <div className="rounded-xl bg-white dark:bg-gray-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors h-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full ${accent?.tint || 'bg-gray-100'} shrink-0`}>
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{t.name?.charAt(0)}</span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
                        </div>
                        {t.isRecruiting && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-full px-2 py-0.5 shrink-0 ml-1">모집중</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                        <span className={`${accent?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-medium`}>{sportLabel[t.sportType]}</span>
                        <span>{t.memberCount}명</span>
                      </p>
                      {t.description && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{t.description}</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* 강좌 — 텍스트 카드 */}
        {lessons.length > 0 && (
          <section className="mt-6 px-5 @3xl:px-0">
            <SectionHeader title="추천 강좌" href="/lessons" showMore={lessons.length > 3} />
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pr-5 @3xl:grid @3xl:grid-cols-3 @3xl:gap-3">
              {lessons.map((l: Lesson) => {
                const accent = sportCardAccent[l.sportType];
                return (
                  <Link key={l.id} href={`/lessons/${l.id}`} className="shrink-0 w-[200px] @3xl:w-auto">
                    <div className="rounded-xl bg-white dark:bg-gray-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors h-full">
                      <div className="flex items-center justify-between">
                        <span className={`${accent?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-medium`}>
                          {sportLabel[l.sportType]}
                        </span>
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(l.fee)}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate mt-2">{l.title}</p>
                      {l.coachName && (
                        <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-2xs font-bold text-gray-500">{l.coachName.charAt(0)}</span>
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

        {/* 장터 — 이미지 그리드 (상품은 이미지가 핵심) */}
        {listings.length > 0 && (
          <section className="mt-6 px-5 @3xl:px-0">
            <SectionHeader title="최신 장터" href="/marketplace" showMore={listings.length > 3} />
            <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3 @5xl:grid-cols-4 @3xl:gap-3">
              {listings.map((item: MarketplaceListing) => (
                <Link key={item.id} href={`/marketplace/${item.id}`}>
                  <div className="rounded-xl bg-white dark:bg-gray-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors">
                    <div className="aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <img src={getListingImage(item.imageUrls)} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                      <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(item.price)}</p>
                      {item.listingType === 'rent' && (
                        <span className="inline-block mt-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-full px-2 py-0.5">대여</span>
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
  );
}


function SectionHeader({ title, count, href, showMore = true }: { title: string; count?: number; href: string; showMore?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        {count !== undefined && count > 0 && <span className="text-xs text-gray-500">{count}</span>}
      </div>
      {showMore && (
        <Link href={href} className="text-sm text-blue-500 hover:text-blue-600 font-medium transition-colors flex items-center min-h-[44px]">
          더보기 <ChevronRight size={14} className="ml-0.5" />
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
      <div className="rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors">
        {/* 이미지: 정사각형 고정 */}
        <div className="w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
          <img src={getSportImage(match.sportType, match.imageUrl)} alt={match.title} className="w-full h-full object-cover" loading="lazy" />
          {timeBadge && (
            <span className="absolute top-1.5 left-1.5 text-2xs font-bold bg-gray-900/70 text-white rounded-md px-1.5 py-0.5">{timeBadge.text}</span>
          )}
        </div>
        {/* 텍스트 */}
        <div className="flex-1 bg-white dark:bg-gray-800 p-4 min-w-0 flex flex-col justify-center">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
            {match.title}
          </p>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 truncate">
            <span className={`${sportCardAccent[match.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-medium shrink-0`}>
              {sportLabel[match.sportType]}
            </span>
            <span className="shrink-0">{formatMatchDate(match.matchDate)} {match.startTime}</span>
            {match.venue?.name && <><span className="shrink-0">·</span><span className="truncate">{match.venue.name}</span></>}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-xs font-semibold ${isAlmostFull ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {match.currentPlayers}/{match.maxPlayers}명
            </span>
            <span className="text-xs text-gray-500">{formatCurrency(match.fee)}</span>
            {match.levelMin != null && match.levelMax != null && (
              <span className="text-2xs text-gray-500 dark:text-gray-400">Lv.{match.levelMin}~{match.levelMax}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
});
