'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ChevronRight, MapPin, Star, Clock, Phone, Users,
  Calendar, Check, Share2, PenLine, Trophy, DollarSign, MessageSquareOff,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import type { Venue } from '@/types/api';
import { MapPlaceholder } from '@/components/ui/map-placeholder';
import { KakaoMap } from '@/components/map/kakao-map';
import { ReviewForm, type ReviewData } from '@/components/venue/review-form';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { SafeImage } from '@/components/ui/safe-image';
import { useVenue } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { getVenueImageSet } from '@/lib/sport-image';
import { formatMatchDate } from '@/lib/utils';

const dayLabels: Record<string, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
  weekday: '평일', weekend: '주말',
};

const facilityColors: Record<string, string> = {
  '주차장': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '샤워실': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '탈의실': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '음수대': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '관람석': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '조명': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '냉난방': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '매점': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '와이파이': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  'AED': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '장비대여': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
  '정빙기': 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
};

function getDefaultFacilityColor() {
  return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600';
}

// Mock venue data
const mockVenue = {
  id: 'venue-001',
  name: '서울숲 풋살파크',
  type: 'futsal_court',
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
      comment: '잔디 상태 최고입니다! 주차도 넉넉하고 샤워실도 깨끗해요.',
      user: { nickname: '풋살왕김씨' },
      createdAt: '2026-03-10',
    },
    {
      id: 'r2',
      rating: 4,
      comment: '위치가 좋고 시설이 깔끔해요. 다만 주말 저녁 예약이 힘듭니다.',
      user: { nickname: '공차는민수' },
      createdAt: '2026-03-05',
    },
    {
      id: 'r3',
      rating: 4,
      comment: '가격 대비 만족스러운 시설입니다. 야간 조명이 밝아서 좋아요.',
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

export default function VenueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);

  // Use API hook with mock data fallback
  const { data: apiVenue } = useVenue(venueId);
  const venue = (apiVenue || mockVenue) as Venue & { sportType?: string; reviews?: Array<{ id: string; rating: number; comment: string | null; createdAt: string; user?: { id?: string; nickname: string; profileImageUrl?: string | null } }> };

  const venueRating = venue.rating ?? 0;
  const venueReviewCount = venue.reviewCount ?? 0;
  const venueFacilities = venue.facilities ?? [];
  const venueReviews = venue.reviews ?? [];
  const venuePhone = venue.phone || null;
  const venueDescription = venue.description || null;
  const venuePricePerHour = venue.pricePerHour ?? null;
  const operatingHours = venue.operatingHours as Record<string, { open: string; close: string }> | null;
  const primarySport = venue.sportType || venue.sportTypes?.[0] || 'soccer';
  const venueImages = getVenueImageSet(primarySport, venue.imageUrls, venue.id, 3);
  const fallbackVenueImages = getVenueImageSet(primarySport, undefined, `${venue.id}-fallback`, 3);
  const mediaImages = venueImages.filter((image): image is string => Boolean(image)).map((image, index) => ({
    src: image,
    alt: `${venue.name} 이미지 ${index + 1}`,
    fallbackSrc: fallbackVenueImages[index] ?? fallbackVenueImages[0],
  }));
  const heroImage = selectedImage || venueImages[0];

  const heroMediaIndex = mediaImages.findIndex((image) => image.src === heroImage);

  useEffect(() => {
    setSelectedImage(venueImages[0] ?? null);
  }, [venueId, venueImages[0]]);

  function openHeroImage() {
    if (mediaImages.length === 0) return;
    setMediaIndex(Math.max(heroMediaIndex, 0));
    setShowMediaLightbox(true);
  }

  function openMediaBySource(src: string) {
    const index = mediaImages.findIndex((image) => image.src === src);
    if (index < 0) return;
    setSelectedImage(src);
    setMediaIndex(index);
    setShowMediaLightbox(true);
  }

  function handleReviewSubmit(data: ReviewData) {
    // In real implementation, this would call an API
    setShowReviewForm(false);
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in dark:bg-gray-900">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center justify-between px-5 py-3 sticky top-0 bg-white dark:bg-gray-800/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1 ml-3">{venue.name}</h1>
        <button aria-label="공유하기" className="rounded-xl p-2 hover:bg-gray-100 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center">
          <Share2 size={18} className="text-gray-500" />
        </button>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/venues" className="hover:text-gray-600 transition-colors">시설 찾기</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{venue.name}</span>
      </div>

      <div className="@3xl:grid @3xl:grid-cols-[1fr_380px] @3xl:gap-8">
        {/* Left: Venue info */}
        <div className="px-5 @3xl:px-0">
          <div className="mb-4">
            {heroImage && (
              <button
                type="button"
                onClick={openHeroImage}
                aria-label={`${venue.name} 대표 이미지 보기`}
                className="relative mb-2 h-[220px] w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-700"
              >
                <SafeImage
                  src={heroImage}
                  fallbackSrc={fallbackVenueImages[0]}
                  alt={venue.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 60vw"
                  priority
                />
              </button>
            )}
            {venueImages.length > 1 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {venueImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => openMediaBySource(image)}
                    aria-label={`${venue.name} 이미지 ${index + 1} 보기`}
                    className={`relative aspect-[4/3] overflow-hidden rounded-xl border transition-colors ${
                      heroImage === image
                        ? 'border-blue-500'
                        : 'border-gray-100 dark:border-gray-700'
                    }`}
                  >
                    <SafeImage
                      src={image}
                      fallbackSrc={fallbackVenueImages[index] ?? fallbackVenueImages[0]}
                      alt={`${venue.name} 이미지 ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 33vw, 20vw"
                    />
                  </button>
                ))}
              </div>
            )}
            {venue.lat != null && venue.lng != null ? (
              <KakaoMap
                latitude={venue.lat}
                longitude={venue.lng}
                name={venue.name}
                height="h-[220px]"
              />
            ) : (
              <MapPlaceholder
                lat={37.5665}
                lng={126.978}
                address={venue.address}
                name={venue.name}
                height={220}
              />
            )}
          </div>

          {/* Title card */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-blue-500">{sportLabel[venue.sportType || venue.sportTypes?.[0] || venue.type] || venue.type}</span>
              <div className="flex items-center gap-1 text-sm">
                <Star size={12} className="text-amber-400" fill="currentColor" />
                <span className="font-medium text-gray-700">{venueRating.toFixed(1)}</span>
                <span className="text-gray-500">({venueReviewCount})</span>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{venue.name}</h2>

            {venueDescription && (
              <p className="mt-3 text-base text-gray-600 leading-relaxed">{venueDescription}</p>
            )}
          </div>

          {/* Info cards */}
          <div className="space-y-3 mb-3">
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
              <div className="space-y-3">
                {/* Address */}
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-gray-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">주소</p>
                    <p className="text-md text-gray-900 dark:text-white mt-0.5">{venue.address}</p>
                  </div>
                </div>

                {/* Operating Hours - nicely formatted */}
                <div className="flex items-start gap-3">
                  <Clock size={18} className="text-gray-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 mb-2">운영 시간</p>
                    {operatingHours && Object.keys(operatingHours).length > 0 ? (
                      <div className="space-y-1.5">
                        {Object.entries(operatingHours).map(([day, hours]) => {
                          const label = dayLabels[day] || day;
                          const isClosed = (hours as { open: string; close: string; closed?: boolean }).closed;
                          return (
                            <div
                              key={day}
                              className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-700 px-3 py-2"
                            >
                              <span className="text-sm font-medium text-gray-700">{label}</span>
                              <span className="text-sm text-gray-600">
                                {isClosed ? '휴무' : `${hours.open || '00:00'} ~ ${hours.close || '00:00'}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">운영 시간 정보 없음</p>
                    )}
                  </div>
                </div>

                {/* Price */}
                <div className="flex items-start gap-3">
                  <DollarSign size={18} className="text-gray-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">이용 요금</p>
                    <p className="text-md text-gray-900 dark:text-white mt-0.5">
                      {venuePricePerHour
                        ? `시간당 ${new Intl.NumberFormat('ko-KR').format(venuePricePerHour)}원`
                        : '요금 정보 없음'}
                    </p>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-gray-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">전화번호</p>
                    {venuePhone ? (
                      <a href={`tel:${venuePhone}`} className="text-md text-blue-500 mt-0.5 block">
                        {venuePhone}
                      </a>
                    ) : (
                      <p className="text-md text-gray-500 mt-0.5">전화번호 없음</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Facilities - colored tags */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">시설 정보</h3>
            {venueFacilities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {venueFacilities.map((facility: string) => {
                  const color = facilityColors[facility] || getDefaultFacilityColor();
                  return (
                    <span
                      key={facility}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${color}`}
                    >
                      <Check size={14} />
                      {facility}
                    </span>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={MapPin}
                title="등록된 시설 정보가 없어요"
                size="sm"
              />
            )}
          </div>

          {/* Reviews */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                리뷰 ({venueReviews.length})
              </h3>
              <div className="flex items-center gap-1 text-sm">
                <Star size={12} className="text-amber-400" fill="currentColor" />
                <span className="font-semibold text-gray-700">{venueRating.toFixed(1)}</span>
              </div>
            </div>
            {venueReviews.length > 0 ? (
              <div className="space-y-4">
                {venueReviews.slice(0, 5).map((review) => (
                  <div key={review.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                        {review.user?.nickname?.charAt(0) || '?'}
                      </div>
                      <span className="text-sm font-medium text-gray-700">{review.user?.nickname || '익명'}</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={12}
                            className={i < (review.rating ?? 0) ? 'text-amber-400' : 'text-gray-200'}
                            fill={i < (review.rating ?? 0) ? 'currentColor' : 'none'}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-300 ml-auto">{review.createdAt}</span>
                    </div>
                    <p className="text-base text-gray-600 leading-relaxed">{review.comment || ''}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Star}
                title="아직 리뷰가 없어요"
                description="이 시설을 이용한 후 리뷰를 남겨보세요"
                size="sm"
              />
            )}
          </div>

          {/* Review Form Toggle */}
          <div className="mb-3">
            {!showReviewForm ? (
              <button
                onClick={() => setShowReviewForm(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white dark:bg-gray-800 py-3.5 text-base font-semibold text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <PenLine size={16} className="text-blue-500" />
                리뷰 쓰기
              </button>
            ) : (
              <ReviewForm
                venueId={venueId}
                venueType={(venue.sportType || venue.sportTypes?.[0]) === 'ice_hockey' ? 'ice_rink' : 'field'}
                onSubmit={handleReviewSubmit}
                onCancel={() => setShowReviewForm(false)}
              />
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="px-5 @3xl:px-0 mt-4 @3xl:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
          {/* Upcoming team matches at this venue */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Trophy size={16} className="text-blue-500" />
              이 구장 예정 경기
            </h3>
            {mockUpcomingMatches.length > 0 ? (
              <div className="space-y-2.5">
                {mockUpcomingMatches.map((match) => {
                  const statusMap: Record<string, { label: string; className: string }> = {
                    recruiting: { label: '모집중', className: 'text-blue-500' },
                    matched: { label: '매칭완료', className: 'text-blue-500' },
                  };
                  const status = statusMap[match.status] ?? statusMap.recruiting;

                  return (
                    <Link
                      key={match.id}
                      href={`/team-matches/${match.id}`}
                      className="block rounded-xl bg-gray-50 dark:bg-gray-700 p-3 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-base font-medium text-gray-900 dark:text-white truncate flex-1">
                          {match.title}
                        </p>
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar size={12} className="shrink-0" />
                        <span>{formatMatchDate(match.matchDate)} {match.startTime}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <Users size={12} className="shrink-0" />
                        <span>{match.homeTeam}</span>
                        <span className="text-gray-300">vs</span>
                        <span>{match.awayTeam ?? '상대팀 모집중'}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Calendar}
                title="예정된 경기가 없어요"
                description="이 시설에서 매치를 만들어보세요"
                size="sm"
              />
            )}

            <Link
              href="/team-matches/new"
              className="block w-full text-center rounded-xl bg-blue-500 py-3 text-base font-bold text-white hover:bg-blue-600 transition-colors mt-3"
            >
              이 구장에서 경기 만들기
            </Link>

            {venuePhone && (
              <a
                href={`tel:${venuePhone}`}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors mt-2"
              >
                <Phone size={14} />
                전화 문의
              </a>
            )}
          </div>
          </div>
        </div>
      </div>

      <MediaLightbox
        isOpen={showMediaLightbox}
        images={mediaImages}
        initialIndex={mediaIndex}
        onClose={() => setShowMediaLightbox(false)}
        title={`${venue.name} 이미지`}
      />
    </div>
  );
}
