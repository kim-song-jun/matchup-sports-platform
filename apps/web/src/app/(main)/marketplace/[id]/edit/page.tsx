'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Trash2, AlertTriangle, ChevronRight, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { ImageUpload, type ImageUploadState } from '@/components/ui/image-upload';
import { Modal } from '@/components/ui/modal';
import { useListing } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { sportLabel } from '@/lib/constants';
import { extractUploadUrls, toExistingUploadAsset, type UploadAsset } from '@/lib/uploads';

const sportTypes = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis', 'baseball', 'volleyball', 'figure_skating', 'short_track'];

const categories = [
  '축구화/풋살화', '농구화', '라켓', '유니폼', '보호장비', '하키장비', '스케이트', '기타',
];

const conditions = [
  { value: 'new', label: '새 상품' },
  { value: 'like_new', label: '거의 새 것' },
  { value: 'good', label: '양호' },
  { value: 'fair', label: '사용감 있음' },
  { value: 'poor', label: '하자 있음' },
];

const statusOptions = [
  { value: 'active', label: '판매중' },
  { value: 'reserved', label: '예약중' },
  { value: 'sold', label: '판매완료' },
];

interface ListingFormState {
  title: string;
  description: string;
  sportType: string;
  category: string;
  condition: string;
  price: number;
  status: string;
  listingType: 'sell' | 'rent';
  rentalPricePerDay: number;
  rentalDeposit: number;
}

const initialForm: ListingFormState = {
  title: '',
  description: '',
  sportType: '',
  category: '',
  condition: '',
  price: 0,
  status: 'active',
  listingType: 'sell',
  rentalPricePerDay: 0,
  rentalDeposit: 0,
};

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const listingId = params.id as string;
  const { data: listing, isLoading } = useListing(listingId);
  const hydratedListingIdRef = useRef<string | null>(null);

  const [form, setForm] = useState<ListingFormState>(initialForm);
  const [imageAssets, setImageAssets] = useState<UploadAsset[]>([]);
  const [uploadState, setUploadState] = useState<ImageUploadState>({
    hasPendingUploads: false,
    hasUploadErrors: false,
    pendingCount: 0,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (!listing || hydratedListingIdRef.current === listing.id) return;
    setForm({
      title: listing.title,
      description: listing.description,
      sportType: listing.sportType,
      category: listing.category,
      condition: listing.condition,
      price: listing.price,
      status: listing.status,
      listingType: listing.listingType === 'rent' ? 'rent' : 'sell',
      rentalPricePerDay: listing.rentalPricePerDay ?? 0,
      rentalDeposit: listing.rentalDeposit ?? 0,
    });
    setImageAssets((listing.imageUrls ?? []).map((url) => toExistingUploadAsset(url)));
    hydratedListingIdRef.current = listing.id;
  }, [listing]);

  const guardImageUpload = () => {
    if (uploadState.hasPendingUploads) {
      toast('error', '이미지 업로드가 끝난 뒤 저장할 수 있어요');
      return false;
    }
    if (uploadState.hasUploadErrors) {
      toast('error', '실패한 이미지를 다시 시도하거나 제거해주세요');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!guardImageUpload()) return;
    if (!form.title) return toast('error', '제목을 입력해주세요');
    if (form.price <= 0) return toast('error', '가격을 입력해주세요');

    setIsSaving(true);
    try {
      await api.patch(`/marketplace/listings/${listingId}`, {
        ...form,
        imageUrls: extractUploadUrls(imageAssets),
      });
      toast('success', '매물 정보가 저장되었어요');
      router.push(`/marketplace/${listingId}`);
    } catch {
      toast('error', '수정에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/marketplace/listings/${listingId}`);
      toast('success', '매물이 삭제되었어요');
      router.push('/my/listings');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }
  };

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="px-5 @3xl:px-0 pt-10">
        <EmptyState
          icon={SearchX}
          title="매물을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 매물이에요"
          action={{ label: '장터 목록으로', href: '/marketplace' }}
        />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">매물 수정</h1>
      </header>
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/marketplace" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">장터</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">매물 수정</span>
      </div>

      <div className="px-5 @3xl:px-0 pb-8 max-w-lg @3xl:max-w-[700px]">
        <div className="mb-5">
          <ImageUpload
            value={imageAssets}
            onChange={setImageAssets}
            onStateChange={setUploadState}
            max={10}
            accept="image/jpeg,image/png,image/webp,image/gif"
            maxSizeMB={10}
            label="상품 이미지"
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            이미지 변경은 저장 후 실제 매물에 반영돼요.
          </p>
          {uploadState.hasPendingUploads && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              이미지 업로드가 끝난 뒤 저장할 수 있어요.
            </p>
          )}
          {uploadState.hasUploadErrors && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">
              실패한 이미지를 다시 시도하거나 제거해주세요.
            </p>
          )}
        </div>

        <div className="mb-5">
          <label htmlFor="edit-listing-title" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">제목</label>
          <input
            id="edit-listing-title"
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3 text-base text-gray-900 dark:text-white dark:bg-gray-800/50 focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        <div className="mb-5">
          <label htmlFor="edit-listing-description" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">설명</label>
          <textarea
            id="edit-listing-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3 text-base text-gray-900 dark:text-white dark:bg-gray-800/50 focus:border-blue-500 focus:outline-none transition-colors resize-none"
          />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">종목</label>
          <div className="flex gap-2 flex-wrap">
            {sportTypes.map((type) => (
              <button
                key={type}
                onClick={() => setForm({ ...form, sportType: type })}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  form.sportType === type ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {sportLabel[type] || type}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">카테고리</label>
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setForm({ ...form, category: cat })}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                  form.category === cat ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">상품 상태</label>
          <div className="flex gap-2 flex-wrap">
            {conditions.map((c) => (
              <button
                key={c.value}
                onClick={() => setForm({ ...form, condition: c.value })}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                  form.condition === c.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label htmlFor="edit-listing-price" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">가격 (원)</label>
          <input
            id="edit-listing-price"
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: parseInt(e.target.value, 10) || 0 })}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3 text-base text-gray-900 dark:text-white dark:bg-gray-800/50 focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">판매 상태</label>
          <div className="flex gap-2">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setForm({ ...form, status: opt.value })}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  form.status === opt.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 mt-10">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-5 py-3.5 text-sm font-semibold text-red-500 hover:bg-red-100 transition-colors"
          >
            <Trash2 size={16} />
            삭제
          </button>
          <button
            onClick={() => router.back()}
            className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3.5 text-md font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || uploadState.hasPendingUploads || uploadState.hasUploadErrors}
            className="flex-1 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div className="h-24" />

      {showDeleteModal && (
        <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="매물 삭제" size="sm">
          <div className="pt-1">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-center text-base font-bold tracking-tight text-gray-900 dark:text-white">매물을 삭제하시겠어요?</h3>
            <p className="mt-2 text-center text-sm text-gray-500">삭제된 매물은 복구할 수 없습니다.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">돌아가기</button>
              <button onClick={handleDelete} className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors">삭제하기</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
