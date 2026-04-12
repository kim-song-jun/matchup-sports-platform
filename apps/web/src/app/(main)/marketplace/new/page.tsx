'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Plus, ShoppingBag } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { sportLabel } from '@/lib/constants';
import { getListingPreviewImages } from '@/lib/sport-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { ImageUpload, type ImageUploadState } from '@/components/ui/image-upload';
import { extractUploadUrls, type UploadAsset } from '@/lib/uploads';

const sportTypes = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis', 'baseball', 'volleyball', 'figure_skating', 'short_track'];

const categories = [
  '축구화/풋살화', '농구화', '라켓', '유니폼', '보호장비',
  '하키장비', '스케이트', '기타',
];

const conditions = [
  { value: 'new', label: '새 상품', desc: '사용하지 않은 새 상품' },
  { value: 'like_new', label: '거의 새 것', desc: '사용감 거의 없음' },
  { value: 'good', label: '양호', desc: '사용감 적음' },
  { value: 'fair', label: '사용감 있음', desc: '사용감 있으나 기능 정상' },
  { value: 'poor', label: '하자 있음', desc: '일부 기능 하자' },
];

export default function CreateListingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const teamId = searchParams.get('teamId') ?? undefined;
  const venueId = searchParams.get('venueId') ?? undefined;
  const teamName = searchParams.get('teamName') ?? undefined;
  const venueName = searchParams.get('venueName') ?? undefined;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageAssets, setImageAssets] = useState<UploadAsset[]>([]);
  const [uploadState, setUploadState] = useState<ImageUploadState>({
    hasPendingUploads: false,
    hasUploadErrors: false,
    pendingCount: 0,
  });

  const [form, setForm] = useState({
    title: '',
    description: '',
    sportType: '',
    category: '',
    condition: '',
    price: 0,
    listingType: 'sell' as 'sell' | 'rent',
    rentalPricePerDay: 0,
    rentalDeposit: 0,
  });
  const previewImages = getListingPreviewImages(form.sportType || 'marketplace-new', 3);

  const guardImageUpload = () => {
    if (uploadState.hasPendingUploads) {
      toast('error', '이미지 업로드가 끝난 뒤 등록할 수 있어요');
      return false;
    }
    if (uploadState.hasUploadErrors) {
      toast('error', '실패한 이미지를 다시 시도하거나 제거해주세요');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!guardImageUpload()) return;
    if (!form.title) return toast('error', '제목을 입력해주세요');
    if (!form.sportType) return toast('error', '종목을 선택해주세요');
    if (!form.condition) return toast('error', '상품 상태를 선택해주세요');
    if (form.price <= 0) return toast('error', '가격을 입력해주세요');

    setIsSubmitting(true);
    try {
      await api.post('/marketplace/listings', {
        ...form,
        teamId,
        venueId,
        imageUrls: extractUploadUrls(imageAssets),
      });
      toast('success', '매물이 등록되었어요!');
      router.push('/marketplace');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '등록에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="pt-[var(--safe-area-top)] @3xl:pt-0 px-5 @3xl:px-0">
        <div className="max-w-[500px] mx-auto mt-20 text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-gray-100 text-gray-500 mb-4">
            <ShoppingBag size={28} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">매물을 등록해보세요</h2>
          <p className="text-base text-gray-500 mt-2">로그인하면 장비를 등록하고 거래할 수 있어요</p>
          <Link href="/login" className="inline-block mt-6 rounded-xl bg-blue-500 px-8 py-3.5 text-md font-bold text-white hover:bg-blue-600 transition-colors">
            로그인하고 시작하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">매물 등록</h1>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/marketplace" className="hover:text-gray-600 transition-colors">장터</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">매물 등록</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl">
        {(teamId || venueId) && (
          <div className="mb-5 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
            {teamId
              ? `${teamName ?? '선택한 팀'} 허브에 귀속된 굿즈로 등록됩니다.`
              : `${venueName ?? '선택한 장소'} 허브에 귀속된 굿즈로 등록됩니다.`}
          </div>
        )}
        {/* 사진 추가 영역 */}
        <div className="mb-6 mt-4">
          <p className="block text-sm font-semibold text-gray-700 mb-2">
            상품 이미지
          </p>
          <ImageUpload
            value={imageAssets}
            onChange={setImageAssets}
            onStateChange={setUploadState}
            max={10}
            accept="image/jpeg,image/png,image/webp,image/gif"
            maxSizeMB={10}
          />
          {imageAssets.length === 0 && (
            <div className="mt-2 flex gap-3 overflow-x-auto scrollbar-hide pb-1">
              {previewImages.map((image) => (
                <div key={image} className="relative h-20 w-[80px] shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-700">
                  <img
                    src={image}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover opacity-60"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-950/18">
                    <Plus size={20} className="text-white/90" />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1.5">첫 번째 사진이 대표 이미지로 등록됩니다.</p>
          {uploadState.hasPendingUploads && (
            <p className="text-xs text-gray-500 mt-1.5">이미지 업로드가 끝난 뒤 매물을 등록할 수 있어요.</p>
          )}
          {uploadState.hasUploadErrors && (
            <p className="text-xs text-red-500 mt-1.5">실패한 이미지를 다시 시도하거나 제거해주세요.</p>
          )}
        </div>

        {/* 제목 */}
        <FormField label="제목" required htmlFor="mkt-title" className="mb-5">
          <Input
            id="mkt-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={100}
            placeholder="상품 제목을 입력해주세요"
          />
        </FormField>

        {/* 종목 */}
        <FormField label="종목" required className="mb-5">
          <div className="flex flex-wrap gap-2">
            {sportTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm({ ...form, sportType: type })}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  form.sportType === type
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {sportLabel[type] || type}
              </button>
            ))}
          </div>
        </FormField>

        {/* 카테고리 */}
        <FormField label="카테고리" required className="mb-5">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm({ ...form, category: cat })}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  form.category === cat
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </FormField>

        {/* 상품 상태 */}
        <FormField label="상품 상태" required className="mb-5">
          <div className="space-y-2">
            {conditions.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setForm({ ...form, condition: c.value })}
                className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
                  form.condition === c.value
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <p className={`text-base font-semibold ${form.condition === c.value ? 'text-white dark:text-gray-900' : 'text-gray-900'}`}>
                  {c.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{c.desc}</p>
              </button>
            ))}
          </div>
        </FormField>

        {/* 거래 방식 */}
        <FormField label="거래 방식" className="mb-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, listingType: 'sell' })}
              className={`rounded-xl border py-3 text-base font-semibold transition-colors ${
                form.listingType === 'sell'
                  ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
              }`}
            >
              판매
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, listingType: 'rent' })}
              className={`rounded-xl border py-3 text-base font-semibold transition-colors ${
                form.listingType === 'rent'
                  ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
              }`}
            >
              대여
            </button>
          </div>
        </FormField>

        {/* 가격 */}
        <FormField label="가격" required htmlFor="mkt-price" className="mb-5">
          <div className="relative">
            <Input
              id="mkt-price"
              type="number"
              inputMode="numeric"
              value={form.price || ''}
              onChange={(e) => setForm({ ...form, price: +e.target.value })}
              placeholder="0"
              min={0}
              step={1000}
              className="pr-10"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-base text-gray-500">원</span>
          </div>
        </FormField>

        {/* 대여 추가 정보 */}
        {form.listingType === 'rent' && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="일일 대여비" htmlFor="mkt-rental-price">
              <div className="relative">
                <Input
                  id="mkt-rental-price"
                  type="number"
                  inputMode="numeric"
                  value={form.rentalPricePerDay || ''}
                  onChange={(e) => setForm({ ...form, rentalPricePerDay: +e.target.value })}
                  placeholder="0"
                  className="pr-10"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-base text-gray-500">원</span>
              </div>
            </FormField>
            <FormField label="보증금" htmlFor="mkt-deposit">
              <div className="relative">
                <Input
                  id="mkt-deposit"
                  type="number"
                  inputMode="numeric"
                  value={form.rentalDeposit || ''}
                  onChange={(e) => setForm({ ...form, rentalDeposit: +e.target.value })}
                  placeholder="0"
                  className="pr-10"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-base text-gray-500">원</span>
              </div>
            </FormField>
          </div>
        )}

        {/* 설명 */}
        <FormField label="상세 설명" htmlFor="mkt-description" className="mb-5">
          <Textarea
            id="mkt-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={1000}
            placeholder="구매시기, 브랜드/모델명, 사용감 등 자세하게 적어주세요"
            rows={5}
            className="min-h-[140px] resize-none"
          />
        </FormField>

        {/* 등록 버튼 */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || uploadState.hasPendingUploads || uploadState.hasUploadErrors}
          fullWidth
          size="lg"
          className="mb-8 mt-10"
        >
          {isSubmitting ? '등록 중...' : '매물 등록하기'}
        </Button>
      </div>
      <div className="h-24" />
    </div>
  );
}
