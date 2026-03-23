'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal, Calendar, MapPin, Users } from 'lucide-react';
import { useMatches } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import type { Match } from '@/types/api';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'soccer', label: '축구' },
  { key: 'futsal', label: '풋살' },
  { key: 'basketball', label: '농구' },
  { key: 'badminton', label: '배드민턴' },
  { key: 'ice_hockey', label: '아이스하키' },
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

export default function MatchesPage() {
  const [activeSport, setActiveSport] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'deadline'>('latest');
  const { toast } = useToast();
  const params = activeSport ? { sportType: activeSport } : undefined;
  const { data, isLoading } = useMatches(params);
  const allMatches = data?.items ?? [];
  let matches = searchQuery
    ? allMatches.filter((m: Match) =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.venue?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allMatches;
  if (dateFilter) {
    matches = matches.filter((m: Match) => m.matchDate?.startsWith(dateFilter));
  }
  if (sortBy === 'deadline') {
    matches = [...matches].sort((a: Match, b: Match) => {
      const fa = a.currentPlayers / a.maxPlayers;
      const fb = b.currentPlayers / b.maxPlayers;
      return fb - fa;
    });
  }

  return (
    <div className="pt-[var(--safe-area-top)]">
      <header className="px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900">매치 찾기</h1>
      </header>

      {/* 검색바 */}
      <div className="px-5 lg:px-0 mb-3">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="지역, 시설명 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-gray-50 py-3 pl-10 pr-4 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border focus:border-blue-200 transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex h-[46px] w-[46px] items-center justify-center rounded-xl transition-colors ${showFilters ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-500 active:bg-gray-100'}`}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* 필터 칩 */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveSport(f.key)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
              activeSport === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 상세 필터 패널 */}
      {showFilters && (
        <div className="px-5 lg:px-0 mb-4">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">날짜</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">정렬</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSortBy('latest')}
                  className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${sortBy === 'latest' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                >
                  최신순
                </button>
                <button
                  onClick={() => setSortBy('deadline')}
                  className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${sortBy === 'deadline' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
                >
                  마감임박
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isLoading && matches.length > 0 && (
        <div className="px-5 lg:px-0 mb-3">
          <p className="text-[13px] text-gray-400">{matches.length}개의 매치</p>
        </div>
      )}

      {/* 매치 리스트 */}
      <div className="px-5 lg:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[130px] animate-pulse rounded-2xl bg-gray-50" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Search size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">
              {activeSport ? `${sportLabel[activeSport]} 매치가 없어요` : '매치가 없어요'}
            </p>
            <p className="text-[13px] text-gray-400 mt-1">다른 종목을 선택하거나 직접 매치를 만들어보세요</p>
          </div>
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {matches.map((match: Match) => {
              const filledPercent = (match.currentPlayers / match.maxPlayers) * 100;
              const isAlmostFull = filledPercent >= 70;
              const SportIcon = SportIconMap[match.sportType];

              return (
                <Link key={match.id} href={`/matches/${match.id}`}>
                  <div className="rounded-2xl bg-white border border-gray-100 p-4 transition-all duration-200 active:scale-[0.98] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5">
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
                        <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-500">마감임박</span>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-4">
                      <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                        <Calendar size={15} className="text-gray-400" />
                        <span>{formatMatchDate(match.matchDate)} {match.startTime}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                        <MapPin size={15} className="text-gray-400" />
                        <span className="truncate">{match.venue?.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                        <Users size={15} className="text-gray-400" />
                        <span className={isAlmostFull ? 'text-red-500 font-medium' : ''}>{match.currentPlayers}/{match.maxPlayers}명</span>
                      </div>
                      <div className="text-[13px]">
                        <span className="font-semibold text-gray-800">{formatCurrency(match.fee)}</span>
                        <span className="text-gray-300 mx-1">·</span>
                        <span className="text-gray-400">{levelLabel[match.levelMin]}~{levelLabel[match.levelMax]}</span>
                      </div>
                    </div>

                    <div className="mt-3 h-[3px] rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isAlmostFull ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${filledPercent}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-6" />
    </div>
  );
}
