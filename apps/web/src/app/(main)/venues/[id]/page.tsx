'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ChevronRight, MapPin, Star, Clock, Phone, Users,
  Calendar, Check, Share2, PenLine, Trophy, DollarSign,
} from 'lucide-react';
import { MapPlaceholder } from '@/components/ui/map-placeholder';
import { ReviewForm } from '@/components/venue/review-form';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};

const dayLabels: Record<string, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
  weekday: '평일', weekend: '주말',
};

const facilityColors: Record<string, string> = {
  '주차장': 'bg-blue-50 text-blue-600 border-blue-100',
  '샤워실': 'bg-cyan-50 text-cyan-600 border-cyan-100',
  '탈의실': 'bg-violet-50 text-violet-600 border-violet-100',
  '음수대': 'bg-sky-50 text-sky-600 border-sky-100',
  '관람석': 'bg-amber-50 text-amber-600 border-amber-100',
  '조명': 'bg-yellow-50 text-yellow-600 border-yellow-100',
  '냉난방': 'bg-red-50 text-red-600 border-red-100',
  '매점': 'bg-emerald-50 text-emerald-600 border-emerald-100',
  '와이파이': 'bg-indigo-50 text-indigo-600 border-indigo-100',
  'AED': 'bg-rose-50 text-rose-600 border-rose-100',
  '장비대여': 'bg-orange-50 text-orange-600 border-orange-100',
  '정빙기': 'bg-teal-50 text-teal-600 border-teal-100',
};

function getDefaultFacilityColor() {
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

// Mock venue data
const mockVenue = {
  id: 'venue-001',
  name: '서울숲 풋살파크',
  sportType: 'futsal',
  sportTypes: ['futsal'],
  rating: 4.3,
  reviewCount: 48,
  address: '서울특별시 성동구 뚝섬로 273',
  lat: 37.5445,
  lng: 127.0374,
  phone: '02-1234-5678',
  description: '서울숲 인근에 위치한 최신식 인조잔디 풋살장입니다. A, B 2개 코트를 보유하고 있으며 야간 조명 및 주차장을 완비하고 있습니다.',
  pricePerHour: 100000,
  operatingHours: {
    weekday: { open: '06:00', close: '23:00' },
    weekend: { open: '07:00', close: '22:00' },
  },
  facilities: ['주차장', '샤워실', '탈의실', '조명', '음수대', '매점', '와이파이'],
  reviews: [
    {
      id: 'r1',
      rating: 5,
      content: '잔디 상태 최고입니다! 주차도 넉넉하고 샤워실도 깨끗해요.',
      user: { nickname: '풋살왕김씨' },
      createdAt: '2026-03-10',
    },
    {
      id: 'r2',
      rating: 4,
      content: '위치가 좋고 시설이 깔끔해요. 다만 주말 저녁 예약이 힘듭니다.',
      user: { nickname: '공차는민수' },
      createdAt: '2026-03-05',
    },
    {
      id: 'r3',
      rating: 4,
      content: '가격 대비 만족스러운 시설입니다. 야간 조명이 밝아서 좋아요.',
      user: { nickname: '풋살러이준' },
      createdAt: '2026-02-28',
    },
  ],
};

const mockUpcomingMatches = [
  {
    id: 'tm-101',
    title: '서울 FC vs 강남 유나이티드',
    matchDate: '2026-03-22',
    startTime: '14:00',
    sportType: 'futsal',
    homeTeam: '서울 FC',
    awayTeam: '강남 유나이티드',
    status: 'recruiting',
  },
  {
    id: 'tm-102',
    title: '성동 킥커스 vs TBD',
    matchDate: '2026-03-23',
    startTime: '10:00',
    sportType: 'futsal',
    homeTeam: '성동 킥커스',
    awayTeam: null,
    status: 'recruiting',
  },
  {
    id: 'tm-103',
    title: '뚝섬 FC vs 왕십리 풋살',
    matchDate: '2026-03-29',
    startTime: '18:00',
    sportType: 'futsal',
    homeTeam: '뚝섬 FC',
    awayTeam: '왕십리 풋살',
    status: 'matched',
  },
];

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

export default function VenueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Using mock data
  const venue = mockVenue;

  const operatingHours = venue.operatingHours as Record<string, { open: string; close: string }> | null;

  function handleReviewSubmit(data: any) {
    // In real implementation, this would call an API
    console.log('Review submitted:', data);
    setShowReviewForm(false);
  }

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900 truncate flex-1 ml-3">{venue.name}</h1>
        <button className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
          <Share2 size={18} className="text-gray-500" />
        </button>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/venues" className="hover:text-gray-600 transition-colors">시설 찾기</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{venue.name}</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
        {/* Left: Venue info */}
        <div className="px-5 lg:px-0">
          {/* Map Placeholder */}
          <div className="mb-4">
            <MapPlaceholder
              lat={venue.lat}
              lng={venue.lng}
              address={venue.address}
              name={venue.name}
              height={220}
            />
          </div>

          {/* Title card */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] font-medium text-blue-500">{sportLabel[venue.sportType]}</span>
              {venue.rating > 0 && (
                <div className="flex items-center gap-1 text-[13px]">
                  <Star size={13} className="text-amber-400" fill="currentColor" />
                  <span className="font-medium text-gray-700">{venue.rating.toFixed(1)}</span>
                  {venue.reviewCount > 0 && (
                    <span className="text-gray-400">({venue.reviewCount})</span>
                  )}
                </div>
              )}
            </div>
            <h2 className="text-[22px] font-bold text-gray-900">{venue.name}</h2>

            {venue.description && (
              <p className="mt-3 text-[14px] text-gray-600 leading-relaxed">{venue.description}</p>
            )}
          </div>

          {/* Info cards */}
          <div className="space-y-3 mb-3">
            <div className="rounded-2xl bg-white border border-gray-100 p-4">
              <div className="space-y-3">
                {/* Address */}
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] text-gray-400">주소</p>
                    <p className="text-[15px] text-gray-900 mt-0.5">{venue.address}</p>
                  </div>
                </div>

                {/* Operating Hours - nicely formatted */}
                {operatingHours && (
                  <div className="flex items-start gap-3">
                    <Clock size={18} className="text-gray-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[13px] text-gray-400 mb-2">운영 시간</p>
                      <div className="space-y-1.5">
                        {Object.entries(operatingHours).map(([day, hours]) => {
                          const label = dayLabels[day] || day;
                          return (
                            <div
                              key={day}
                              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                            >
                              <span className="text-[13px] font-medium text-gray-700">{label}</span>
                              <span className="text-[13px] text-gray-600">{hours.open} ~ {hours.close}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Price */}
                {venue.pricePerHour && (
                  <div className="flex items-start gap-3">
                    <DollarSign size={18} className="text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] text-gray-400">이용 요금</p>
                      <p className="text-[15px] text-gray-900 mt-0.5">
                        시간당 {new Intl.NumberFormat('ko-KR').format(venue.pricePerHour)}원
                      </p>
                    </div>
                  </div>
                )}

                {/* Phone */}
                {venue.phone && (
                  <div className="flex items-start gap-3">
                    <Phone size={18} className="text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] text-gray-400">전화번호</p>
                      <a href={`tel:${venue.phone}`} className="text-[15px] text-blue-500 mt-0.5 block">
                        {venue.phone}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Facilities - colored tags */}
          {venue.facilities && venue.facilities.length > 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 p-4 mb-3">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">시설 정보</h3>
              <div className="flex flex-wrap gap-2">
                {venue.facilities.map((facility: string) => {
                  const color = facilityColors[facility] || getDefaultFacilityColor();
                  return (
                    <span
                      key={facility}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium ${color}`}
                    >
                      <Check size={14} />
                      {facility}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reviews */}
          {venue.reviews && venue.reviews.length > 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-gray-900">
                  리뷰 ({venue.reviews.length})
                </h3>
                <div className="flex items-center gap-1 text-[13px]">
                  <Star size={13} className="text-amber-400" fill="currentColor" />
                  <span className="font-semibold text-gray-700">{venue.rating.toFixed(1)}</span>
                </div>
              </div>
              <div className="space-y-4">
                {venue.reviews.slice(0, 5).map((review: any) => (
                  <div key={review.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500">
                        {review.user?.nickname?.charAt(0)}
                      </div>
                      <span className="text-[13px] font-medium text-gray-700">{review.user?.nickname}</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={11}
                            className={i < review.rating ? 'text-amber-400' : 'text-gray-200'}
                            fill={i < review.rating ? 'currentColor' : 'none'}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-gray-300 ml-auto">{review.createdAt}</span>
                    </div>
                    <p className="text-[14px] text-gray-600 leading-relaxed">{review.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review Form Toggle */}
          <div className="mb-3">
            {!showReviewForm ? (
              <button
                onClick={() => setShowReviewForm(true)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-3.5 text-[14px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <PenLine size={16} className="text-blue-500" />
                리뷰 쓰기
              </button>
            ) : (
              <ReviewForm
                venueId={venueId}
                venueType={venue.sportType === 'ice_hockey' ? 'ice_rink' : 'field'}
                onSubmit={handleReviewSubmit}
                onCancel={() => setShowReviewForm(false)}
              />
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="px-5 lg:px-0 mt-4 lg:mt-0">
          {/* Upcoming team matches at this venue */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4 sticky top-4 mb-4">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Trophy size={16} className="text-blue-500" />
              이 구장 예정 경기
            </h3>
            {mockUpcomingMatches.length > 0 ? (
              <div className="space-y-2.5">
                {mockUpcomingMatches.map((match) => {
                  const statusMap: Record<string, { label: string; className: string }> = {
                    recruiting: { label: '모집중', className: 'bg-blue-50 text-blue-500' },
                    matched: { label: '매칭완료', className: 'bg-green-50 text-green-600' },
                  };
                  const status = statusMap[match.status] ?? statusMap.recruiting;

                  return (
                    <Link
                      key={match.id}
                      href={`/team-matches/${match.id}`}
                      className="block rounded-xl bg-gray-50 p-3 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-[14px] font-medium text-gray-900 truncate flex-1">
                          {match.title}
                        </p>
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-gray-400">
                        <Calendar size={11} className="shrink-0" />
                        <span>{formatMatchDate(match.matchDate)} {match.startTime}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[12px] text-gray-500">
                        <Users size={11} className="shrink-0" />
                        <span>{match.homeTeam}</span>
                        <span className="text-gray-300">vs</span>
                        <span>{match.awayTeam ?? '상대팀 모집중'}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 p-6 text-center">
                <Calendar size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-400">예정된 경기가 없어요</p>
              </div>
            )}

            <Link
              href="/team-matches/new"
              className="block w-full text-center rounded-xl bg-blue-500 py-3 text-[14px] font-semibold text-white hover:bg-blue-600 transition-colors mt-3"
            >
              이 구장에서 경기 만들기
            </Link>
          </div>
        </div>
      </div>

      <div className="h-8" />
    </div>
  );
}
