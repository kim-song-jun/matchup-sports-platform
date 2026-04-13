'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Heart, Eye, MapPin, Star, MessageCircle, ChevronRight, Share2, ShieldCheck, Pencil, Trash2, AlertTriangle, ShoppingBag } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import dynamic from 'next/dynamic';
import { Modal } from '@/components/ui/modal';
import { SafeImage } from '@/components/ui/safe-image';

const MediaLightbox = dynamic(
  () => import('@/components/ui/media-lightbox').then((m) => ({ default: m.MediaLightbox })),
  { ssr: false, loading: () => null }
);
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useListing, useDeleteListing } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { sportLabel } from '@/lib/constants';
import { getListingImageSet } from '@/lib/sport-image';
import { formatAmount } from '@/lib/utils';

const conditionLabel: Record<string, string> = { new: '새 상품', like_new: '거의 새 것', good: '양호', fair: '사용감', poor: '하자' };
const conditionColor: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  like_new: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  good: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  fair: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  poor: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
};

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [liked, setLiked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);
  const listingId = params.id as string;

  const { data: listing, isLoading } = useListing(listingId);
  const deleteListing = useDeleteListing();

  // task 18: All hooks must be called before any conditional early return
  // to satisfy React hooks rules (fix for production React error #310).
  const galleryImages = useMemo(
    () => getListingImageSet(listing?.imageUrls, listing?.id ?? listingId, 3),
    [listing?.imageUrls, listing?.id, listingId],
  );
  const fallbackGalleryImages = useMemo(
    () => getListingImageSet(undefined, listing?.id ?? listingId, 3),
    [listing?.id, listingId],
  );
  const mediaImages = useMemo(
    () =>
      galleryImages
        .filter((image): image is string => Boolean(image))
        .map((image, index) => ({
          src: image,
          alt: `${listing?.title ?? ''} 이미지 ${index + 1}`,
          fallbackSrc: fallbackGalleryImages[index] ?? fallbackGalleryImages[0],
        })),
    [galleryImages, fallbackGalleryImages, listing?.title],
  );

  useEffect(() => {
    setSelectedImage(galleryImages[0] ?? null);
  }, [listingId, galleryImages]);

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-64 bg-gray-100 rounded-xl" />
          <div className="h-24 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
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
  const heroImage = selectedImage || galleryImages[0];
  const heroFallbackImage = fallbackGalleryImages[0];
  const heroMediaIndex = mediaImages.findIndex((image) => image.src === heroImage);

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

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <MobileGlassHeader compact className="justify-between">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="glass-mobile-icon-button flex items-center justify-center min-h-11 min-w-11 rounded-xl"><ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" /></button>
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
            className="glass-mobile-icon-button flex items-center justify-center min-h-11 min-w-11 rounded-xl"
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
            className="glass-mobile-icon-button flex items-center justify-center min-h-11 min-w-11 rounded-xl"
          >
            <Heart size={18} className={liked ? 'text-red-500' : 'text-gray-500'} fill={liked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </MobileGlassHeader>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/marketplace" className="hover:text-gray-600">장터</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300 truncate">{listing.title}</span>
      </div>

      <div className="@3xl:grid @3xl:grid-cols-[1fr_380px] @3xl:gap-8">
        {/* Left: product info */}
        <div className="px-5 @3xl:px-0">
          <div className="mb-4">
            <button
              type="button"
              onClick={openHeroImage}
              aria-label={`${listing.title} 대표 이미지 보기`}
              className="relative h-64 @3xl:h-80 rounded-xl w-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
            >
              {heroImage ? (
                <SafeImage
                  src={heroImage}
                  fallbackSrc={heroFallbackImage}
                  alt={listing.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 60vw"
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  {SportIcon ? <SportIcon size={64} className="text-gray-300" /> : <div className="text-6xl text-gray-300">📦</div>}
                </div>
              )}
            </button>
            {galleryImages.length > 1 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {galleryImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => openMediaBySource(image)}
                    aria-label={`${listing.title} 이미지 ${index + 1} 보기`}
                    className={`relative aspect-[4/3] overflow-hidden rounded-xl border transition-colors ${
                      heroImage === image
                        ? 'border-blue-500'
                        : 'border-gray-100 dark:border-gray-700'
                    }`}
                  >
                    <SafeImage
                      src={image}
                      fallbackSrc={fallbackGalleryImages[index] ?? heroFallbackImage}
                      alt={`${listing.title} 썸네일 ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 33vw, 20vw"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title + price */}
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${conditionColor[listing.condition]}`}>
                {conditionLabel[listing.condition]}
              </span>
              <span className="text-xs text-gray-400">{sportLabel[listing.sportType]}</span>
              {listing.listingType === 'rent' && (
                <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600">대여</span>
              )}
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-snug">{listing.title}</h1>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{formatAmount(listing.price)}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
              <span className="flex items-center gap-0.5"><Eye size={12} />{listing.viewCount}</span>
              <span className="flex items-center gap-0.5"><Heart size={12} />{listing.likeCount}</span>
              {listing.locationDistrict && (
                <span className="flex items-center gap-0.5"><MapPin size={12} />{listing.locationCity} {listing.locationDistrict}</span>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mt-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">상품 설명</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{listing.description}</p>
          </div>

          {/* Rental info */}
          {listing.listingType === 'rent' && (
            <div className="mt-4 rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 p-4">
              <h3 className="text-base font-bold text-blue-800 dark:text-blue-300 mb-2">대여 정보</h3>
              <div className="space-y-2 text-sm text-blue-700 dark:text-blue-400">
                <p>일일 대여비: {formatAmount(listing.rentalPricePerDay || 0)}</p>
                <p>보증금: {formatAmount(listing.rentalDeposit || 0)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: seller + CTA */}
        <div className="px-5 @3xl:px-0 mt-4 @3xl:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
          {/* Seller */}
          <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">판매자</h3>
              <button
                onClick={() => toast('info', '신고가 접수되었어요. 운영팀이 검토할게요')}
                className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <AlertTriangle size={11} aria-hidden="true" />
                신고
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-bold text-gray-500 dark:text-gray-300 shrink-0">
                {listing.seller?.nickname?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{listing.seller?.nickname}</p>
                <div className="flex items-center gap-1 text-xs text-amber-500 mt-0.5">
                  <Star size={11} fill="currentColor" />
                  <span>{listing.seller?.mannerScore?.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Safety notice */}
          <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck size={18} className="text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">안전거래 안내</p>
                <p className="text-xs text-gray-500 mt-0.5">실제 안전결제는 아직 준비 중이며, 현재는 채팅 기반 거래만 지원해요.</p>
              </div>
            </div>
          </div>

          {/* CTA */}
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
                  <Link href={`/marketplace/${listingId}/edit`} className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <Pencil size={14} /> 수정
                  </Link>
                  <button onClick={() => setShowDeleteConfirm(true)} className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-red-200 dark:border-red-800 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                    <Trash2 size={14} /> 삭제
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} size="sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 mx-auto mb-4">
          <AlertTriangle size={24} className="text-red-500" aria-hidden="true" />
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white text-center">매물을 삭제하시겠어요?</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">삭제된 매물은 복구할 수 없어요.</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            돌아가기
          </button>
          <button
            onClick={() => {
              deleteListing.mutate(listingId, {
                onSuccess: () => {
                  toast('success', '매물이 삭제되었어요');
                  router.push('/marketplace');
                },
                onError: () => {
                  toast('error', '삭제하지 못했어요. 다시 시도해주세요');
                },
                onSettled: () => {
                  setShowDeleteConfirm(false);
                },
              });
            }}
            className="flex-1 min-h-[44px] rounded-xl bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
          >
            삭제하기
          </button>
        </div>
      </Modal>

      <div className="h-24" />

      <MediaLightbox
        isOpen={showMediaLightbox}
        images={mediaImages}
        initialIndex={mediaIndex}
        onClose={() => setShowMediaLightbox(false)}
        title={`${listing.title} 상품 사진`}
      />
    </div>
  );
}
