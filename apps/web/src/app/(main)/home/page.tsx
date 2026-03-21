'use client';

import Link from 'next/link';
import { useMatches } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ChevronRight, MapPin, Calendar, Users, Clock } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';

const sports = [
  { type: 'futsal', label: '풋살', color: 'text-blue-500 bg-blue-50' },
  { type: 'basketball', label: '농구', color: 'text-blue-500 bg-blue-50' },
  { type: 'badminton', label: '배드민턴', color: 'text-blue-500 bg-blue-50' },
  { type: 'ice_hockey', label: '하키', color: 'text-blue-500 bg-blue-50' },
  { type: 'figure_skating', label: '피겨', color: 'text-blue-500 bg-blue-50' },
  { type: 'short_track', label: '쇼트트랙', color: 'text-blue-500 bg-blue-50' },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
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
            {matches.map((match: any) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </section>

      <div className="h-8" />
    </div>
  );
}

function MatchCard({ match }: { match: any }) {
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
