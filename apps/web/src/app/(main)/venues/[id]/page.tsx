'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, ChevronRight, MapPin, Share2, Star, Trophy } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';

const MediaLightbox = dynamic(
  () => import('@/components/ui/media-lightbox').then((m) => ({ default: m.MediaLightbox })),
  { ssr: false, loading: () => null }
);
import { SafeImage } from '@/components/ui/safe-image';
import { useVenue, useVenueHub, useVenueSchedule } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { sportLabel } from '@/lib/constants';
import { getListingImage, getSportImage, getVenueImageSet } from '@/lib/sport-image';
import { formatMatchDate } from '@/lib/utils';
import type { Lesson, MarketplaceListing, Tournament, VenueScheduleSlot } from '@/types/api';

type HubSection = 'overview' | 'goods' | 'passes' | 'events';

export default function VenueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;
  const { toast } = useToast();

  const [activeSection, setActiveSection] = useState<HubSection>('overview');
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);

  const { data: venue, isLoading, isError, refetch } = useVenue(venueId);
  const { data: hubData } = useVenueHub(venueId);
  const { data: schedule = [] } = useVenueSchedule(venueId);

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-40 rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-48 rounded-xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        {isError ? (
          <ErrorState message="시설 정보를 불러오지 못했어요." onRetry={() => void refetch()} />
        ) : (
          <EmptyState icon={MapPin} title="시설을 찾을 수 없어요" description="삭제되었거나 존재하지 않는 시설이에요." action={{ label: '시설 목록으로', href: '/venues' }} />
        )}
      </div>
    );
  }

  const canEdit = hubData?.capabilities?.canEditProfile ?? false;
  const canManageCatalog = canEdit
    || hubData?.capabilities?.canManageGoods
    || hubData?.capabilities?.canManagePasses
    || hubData?.capabilities?.canManageEvents;
  const goods = hubData?.goods ?? [];
  const passes = hubData?.passes ?? [];
  const events = hubData?.events ?? [];

  const venueSport = venue.sportType || venue.sportTypes?.[0] || 'soccer';
  const venueImages = getVenueImageSet(venueSport, venue.imageUrls, venue.id, 4);
  const fallbackImages = getVenueImageSet(venueSport, undefined, `${venue.id}-fallback`, 4);
  const mediaImages = venueImages.map((image, index) => ({
    src: image,
    alt: `${venue.name} 이미지 ${index + 1}`,
    fallbackSrc: fallbackImages[index] ?? fallbackImages[0],
  }));
  const heroImage = venueImages[0] ?? fallbackImages[0];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader className="justify-between">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="glass-mobile-icon-button flex min-h-[44px] min-w-11 items-center justify-center rounded-xl">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1 ml-3">{venue.name}</h1>
        <button
          aria-label="공유하기"
          onClick={async () => {
            try {
              if (navigator.share) {
                await navigator.share({ title: venue.name, url: window.location.href });
              } else {
                await navigator.clipboard.writeText(window.location.href);
                toast('success', '시설 링크를 복사했어요.');
              }
            } catch {
              // user cancelled share
            }
          }}
          className="glass-mobile-icon-button flex min-h-[44px] min-w-11 items-center justify-center rounded-xl"
        >
          <Share2 size={18} className="text-gray-500" />
        </button>
      </MobileGlassHeader>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/venues" className="hover:text-gray-600 transition-colors">시설</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{venue.name}</span>
      </div>

      <div className="@3xl:grid @3xl:grid-cols-[1fr_360px] @3xl:gap-8">
        <div className="px-5 @3xl:px-0">
          <Card padding="none" className="overflow-hidden">
            <button type="button" onClick={() => setShowMediaLightbox(true)} className="relative h-[220px] w-full overflow-hidden bg-gray-100 dark:bg-gray-700">
              <SafeImage src={heroImage} fallbackSrc={fallbackImages[0]} alt={venue.name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 60vw" />
            </button>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{venue.name}</h2>
                {venue.reviewCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm text-amber-500">
                    <Star size={12} fill="currentColor" />
                    {venue.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {sportLabel[venueSport] || venue.type}
                {(venue.city || venue.district) ? ` · ${[venue.city, venue.district].filter(Boolean).join(' ')}` : ''}
              </p>
              {venue.description && <p className="mt-3 text-base text-gray-600">{venue.description}</p>}
            </div>
          </Card>

          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            <HubSectionTab label="소개" active={activeSection === 'overview'} onClick={() => setActiveSection('overview')} />
            <HubSectionTab label={`굿즈 ${hubData?.sections.goodsCount ?? goods.length}`} active={activeSection === 'goods'} onClick={() => setActiveSection('goods')} />
            <HubSectionTab label={`수강권 ${hubData?.sections.passesCount ?? passes.length}`} active={activeSection === 'passes'} onClick={() => setActiveSection('passes')} />
            <HubSectionTab label={`대회 ${hubData?.sections.eventsCount ?? events.length}`} active={activeSection === 'events'} onClick={() => setActiveSection('events')} />
          </div>

          {activeSection === 'overview' && (
            <div className="space-y-4 mt-4">
              <Card>
                <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-2">기본 정보</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">{venue.address}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {venue.pricePerHour ? `시간당 ${venue.pricePerHour.toLocaleString('ko-KR')}원` : '요금 정보 없음'}
                </p>
              </Card>
              <Card>
                <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-2">향후 7일 예약</h3>
                {schedule.length === 0 ? (
                  <EmptyState icon={CalendarDays} title="예약이 없어요" size="sm" />
                ) : (
                  <div className="space-y-2">
                    {schedule.slice(0, 5).map((item) => (
                      <ScheduleCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-2">리뷰</h3>
                {venue.reviewCount === 0 ? (
                  <EmptyState icon={Star} title="아직 리뷰가 없어요" size="sm" />
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    평균 {venue.rating.toFixed(1)} / 5.0 · 총 {venue.reviewCount}개
                  </p>
                )}
              </Card>
            </div>
          )}

          {activeSection === 'goods' && <GoodsSection goods={goods} />}
          {activeSection === 'passes' && <PassesSection passes={passes} />}
          {activeSection === 'events' && <EventsSection events={events} />}
        </div>

        <div className="px-5 @3xl:px-0 mt-4 @3xl:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
            {canEdit && (
              <Card padding="sm">
                <Link href={`/venues/${venueId}/edit`} className="block rounded-xl bg-blue-500 px-3 py-2.5 text-center text-sm font-semibold text-white">
                  시설 페이지 수정
                </Link>
              </Card>
            )}
            {canManageCatalog && (
              <Card padding="sm">
                <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-2">허브 등록</h3>
                <div className="space-y-1.5 text-sm">
                  <Link href={`/marketplace/new?venueId=${venueId}&venueName=${encodeURIComponent(venue.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-200">
                    굿즈 등록
                  </Link>
                  <Link href={`/lessons/new?venueId=${venueId}&venueName=${encodeURIComponent(venue.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-200">
                    수강권 등록
                  </Link>
                  <Link href={`/tournaments/new?venueId=${venueId}&venueName=${encodeURIComponent(venue.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-200">
                    대회 등록
                  </Link>
                </div>
              </Card>
            )}
            <Card padding="sm">
              <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-2">허브 섹션</h3>
              <div className="space-y-1.5 text-sm">
                <button onClick={() => setActiveSection('goods')} className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left text-gray-700 dark:text-gray-200">굿즈 {hubData?.sections.goodsCount ?? goods.length}</button>
                <button onClick={() => setActiveSection('passes')} className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left text-gray-700 dark:text-gray-200">수강권 {hubData?.sections.passesCount ?? passes.length}</button>
                <button onClick={() => setActiveSection('events')} className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left text-gray-700 dark:text-gray-200">대회 {hubData?.sections.eventsCount ?? events.length}</button>
              </div>
            </Card>
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
      <div className="h-24" />
    </div>
  );
}

function HubSectionTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

function ScheduleCard({ item }: { item: VenueScheduleSlot }) {
  return (
    <Link href={`/matches/${item.id}`} className="block rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2.5">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
      <p className="text-xs text-gray-500 mt-1">{formatMatchDate(item.matchDate)} {item.startTime} - {item.endTime}</p>
    </Link>
  );
}

function GoodsSection({ goods }: { goods: MarketplaceListing[] }) {
  if (goods.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState icon={Trophy} title="등록된 굿즈가 없어요" description="장터에서 등록한 항목이 있으면 이 섹션에 표시됩니다." action={{ label: '장터 보기', href: '/marketplace' }} size="sm" />
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {goods.map((item) => (
        <Link key={item.id} href={`/marketplace/${item.id}`} className="block">
          <Card padding="sm" className="flex gap-3">
            <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700 shrink-0">
              <SafeImage src={getListingImage(item.imageUrls, item.id)} fallbackSrc={getListingImage(undefined, item.id)} alt={item.title} fill className="object-cover" sizes="80px" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
              <p className="text-xs text-gray-500 mt-1">{item.price.toLocaleString('ko-KR')}원</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function PassesSection({ passes }: { passes: Lesson[] }) {
  if (passes.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState icon={Trophy} title="등록된 수강권이 없어요" description="소속 레슨이 연결되면 수강권 섹션이 활성화됩니다." action={{ label: '레슨 보기', href: '/lessons' }} size="sm" />
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {passes.map((item) => (
        <Link key={item.id} href={`/lessons/${item.id}`} className="block">
          <Card padding="sm" className="flex gap-3">
            <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700 shrink-0">
              <SafeImage src={getSportImage(item.sportType, item.imageUrls?.[0] ?? item.imageUrl, item.id)} fallbackSrc={getSportImage(item.sportType, undefined, item.id)} alt={item.title} fill className="object-cover" sizes="80px" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
              <p className="text-xs text-gray-500 mt-1">{item.lessonDate} {item.startTime}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function EventsSection({ events }: { events: Tournament[] }) {
  if (events.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState icon={Trophy} title="예정 대회가 없어요" description="대회가 등록되면 이 섹션에서 확인할 수 있어요." action={{ label: '대회 보기', href: '/tournaments' }} size="sm" />
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {events.map((event) => (
        <Link key={event.id} href={`/tournaments/${event.id}`} className="block">
          <Card padding="sm">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{event.title}</p>
            <p className="text-xs text-gray-500 mt-1">{event.eventDate}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
