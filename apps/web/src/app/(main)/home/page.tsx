'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useMatches } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ChevronRight, MapPin, Calendar, Users, Clock, Swords, MessageCircle, Building2, UserPlus, Award, Bell, Settings } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import type { Match } from '@/types/api';

const sports = [
  { type: 'soccer', label: '축구', color: 'text-blue-500 bg-blue-50' },
  { type: 'futsal', label: '풋살', color: 'text-blue-500 bg-blue-50' },
  { type: 'basketball', label: '농구', color: 'text-blue-500 bg-blue-50' },
  { type: 'badminton', label: '배드민턴', color: 'text-blue-500 bg-blue-50' },
  { type: 'ice_hockey', label: '하키', color: 'text-blue-500 bg-blue-50' },
  { type: 'figure_skating', label: '피겨', color: 'text-blue-500 bg-blue-50' },
  { type: 'short_track', label: '쇼트트랙', color: 'text-blue-500 bg-blue-50' },
];

const sportLabel: Record<string, string> = {
  soccer: '축구', futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export default function HomePage() {
  const { user, isAuthenticated } = useAuthStore();
  const { data: matchData, isLoading } = useMatches();
  const matches = matchData?.items ?? [];
  const [bannerIndex, setBannerIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setBannerIndex(i => (i + 1) % 3), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pt-[var(--safe-area-top)]">
      {/* Header — mobile only, desktop uses sidebar */}
      <header className="px-5 pt-4 pb-2 lg:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-gray-900">MatchUp</h1>
            {isAuthenticated && user ? (
              <p className="text-[13px] text-gray-500 mt-0.5">{user.nickname}님, 반가워요</p>
            ) : (
              <p className="text-[13px] text-gray-500 mt-0.5">같이 운동할 사람을 찾아보세요</p>
            )}
          </div>
          {!isAuthenticated && (
            <Link href="/login" className="rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white active:bg-gray-800 transition-colors">
              로그인
            </Link>
          )}
        </div>
      </header>

      {/* Desktop greeting */}
      <div className="hidden lg:block mb-6">
        <h2 className="text-[24px] font-bold text-gray-900">
          {isAuthenticated && user ? `${user.nickname}님, 반가워요` : '같이 운동할 사람을 찾아보세요'}
        </h2>
        <p className="text-[14px] text-gray-400 mt-1">AI가 최적의 매치를 추천해드려요</p>
      </div>

      {/* 프로모션 배너 */}
      <section className="mt-3 px-5 lg:px-0">
        <div className="relative overflow-hidden rounded-2xl">
          {/* Banner slides - auto-rotate */}
          {[
            { bg: 'from-blue-500 to-blue-600', title: '팀 매칭 오픈!', desc: '실력등급(S~D)으로 딱 맞는 상대를 찾아보세요', cta: '팀 매칭 →', href: '/team-matches' },
            { bg: 'from-gray-800 to-gray-900', title: '첫 매치 참가비 무료', desc: '지금 가입하고 첫 매치를 무료로 즐기세요', cta: '매치 찾기 →', href: '/matches' },
            { bg: 'from-green-500 to-green-600', title: '용병 모집 중', desc: '팀에 빈 자리가 있나요? 용병을 구해보세요', cta: '용병 찾기 →', href: '/mercenary' },
          ].filter((_, i) => i === bannerIndex).map((banner) => (
            <Link key={banner.href} href={banner.href}>
              <div className={`bg-gradient-to-r ${banner.bg} p-6 lg:p-8 text-white`}>
                <p className="text-[12px] font-medium text-white/60 uppercase tracking-wider">EVENT</p>
                <h3 className="text-[20px] lg:text-[24px] font-bold mt-1">{banner.title}</h3>
                <p className="text-[14px] text-white/80 mt-1">{banner.desc}</p>
                <span className="inline-block mt-3 text-[13px] font-semibold text-white/90 border border-white/30 rounded-lg px-4 py-1.5 hover:bg-white/10 transition-colors">{banner.cta}</span>
              </div>
            </Link>
          ))}
          {/* Dots indicator */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {[0, 1, 2].map(i => (
              <button key={i} onClick={() => setBannerIndex(i)} className={`h-1.5 rounded-full transition-all ${bannerIndex === i ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`} />
            ))}
          </div>
        </div>
      </section>

      {/* 종목 선택 */}
      <section className="mt-5 lg:mt-0 px-5 lg:px-0">
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
          {sports.map((sport) => {
            const Icon = SportIconMap[sport.type];
            return (
              <Link key={sport.type} href={`/matches?sport=${sport.type}`} className="flex flex-col items-center gap-2 shrink-0">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-transform active:scale-90 ${sport.color}`}>
                  {Icon && <Icon size={26} />}
                </div>
                <span className="text-[11px] font-medium text-gray-600">{sport.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Desktop: 팀 매칭 프로모 카드 */}
      <section className="hidden lg:block mt-6">
        <Link href="/team-matches" className="block rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 p-5 text-white hover:from-blue-600 hover:to-blue-700 transition-all">
          <h3 className="text-[16px] font-bold">⚽ 팀 매칭</h3>
          <p className="text-[13px] text-white/70 mt-1">우리 팀 상대를 찾고 있나요? 실력등급(S~D)으로 딱 맞는 상대를 매칭하세요</p>
        </Link>
      </section>

      <div className="mt-6 h-2 bg-gray-50 lg:hidden" />

      {/* 모집 중인 매치 */}
      <section className="mt-5 px-5 lg:px-0 lg:mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold text-gray-900">모집 중인 매치</h2>
          <Link href="/matches" className="flex items-center text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
            전체보기
            <ChevronRight size={14} className="ml-0.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[130px] animate-pulse rounded-2xl bg-gray-50" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-10 text-center">
            <p className="text-[15px] font-medium text-gray-600">아직 매치가 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">첫 번째 매치를 만들어보세요!</p>
          </div>
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {matches.map((match: Match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </section>

      {/* 모바일 빠른 메뉴 — 사이드바에만 있는 기능들 */}
      <section className="lg:hidden mt-5 px-5">
        <div className="h-2 bg-gray-50 -mx-5 mb-5" />
        <h2 className="text-[17px] font-bold text-gray-900 mb-3">더 많은 기능</h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { href: '/team-matches', icon: Swords, label: '팀 매칭' },
            { href: '/teams', icon: Users, label: '팀·클럽' },
            { href: '/chat', icon: MessageCircle, label: '채팅' },
            { href: '/venues', icon: Building2, label: '시설' },
            { href: '/mercenary', icon: UserPlus, label: '용병' },
            { href: '/badges', icon: Award, label: '뱃지' },
            { href: '/notifications', icon: Bell, label: '알림' },
            { href: '/settings', icon: Settings, label: '설정' },
          ].map(item => (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-gray-50 transition-colors">
              <item.icon size={22} className="text-gray-500" />
              <span className="text-[11px] text-gray-600 font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="h-8" />
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const filledPercent = (match.currentPlayers / match.maxPlayers) * 100;
  const isAlmostFull = filledPercent >= 70;
  const SportIcon = SportIconMap[match.sportType];

  return (
    <Link href={`/matches/${match.id}`}>
      <div className="rounded-2xl bg-white border border-gray-100 p-4 transition-all duration-200 active:scale-[0.98] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {SportIcon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                <SportIcon size={18} />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-gray-900 truncate">{match.title.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}</h3>
              <span className="text-[12px] text-gray-400">{sportLabel[match.sportType]}</span>
            </div>
          </div>
          {isAlmostFull && (
            <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-500">
              마감임박
            </span>
          )}
        </div>

        {/* Details */}
        <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-4">
          <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
            <Calendar size={15} className="text-gray-400 shrink-0" />
            <span>{formatMatchDate(match.matchDate)} {match.startTime}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
            <MapPin size={15} className="text-gray-400 shrink-0" />
            <span className="truncate">{match.venue?.name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
            <Users size={15} className="text-gray-400 shrink-0" />
            <span className={isAlmostFull ? 'text-red-500 font-medium' : ''}>
              {match.currentPlayers}/{match.maxPlayers}명
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
            <span className="text-[12px] font-semibold text-gray-800">{formatCurrency(match.fee)}</span>
            <span className="text-gray-300">·</span>
            <span className="text-[12px]">{levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-[3px] rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isAlmostFull ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${filledPercent}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
