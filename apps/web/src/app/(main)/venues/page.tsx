'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Star, Clock, SlidersHorizontal } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useToast } from '@/components/ui/toast';
import { useVenues } from '@/hooks/use-api';
import type { Venue } from '@/types/api';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'futsal', label: '풋살' },
  { key: 'basketball', label: '농구' },
  { key: 'badminton', label: '배드민턴' },
  { key: 'ice_hockey', label: '아이스하키' },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};

const cities = ['전체', '서울', '경기', '인천', '부산', '대구', '대전', '광주'];

export default function VenuesPage() {
  const [activeSport, setActiveSport] = useState('');
  const [activeCity, setActiveCity] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const queryParams: Record<string, string> = {};
  if (activeSport) queryParams.sportType = activeSport;
  if (activeCity) queryParams.city = activeCity;

  const { data, isLoading } = useVenues(Object.keys(queryParams).length > 0 ? queryParams : undefined);

  const allVenues = data?.items ?? [];
  const venues = searchQuery
    ? allVenues.filter((v: Venue) =>
        v.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.address?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allVenues;

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900">시설 찾기</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">내 주변 스포츠 시설을 찾아보세요</p>
      </header>

      {/* 검색바 */}
      <div className="px-5 lg:px-0 mb-3">
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="시설명, 지역 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-gray-50 py-3 pl-10 pr-4 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border focus:border-blue-200 transition-all"
            />
          </div>
          <button
            onClick={() => toast('info', '상세 필터 기능을 준비 중입니다')}
            className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-gray-50 text-gray-500 active:bg-gray-100 transition-colors"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* 종목 필터 */}
      <div className="px-5 lg:px-0 mb-2 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
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

      {/* 지역 필터 */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {cities.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCity(c === '전체' ? '' : c)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
              (activeCity === '' && c === '전체') || activeCity === c
                ? 'bg-blue-50 text-blue-500 border border-blue-200'
                : 'bg-white text-gray-500 border border-gray-100 active:bg-gray-50'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {!isLoading && venues.length > 0 && (
        <div className="px-5 lg:px-0 mb-3">
          <p className="text-[13px] text-gray-400">{venues.length}개의 시설</p>
        </div>
      )}

      {/* 시설 리스트 */}
      <div className="px-5 lg:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[120px] animate-pulse rounded-2xl bg-gray-50" />
            ))}
          </div>
        ) : venues.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <MapPin size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">검색 결과가 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">다른 조건으로 검색해보세요</p>
          </div>
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {venues.map((venue: Venue) => {
              const primarySport = venue.sportTypes?.[0];
              const SportIcon = primarySport ? SportIconMap[primarySport] : null;
              return (
                <Link key={venue.id} href={`/venues/${venue.id}`}>
                  <div className="rounded-2xl bg-white border border-gray-100 p-4 transition-all active:scale-[0.98] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 duration-200">
                    <div className="flex gap-4">
                      <div className="flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-300">
                        {SportIcon ? <SportIcon size={32} /> : <MapPin size={32} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-semibold text-gray-900 truncate">{venue.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {venue.sportTypes?.map((s: string) => (
                            <span key={s} className="text-[11px] text-gray-400">{sportLabel[s] || s}</span>
                          ))}
                        </div>

                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                            <MapPin size={15} className="text-gray-400 shrink-0" />
                            <span className="truncate">{venue.address}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {venue.rating > 0 && (
                              <div className="flex items-center gap-1 text-[13px]">
                                <Star size={13} className="text-amber-400" fill="currentColor" />
                                <span className="font-medium text-gray-700">{venue.rating.toFixed(1)}</span>
                                <span className="text-gray-300">({venue.reviewCount})</span>
                              </div>
                            )}
                            {venue.pricePerHour && (
                              <span className="text-[12px] text-gray-400">시간당 {new Intl.NumberFormat('ko-KR').format(venue.pricePerHour)}원</span>
                            )}
                          </div>
                        </div>
                      </div>
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
