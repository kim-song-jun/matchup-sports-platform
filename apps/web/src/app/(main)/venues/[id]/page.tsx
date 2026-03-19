'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, MapPin, Star, Clock, Phone, Users, Calendar, Check, Share2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SportIconMap } from '@/components/icons/sport-icons';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

export default function VenueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;

  const { data: venue, isLoading } = useQuery({
    queryKey: ['venue', venueId],
    queryFn: async () => {
      const res = await api.get(`/venues/${venueId}`);
      return (res as any).data;
    },
    enabled: !!venueId,
  });

  const { data: scheduleData } = useQuery({
    queryKey: ['venue-schedule', venueId],
    queryFn: async () => {
      const res = await api.get(`/venues/${venueId}/schedule`);
      return (res as any).data;
    },
    enabled: !!venueId,
  });

  const upcomingMatches = scheduleData?.items ?? scheduleData ?? [];

  if (isLoading) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-32 bg-gray-100 rounded-lg" />
          <div className="h-64 bg-gray-100 rounded-2xl" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-gray-500">시설을 찾을 수 없습니다</p>
        <Link href="/venues" className="text-blue-500 text-sm mt-2 inline-block">목록으로 돌아가기</Link>
      </div>
    );
  }

  const SportIcon = SportIconMap[venue.sportType];

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

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
        {/* Left: Venue info */}
        <div className="px-5 lg:px-0">
          {/* Image placeholder */}
          <div className="h-48 lg:h-64 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            {SportIcon ? <SportIcon size={64} className="text-gray-300" /> : <MapPin size={64} className="text-gray-300" />}
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
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] text-gray-400">주소</p>
                    <p className="text-[15px] text-gray-900 mt-0.5">{venue.address}</p>
                  </div>
                </div>
                {venue.operatingHours && typeof venue.operatingHours === 'object' && (
                  <div className="flex items-start gap-3">
                    <Clock size={18} className="text-gray-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] text-gray-400">운영 시간</p>
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(venue.operatingHours as Record<string, { open: string; close: string }>).map(([day, hours]) => (
                          <div key={day} className="flex items-center gap-2 text-[13px]">
                            <span className="w-8 text-gray-500 font-medium">{day}</span>
                            <span className="text-gray-700">{hours.open} ~ {hours.close}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {venue.phone && (
                  <div className="flex items-start gap-3">
                    <Phone size={18} className="text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] text-gray-400">전화번호</p>
                      <p className="text-[15px] text-gray-900 mt-0.5">{venue.phone}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Facilities */}
          {venue.facilities && venue.facilities.length > 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 p-4 mb-3">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">시설 정보</h3>
              <div className="flex flex-wrap gap-2">
                {venue.facilities.map((facility: string) => (
                  <span key={facility} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-1.5 text-[13px] text-gray-600">
                    <Check size={14} className="text-emerald-500" />
                    {facility}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          {venue.reviews && venue.reviews.length > 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 p-4 mb-3">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">
                리뷰 ({venue.reviews.length})
              </h3>
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
                    </div>
                    <p className="text-[14px] text-gray-600 leading-relaxed">{review.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="px-5 lg:px-0 mt-4 lg:mt-0">
          {/* Upcoming matches at this venue */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4 sticky top-4">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">
              <Calendar size={16} className="inline mr-1.5 text-gray-400" />
              예정된 매치
            </h3>
            {upcomingMatches.length > 0 ? (
              <div className="space-y-2.5">
                {upcomingMatches.slice(0, 5).map((match: any) => (
                  <Link key={match.id} href={`/matches/${match.id}`}
                    className="block rounded-xl bg-gray-50 p-3 hover:bg-gray-100 transition-colors">
                    <p className="text-[14px] font-medium text-gray-900 truncate">{match.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-[12px] text-gray-400">
                      <span>{formatMatchDate(match.matchDate)} {match.startTime}</span>
                      <span className="text-gray-200">|</span>
                      <span className="flex items-center gap-0.5">
                        <Users size={11} />
                        {match.currentPlayers}/{match.maxPlayers}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 p-6 text-center">
                <Calendar size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-400">예정된 매치가 없어요</p>
              </div>
            )}

            <Link href="/matches/new"
              className="block w-full text-center rounded-xl bg-blue-500 py-3 text-[14px] font-semibold text-white hover:bg-blue-600 transition-colors mt-3">
              이 시설에서 매치 만들기
            </Link>
          </div>
        </div>
      </div>

      <div className="h-8" />
    </div>
  );
}
