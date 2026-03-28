'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Heart, Eye, MapPin, Star, MessageCircle, ChevronRight, Share2, ShieldCheck, Pencil, Trash2, AlertTriangle, ShoppingBag } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useListing } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { sportLabel } from '@/lib/constants';
import { formatAmount } from '@/lib/utils';

const conditionLabel: Record<string, string> = { new: '새 상품', like_new: '거의 새 것', good: '양호', fair: '사용감', poor: '하자' };
const conditionColor: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600', like_new: 'bg-gray-100 text-gray-600',
  good: 'bg-gray-100 text-gray-600', fair: 'bg-gray-100 text-gray-600', poor: 'bg-red-50 text-red-600',
};

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [liked, setLiked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const listingId = params.id as string;

  const { data: listing, isLoading } = useListing(listingId);

  if (isLoading) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-64 bg-gray-100 rounded-xl" />
          <div className="h-24 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0">
        <EmptyState
          icon={ShoppingBag}
          title="매물을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 매물이에요"
          action={{ label: '목록으로', href: '/marketplace' }}
        />
      </div>
    );
  }

  const SportIcon = SportIconMap[listing.sportType];

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3 sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-10 border-b border-gray-50 dark:border-gray-800">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 transition-colors"><ArrowLeft size={20} className="text-gray-700" /></button>
        <div className="flex gap-1">
          <button
            onClick={async () => {
              if (navigator.share) {
                await navigator.share({ title: listing?.title, url: window.location.href });
              } else {
                await navigator.clipboard.writeText(window.location.href);
                toast('success', '링크가 복사되었어요');
              }
            }}
            aria-label="공유하기"
            className="flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Share2 size={18} className="text-gray-500" />
          </button>
          <button
            onClick={async () => {
              setLiked(!liked);
              try {
                await api.post(`/marketplace/listings/${listingId}/like`);
              } catch { /* silent fail for now */ }
            }}
            aria-label={liked ? '좋아요 취소' : '좋아요'}
            className="flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Heart size={18} className={liked ? 'text-red-500' : 'text-gray-500'} fill={liked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </header>

      <div className="hidden lg:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/marketplace" className="hover:text-gray-600">장터</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 truncate">{listing.title}</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
        {/* Left: product info */}
        <div className="px-5 lg:px-0">
          {/* Image placeholder */}
          <div className="h-64 lg:h-80 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
            {SportIcon ? <SportIcon size={64} className="text-gray-300" /> : <div className="text-6xl text-gray-300">📦</div>}
          </div>

          {/* Title + price */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${conditionColor[listing.condition]}`}>
                {conditionLabel[listing.condition]}
              </span>
              <span className="text-xs text-gray-500">{sportLabel[listing.sportType]}</span>
              {listing.listingType === 'rent' && (
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">대여</span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{listing.title}</h1>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-2">{formatAmount(listing.price)}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Eye size={14} />{listing.viewCount}</span>
              <span className="flex items-center gap-1"><Heart size={14} />{listing.likeCount}</span>
              {listing.locationDistrict && (
                <span className="flex items-center gap-1"><MapPin size={14} />{listing.locationCity} {listing.locationDistrict}</span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 mb-4">
            <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-2">상품 설명</h3>
            <p className="text-base text-gray-600 leading-relaxed whitespace-pre-line">{listing.description}</p>
          </div>

          {/* Rental info */}
          {listing.listingType === 'rent' && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-5 mb-4">
              <h3 className="text-md font-semibold text-blue-800 mb-2">대여 정보</h3>
              <div className="space-y-2 text-base text-blue-700">
                <p>일일 대여비: {formatAmount(listing.rentalPricePerDay || 0)}</p>
                <p>보증금: {formatAmount(listing.rentalDeposit || 0)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: seller + CTA */}
        <div className="px-5 lg:px-0 mt-4 lg:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
          {/* Seller */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">판매자</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                {listing.seller?.nickname?.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-md font-semibold text-gray-900 dark:text-white">{listing.seller?.nickname}</p>
                <div className="flex items-center gap-1 text-sm text-amber-500 mt-0.5">
                  <Star size={12} fill="currentColor" />
                  <span>{listing.seller?.mannerScore?.toFixed(1)}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-50 text-right">
              <button
                onClick={() => toast('info', '신고가 접수되었어요. 운영팀이 검토할게요')}
                className="text-xs text-gray-500 hover:text-red-500 transition-colors"
              >
                신고하기
              </button>
            </div>
          </div>

          {/* Safety notice */}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck size={18} className="text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-700">안전거래 안내</p>
                <p className="text-xs text-gray-500 mt-0.5">에스크로 결제로 안전하게 거래하세요</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
            {!isAuthenticated ? (
              <Link href="/login" className="block w-full text-center rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white hover:bg-blue-600 transition-colors">
                로그인 후 구매하기
              </Link>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => router.push('/payments/checkout')}
                  className="w-full rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 transition-colors"
                >
                  {listing.listingType === 'rent' ? '대여 신청하기' : '구매하기'}
                </button>
                <button
                  onClick={() => {
                    toast('success', '판매자와 채팅을 시작했어요');
                    router.push('/chat');
                  }}
                  className="w-full rounded-xl border border-gray-200 py-3.5 text-md font-semibold text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle size={18} />
                  채팅하기
                </button>
                {user?.id === listing?.sellerId && (
                  <div className="flex gap-2 mt-2">
                    <Link href={`/marketplace/${listingId}/edit`} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600">
                      <Pencil size={14} /> 수정
                    </Link>
                    <button onClick={() => setShowDeleteConfirm(true)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-500">
                      <Trash2 size={14} /> 삭제
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">매물을 삭제하시겠어요?</h3>
            <p className="text-base text-gray-500 text-center mt-2">삭제된 매물은 복구할 수 없습니다.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl bg-gray-100 py-3 text-base font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.delete(`/marketplace/listings/${listingId}`);
                    toast('success', '매물이 삭제되었어요');
                    router.push('/marketplace');
                  } catch {
                    toast('error', '삭제하지 못했어요. 다시 시도해주세요');
                  }
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
