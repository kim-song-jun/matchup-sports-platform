'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Pencil, Trash2, AlertTriangle, Package, ChevronDown, Eye, Heart } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api } from '@/lib/api';
import { queryKeys, useListings } from '@/hooks/use-api';
import { getListingImage } from '@/lib/sport-image';
import { formatAmount } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useQueryClient } from '@tanstack/react-query';

const conditionLabel: Record<string, string> = {
  new: '새 상품', like_new: '거의 새 것', good: '양호', fair: '사용감', poor: '하자',
};

const statusConfig: Record<string, { text: string; style: string }> = {
  on_sale: { text: '판매중', style: 'text-blue-500' },
  reserved: { text: '예약중', style: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  sold: { text: '판매완료', style: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
};

const statusOptions = [
  { value: 'on_sale', label: '판매중' },
  { value: 'reserved', label: '예약중' },
  { value: 'sold', label: '판매완료' },
];

export default function MyListingsPage() {
  const { toast } = useToast();
  useRequireAuth();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: apiData } = useListings();
  const apiListings = apiData?.items
    ?.filter((listing) => listing.sellerId === user?.id)
    .map((l) => ({
    id: l.id,
    title: l.title,
    sportType: l.sportType || '',
    category: l.category || '',
    condition: l.condition || 'good',
    price: l.price,
    status: l.status,
    viewCount: l.viewCount ?? 0,
    likeCount: l.likeCount ?? 0,
    createdAt: '',
    imageUrls: l.imageUrls ?? [],
  }));
  const listings = apiListings ?? [];
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteTarget) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeleteTarget(null); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteTarget]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/marketplace/listings/${id}`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      toast('success', '상태가 변경되었어요');
    } catch {
      toast('error', '변경에 실패했어요. 다시 시도해주세요');
    }
    setStatusDropdown(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/marketplace/listings/${id}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      toast('success', '매물이 삭제되었어요');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <MobileGlassHeader title="내 장터 매물" showBack />
      <div className="hidden @3xl:block mb-4 px-5 @3xl:px-0 pt-4">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">내 장터 매물</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">등록한 매물을 관리하세요</p>
      </div>

      <div className="px-5 @3xl:px-0 mt-4 space-y-3 pb-8">
        {listings.length === 0 ? (
          <EmptyState
            icon={Package}
            title="등록한 매물이 없어요"
            description="안 쓰는 장비가 있다면 등록해보세요"
            action={{ label: '매물 등록', href: '/marketplace/new' }}
          />
        ) : (
          listings.map((listing) => {
            const st = statusConfig[listing.status] || statusConfig.on_sale;
            return (
              <div key={listing.id} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-20 h-20 rounded-xl bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                    <img
                      src={getListingImage(listing.imageUrls, listing.id)}
                      alt={listing.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${st.style}`}>{st.text}</span>
                      <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">{conditionLabel[listing.condition]}</span>
                    </div>
                    <Link href={`/marketplace/${listing.id}`}>
                      <h3 className="text-sm font-semibold text-gray-900 transition-colors hover:text-blue-500 truncate dark:text-white">{listing.title}</h3>
                    </Link>
                    <p className="text-md font-bold text-gray-900 dark:text-white mt-0.5">{formatAmount(listing.price)}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-0.5"><Eye size={12} />{listing.viewCount}</span>
                      <span className="flex items-center gap-0.5"><Heart size={12} />{listing.likeCount}</span>
                      <span>{listing.createdAt}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/marketplace/${listing.id}/edit`}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Pencil size={14} />
                    수정
                  </Link>
                  <div className="relative">
                    <button
                      onClick={() => setStatusDropdown(statusDropdown === listing.id ? null : listing.id)}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 px-4 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    >
                      상태변경
                      <ChevronDown size={14} />
                    </button>
                    {statusDropdown === listing.id && (
                      <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-10 overflow-hidden min-w-[120px]">
                        {statusOptions.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleStatusChange(listing.id, opt.value)}
                            className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                              listing.status === opt.value ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteTarget(listing.id)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-900/30 px-4 py-2.5 text-sm font-semibold text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 size={14} />
                    삭제
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="h-24" />

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} size="sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 mb-4">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">매물을 삭제하시겠어요?</h3>
          <p className="text-base text-gray-500 dark:text-gray-400 mt-2">삭제된 매물은 복구할 수 없습니다.</p>
          <div className="mt-6 flex gap-3 w-full">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              돌아가기
            </button>
            <button
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors"
            >
              삭제하기
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
