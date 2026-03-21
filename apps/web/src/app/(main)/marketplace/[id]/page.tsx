'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Heart, Eye, MapPin, Star, MessageCircle, ChevronRight, Share2, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useListing } from '@/hooks/use-api';

const sportLabel: Record<string, string> = { futsal: '풋살', basketball: '농구', badminton: '배드민턴', ice_hockey: '아이스하키' };
const conditionLabel: Record<string, string> = { new: '새 상품', like_new: '거의 새 것', good: '양호', fair: '사용감', poor: '하자' };
const conditionColor: Record<string, string> = {
  new: 'bg-blue-50 text-blue-600', like_new: 'bg-blue-50 text-blue-600',
  good: 'bg-gray-100 text-gray-600', fair: 'bg-gray-100 text-gray-600', poor: 'bg-red-50 text-red-600',
};

function formatCurrency(n: number) { return new Intl.NumberFormat('ko-KR').format(n) + '원'; }

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [liked, setLiked] = useState(false);
  const listingId = params.id as string;

  const { data: listing, isLoading } = useListing(listingId);

  if (isLoading) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-64 bg-gray-100 rounded-2xl" />
          <div className="h-24 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-gray-500">매물을 찾을 수 없습니다</p>
        <Link href="/marketplace" className="text-blue-500 text-sm mt-2 inline-block">목록으로</Link>
      </div>
    );
  }

  const SportIcon = SportIconMap[listing.sportType];

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5"><ArrowLeft size={20} className="text-gray-700" /></button>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (navigator.share) {
                await navigator.share({ title: listing?.title, url: window.location.href });
              } else {
                await navigator.clipboard.writeText(window.location.href);
                toast('success', '링크가 복사되었습니다');
              }
            }}
            className="rounded-lg p-1.5"
          >
            <Share2 size={18} className="text-gray-500" />
          </button>
          <button
            onClick={() => setLiked(!liked)}
            className="rounded-lg p-1.5"
          >
            <Heart size={18} className={liked ? 'text-red-500' : 'text-gray-500'} fill={liked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </header>

      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/marketplace" className="hover:text-gray-600">장터</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 truncate">{listing.title}</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
        {/* Left: product info */}
        <div className="px-5 lg:px-0">
          {/* Image placeholder */}
          <div className="h-64 lg:h-80 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            {SportIcon ? <SportIcon size={64} className="text-gray-300" /> : <div className="text-6xl text-gray-300">📦</div>}
          </div>

          {/* Title + price */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${conditionColor[listing.condition]}`}>
                {conditionLabel[listing.condition]}
              </span>
              <span className="text-[12px] text-gray-400">{sportLabel[listing.sportType]}</span>
              {listing.listingType === 'rent' && (
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">대여</span>
              )}
            </div>
            <h1 className="text-[22px] font-bold text-gray-900">{listing.title}</h1>
            <p className="text-[24px] font-black text-gray-900 mt-2">{formatCurrency(listing.price)}</p>
            <div className="flex items-center gap-4 mt-2 text-[13px] text-gray-400">
              <span className="flex items-center gap-1"><Eye size={14} />{listing.viewCount}</span>
              <span className="flex items-center gap-1"><Heart size={14} />{listing.likeCount}</span>
              {listing.locationDistrict && (
                <span className="flex items-center gap-1"><MapPin size={14} />{listing.locationCity} {listing.locationDistrict}</span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5 mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-2">상품 설명</h3>
            <p className="text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{listing.description}</p>
          </div>

          {/* Rental info */}
          {listing.listingType === 'rent' && (
            <div className="rounded-2xl bg-blue-50 border border-blue-100 p-5 mb-4">
              <h3 className="text-[15px] font-semibold text-blue-800 mb-2">대여 정보</h3>
              <div className="space-y-1 text-[14px] text-blue-700">
                <p>일일 대여비: {formatCurrency(listing.rentalPricePerDay || 0)}</p>
                <p>보증금: {formatCurrency(listing.rentalDeposit || 0)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: seller + CTA */}
        <div className="px-5 lg:px-0 mt-4 lg:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
          {/* Seller */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">판매자</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-500">
                {listing.seller?.nickname?.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-gray-900">{listing.seller?.nickname}</p>
                <div className="flex items-center gap-1 text-[13px] text-amber-500 mt-0.5">
                  <Star size={12} fill="currentColor" />
                  <span>{listing.seller?.mannerScore?.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Safety notice */}
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck size={18} className="text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-gray-700">안전거래 안내</p>
                <p className="text-[12px] text-gray-400 mt-0.5">에스크로 결제로 안전하게 거래하세요</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            {!isAuthenticated ? (
              <Link href="/login" className="block w-full text-center rounded-xl bg-gray-900 py-3.5 text-[15px] font-semibold text-white">
                로그인 후 구매하기
              </Link>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => router.push('/payments/checkout')}
                  className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors"
                >
                  {listing.listingType === 'rent' ? '대여 신청하기' : '구매하기'}
                </button>
                <button
                  onClick={() => {
                    toast('success', '판매자에게 채팅을 시작합니다');
                    router.push('/chat');
                  }}
                  className="w-full rounded-xl border border-gray-200 py-3.5 text-[15px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle size={18} />
                  채팅하기
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
      <div className="h-8" />
    </div>
  );
}
