'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useMatches, useTeams, useLessons, useListings, useTeamMatches } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ChevronRight, Plus, Clock, ArrowRight } from 'lucide-react';
import { sportLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate, getTimeBadge } from '@/lib/utils';
import { getSportImage, getTeamImage, getListingImage } from '@/lib/sport-image';
import type { Match, SportTeam, Lesson, MarketplaceListing, TeamMatch } from '@/types/api';

const sportFilters = [
  'all', 'soccer', 'futsal', 'basketball', 'badminton',
  'ice_hockey', 'swimming', 'tennis',
] as const;

const banners = [
  { title: '팀 매칭 오픈', desc: 'S~D 등급으로 딱 맞는 상대 찾기', href: '/team-matches' },
  { title: '첫 매치 무료', desc: '지금 가입하고 무료 매치 즐기기', href: '/matches' },
  { title: '용병 모집', desc: '팀에 빈 자리? 용병을 구해보세요', href: '/mercenary' },
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
      <section className="px-5 lg:px-0 pt-4 pb-1">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-gray-900 dark:text-white">
              {isAuthenticated && user ? `${user.nickname}님` : 'TeamMeet'}
            </h1>
            <p className="text-[13px] text-gray-500 mt-0.5">
              {isAuthenticated
                ? upcoming.length > 0 ? `다가오는 일정 ${upcoming.length}개` : '오늘 매치를 찾아보세요'
                : '같이 운동할 사람을 찾아보세요'
              }
            </p>
          </div>
          {isAuthenticated ? (
            <Link href="/matches/new" className="flex items-center gap-1 rounded-xl bg-blue-500 px-3.5 py-2 text-[12px] font-bold text-white hover:bg-blue-600 transition-colors">
              <Plus size={14} strokeWidth={2.5} />
              매치 만들기
            </Link>
          ) : (
            <Link href="/login" className="rounded-xl bg-blue-500 px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-600 transition-colors">
              로그인
            </Link>
          )}
        </div>
      </section>

      {/* 다가오는 일정 — 컴팩트 리스트 (이미지 없음, 긴급성 강조) */}
      {isAuthenticated && (upcoming.length > 0 || teamMatches.length > 0) && (
        <section className="mt-3 px-5 lg:px-0">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-bold text-gray-900 dark:text-white">다가오는 일정</h2>
              <Link href="/my/matches" className="text-[11px] text-gray-500">전체 →</Link>
            </div>
            <div className="space-y-2">
              {upcoming.map((m: Match) => {
                const d = new Date(m.matchDate);
                return (
                  <Link key={m.id} href={`/matches/${m.id}`}>
                    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white dark:hover:bg-gray-800 active:scale-[0.98] transition-colors">
                      <div className="flex flex-col items-center justify-center w-10 shrink-0">
                        <span className="text-[11px] font-bold text-blue-500">{d.getMonth()+1}/{d.getDate()}</span>
                        <span className="text-[9px] text-gray-500">{weekdays[d.getDay()]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{m.title.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}</p>
                        <p className="text-[11px] text-gray-500">{m.startTime} · {m.venue?.name || sportLabel[m.sportType]}</p>
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold ${m.currentPlayers / m.maxPlayers >= 0.7 ? 'text-red-500' : 'text-gray-500'}`}>
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
                        <span className="text-[11px] font-bold text-blue-500">{d.getMonth()+1}/{d.getDate()}</span>
                        <span className="text-[9px] text-gray-500">{weekdays[d.getDay()]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{tm.title}</p>
                        <p className="text-[11px] text-gray-500">{tm.startTime} · 팀 매치</p>
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
        <section className="mt-3 px-5 lg:px-0">
          <div className="rounded-xl bg-gray-900 dark:bg-gray-800 p-5">
            <p className="text-[16px] font-bold text-white">AI가 딱 맞는 상대를 찾아줘요</p>
            <p className="text-[12px] text-gray-500 mt-1">11종목 · S~D 실력 등급 · 팀 매칭 · 용병 시스템</p>
            <Link href="/login" className="inline-flex items-center gap-1 mt-3 rounded-lg bg-blue-500 px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600 transition-colors">
              시작하기 <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      )}

      {/* 배너 (로그인 유저) */}
      {isAuthenticated && (
        <section className="mt-4 px-5 lg:px-0">
          <div className="relative rounded-xl overflow-hidden h-[88px]" onMouseEnter={() => setBannerPaused(true)} onMouseLeave={() => setBannerPaused(false)} onFocus={() => setBannerPaused(true)} onBlur={() => setBannerPaused(false)}>
            {/* Crossfade layers */}
            {banners.map((banner, i) => {
              return (
                <Link key={i} href={banner.href}
                  className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${bannerIdx === i ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                  aria-hidden={bannerIdx !== i}
                  tabIndex={bannerIdx === i ? 0 : -1}
                >
                  <div className="h-full bg-gray-900 dark:bg-gray-800 px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-[15px] font-bold text-white">{banner.title}</p>
                      <p className="text-[12px] text-gray-400 mt-1">{banner.desc}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
            {/* Indicator dots */}
            <div className="absolute bottom-2.5 right-4 flex gap-1 z-20">
              {banners.map((_, i) => (
                <button key={i} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBannerIdx(i); }}
                  aria-label={`배너 ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${bannerIdx === i ? 'w-4 bg-white' : 'w-1.5 bg-white/30'}`} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ ZONE 2: 매치 탐색 (핵심 기능) ═══ */}
      <section className="mt-6 px-5 lg:px-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-0.5">
          {sportFilters.map((type) => (
            <button key={type} onClick={() => handleSportClick(type)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                activeSport === type
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}>
              {type === 'all' ? '전체' : sportLabel[type]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-3 px-5 lg:px-0">
        <SectionHeader
          title={activeSport === 'all' ? '추천 매치' : `${sportLabel[activeSport]} 매치`}
          count={filteredMatches.length}
          href={activeSport === 'all' ? '/matches' : `/matches?sport=${activeSport}`}
        />
        {isLoading ? (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
            {[1,2,3].map(i => <div key={i} className="h-[92px] rounded-xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer" />)}
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 py-10 text-center">
            <p className="text-[14px] text-gray-500">{activeSport === 'all' ? '매치가 없어요' : `${sportLabel[activeSport]} 매치가 없어요`}</p>
            {activeSport !== 'all' && <button onClick={() => setActiveSport('all')} className="mt-1.5 text-[12px] text-blue-500">전체 보기</button>}
          </div>
        ) : (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
            {filteredMatches.slice(0, 6).map((m: Match) => <MatchCard key={m.id} match={m} />)}
          </div>
        )}
      </section>

      {/* ═══ ZONE 3: 탐색 섹션 (팀 · 강좌 · 장터) — 배경 구분 ═══ */}
      <div className="mt-8 bg-gray-50/50 dark:bg-gray-800/20 py-6">
        {/* 팀 — 텍스트 카드 */}
        {teams.length > 0 && (
          <section className="px-5 lg:px-0">
            <SectionHeader title="활동 중인 팀" href="/teams" showMore={teams.length > 3} />
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 lg:grid lg:grid-cols-3 lg:gap-3">
              {teams.map((t: SportTeam) => (
                <Link key={t.id} href={`/teams/${t.id}`} className="shrink-0 w-[200px] lg:w-auto">
                  <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-750 active:scale-[0.98] transition-colors h-full">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
                      {t.isRecruiting && <span className="text-[10px] font-medium text-blue-500 shrink-0 ml-1">모집중</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">{sportLabel[t.sportType]} · {t.memberCount}명</p>
                    {t.description && <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">{t.description}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 강좌 — 텍스트 카드 */}
        {lessons.length > 0 && (
          <section className="mt-6 px-5 lg:px-0">
            <SectionHeader title="추천 강좌" href="/lessons" showMore={lessons.length > 3} />
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 lg:grid lg:grid-cols-3 lg:gap-3">
              {lessons.map((l: Lesson) => (
                <Link key={l.id} href={`/lessons/${l.id}`} className="shrink-0 w-[200px] lg:w-auto">
                  <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-750 active:scale-[0.98] transition-colors h-full">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{l.title}</p>
                    <p className="text-[11px] text-gray-500 mt-1">{sportLabel[l.sportType]} · {formatCurrency(l.fee)}</p>
                    {l.coachName && <p className="text-[11px] text-gray-500 mt-0.5">코치 {l.coachName}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 장터 — 이미지 그리드 (상품은 이미지가 핵심) */}
        {listings.length > 0 && (
          <section className="mt-6 px-5 lg:px-0">
            <SectionHeader title="최신 장터" href="/marketplace" showMore={listings.length > 3} />
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
              {listings.map((item: MarketplaceListing) => (
                <Link key={item.id} href={`/marketplace/${item.id}`}>
                  <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-750 active:scale-[0.98] transition-colors">
                    <div className="aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <img src={getListingImage(item.imageUrls)} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="p-2.5">
                      <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                      <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(item.price)}</p>
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
        <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">{title}</h2>
        {count !== undefined && count > 0 && <span className="text-[12px] text-gray-500">{count}</span>}
      </div>
      {showMore && (
        <Link href={href} className="text-[12px] text-gray-500 hover:text-gray-600 transition-colors flex items-center">
          더보기 <ChevronRight size={12} className="ml-0.5" />
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
      <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden flex hover:bg-gray-50 dark:hover:bg-gray-750 active:scale-[0.98] transition-colors">
        {/* 이미지: 정사각형 고정 */}
        <div className="w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
          <img src={getSportImage(match.sportType, match.imageUrl)} alt={match.title} className="w-full h-full object-cover" loading="lazy" />
          {timeBadge && (
            <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-gray-900/70 text-white rounded-md px-1.5 py-0.5">{timeBadge.text}</span>
          )}
        </div>
        {/* 텍스트 */}
        <div className="flex-1 bg-white dark:bg-gray-800 p-3 min-w-0 flex flex-col justify-center">
          <p className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate">
            {match.title.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {sportLabel[match.sportType]} · {formatMatchDate(match.matchDate)} {match.startTime}
          </p>
          {match.venue?.name && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{match.venue.name}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[12px] font-semibold ${isAlmostFull ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {match.currentPlayers}/{match.maxPlayers}명
            </span>
            <span className="text-[11px] text-gray-500">{formatCurrency(match.fee)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
});
