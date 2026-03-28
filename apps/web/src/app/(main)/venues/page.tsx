'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Plus, Star, MapPin } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useVenues } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toast';
import { sportLabel } from '@/lib/constants';
import { getSportImage } from '@/lib/sport-image';
import type { Venue } from '@/types/api';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'futsal', label: '풋살' },
  { key: 'basketball', label: '농구' },
  { key: 'badminton', label: '배드민턴' },
  { key: 'ice_hockey', label: '아이스하키' },
  { key: 'swimming', label: '수영' },
  { key: 'tennis', label: '테니스' },
];

const cities = ['전체', '서울', '경기', '인천', '부산', '대구'];

const fallbackVenues: Venue[] = [
  { id: 'v-1', name: '마포 풋살파크', type: 'futsal_court', sportTypes: ['futsal'], address: '서울시 마포구 월드컵로 20', city: '서울', district: '마포구', lat: 37.5533, lng: 126.8948, phone: '02-1234-5678', rating: 4.3, reviewCount: 28, pricePerHour: 120000, facilities: ['주차장', '샤워실', '탈의실'], operatingHours: {}, description: '깨끗한 인조잔디 풋살장', imageUrls: [] },
  { id: 'v-2', name: '강남 스포츠센터', type: 'gymnasium', sportTypes: ['basketball', 'badminton'], address: '서울시 강남구 테헤란로 110', city: '서울', district: '강남구', lat: 37.4989, lng: 127.0328, phone: '02-2345-6789', rating: 4.1, reviewCount: 45, pricePerHour: 80000, facilities: ['주차장', '샤워실', '매점'], operatingHours: {}, description: '다목적 체육관', imageUrls: [] },
  { id: 'v-3', name: '잠실 아이스링크', type: 'ice_rink', sportTypes: ['ice_hockey', 'figure_skating'], address: '서울시 송파구 올림픽로 25', city: '서울', district: '송파구', lat: 37.5148, lng: 127.0725, phone: '02-3456-7890', rating: 4.6, reviewCount: 18, pricePerHour: 200000, facilities: ['주차장', '샤워실', '대여'], operatingHours: {}, description: '국제규격 아이스링크', imageUrls: [] },
  { id: 'v-4', name: '영등포 배드민턴클럽', type: 'badminton_court', sportTypes: ['badminton'], address: '서울시 영등포구 여의대방로 30', city: '서울', district: '영등포구', lat: 37.5189, lng: 126.9074, phone: '02-4567-8901', rating: 3.9, reviewCount: 12, pricePerHour: 30000, facilities: ['주차장', '샤워실'], operatingHours: {}, description: '실내 배드민턴 전용코트 6면', imageUrls: [] },
  { id: 'v-5', name: '노원 축구전용구장', type: 'gymnasium', sportTypes: ['futsal', 'soccer'], address: '서울시 노원구 동일로 1000', city: '서울', district: '노원구', lat: 37.6543, lng: 127.0568, phone: '02-5678-9012', rating: 4.4, reviewCount: 32, pricePerHour: 200000, facilities: ['주차장', '샤워실', '탈의실', '매점'], operatingHours: {}, description: '인조잔디 대형 풋살/축구장', imageUrls: [] },
  { id: 'v-6', name: '서초 테니스코트', type: 'tennis_court', sportTypes: ['tennis'], address: '서울시 서초구 반포대로 50', city: '서울', district: '서초구', lat: 37.4837, lng: 127.0074, phone: '02-6789-0123', rating: 4.5, reviewCount: 22, pricePerHour: 40000, facilities: ['주차장', '샤워실'], operatingHours: {}, description: '하드코트 4면 보유', imageUrls: [] },
];

export default function VenuesPage() {
  const [activeSport, setActiveSport] = useState('');
  const [activeCity, setActiveCity] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { toast } = useToast();

  const queryParams: Record<string, string> = {};
  if (activeSport) queryParams.sportType = activeSport;
  if (activeCity) queryParams.city = activeCity;

  const { data, isLoading, error, refetch } = useVenues(Object.keys(queryParams).length > 0 ? queryParams : undefined);

  const apiVenues = data?.items ?? [];
  const allVenues = apiVenues.length > 0 ? apiVenues : fallbackVenues;

  let venues = allVenues;
  if (activeSport) venues = venues.filter((v: Venue) => v.sportTypes?.includes(activeSport));
  if (activeCity) venues = venues.filter((v: Venue) => v.city === activeCity);
  if (debouncedSearch) {
    const q = debouncedSearch.toLowerCase();
    venues = venues.filter((v: Venue) => v.name?.toLowerCase().includes(q) || v.address?.toLowerCase().includes(q));
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">시설 찾기</h1>
          <p className="text-sm text-gray-500 mt-0.5">내 주변 스포츠 시설을 찾아보세요</p>
        </div>
        <button onClick={() => toast('info', '시설 등록 요청이 접수되면 검토 후 추가됩니다. teammeet@support.com으로 시설 정보를 보내주세요.')}
          className="flex items-center gap-1 rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <Plus size={12} /> 시설 등록 요청
        </button>
      </header>

      <div className="px-5 @3xl:px-0 mb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input type="text" placeholder="시설명, 지역 검색" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 py-3 pl-10 pr-4 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-900 transition-colors" />
        </div>
      </div>

      <div className="px-5 @3xl:px-0 mb-2 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button key={f.key} onClick={() => setActiveSport(f.key)}
            className={`shrink-0 min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSport === f.key ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-5 @3xl:px-0 mb-4 flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {cities.map((c) => (
          <button key={c} onClick={() => setActiveCity(c === '전체' ? '' : c)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              (activeCity === '' && c === '전체') || activeCity === c
                ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900'
                : 'text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}>
            {c}
          </button>
        ))}
      </div>

      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
            {[1, 2, 3].map(i => <div key={i} className="h-[92px] rounded-xl bg-gray-50 dark:bg-gray-800 skeleton-shimmer" />)}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : venues.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="검색 결과가 없어요"
            description="다른 조건으로 검색해보세요"
            size="sm"
          />
        ) : (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
            {venues.map((venue: Venue) => {
              const primarySport = venue.sportTypes?.[0] || 'soccer';
              return (
                <Link key={venue.id} href={`/venues/${venue.id}`}>
                  <div className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden flex hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors">
                    {/* 이미지 */}
                    <div className="w-28 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <img src={venue.imageUrls?.[0] || getSportImage(primarySport)} alt={venue.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    {/* 텍스트 */}
                    <div className="flex-1 bg-white dark:bg-gray-800 p-3 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{venue.name}</h3>
                        {venue.rating > 0 && (
                          <span className="shrink-0 flex items-center gap-0.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
                            <Star size={10} fill="currentColor" className="text-amber-400" />
                            {venue.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {venue.sportTypes?.map((s: string) => sportLabel[s] || s).join(' · ')}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 truncate">{venue.address}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        {venue.pricePerHour && <span>{new Intl.NumberFormat('ko-KR').format(venue.pricePerHour)}원/시간</span>}
                        {venue.reviewCount > 0 && <><span className="text-gray-200">·</span><span>리뷰 {venue.reviewCount}</span></>}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
