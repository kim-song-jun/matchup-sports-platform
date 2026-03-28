'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Trash2, AlertTriangle, Package, ChevronDown, Eye, Heart, Info } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useListings } from '@/hooks/use-api';
import { formatAmount } from '@/lib/utils';

const mockMyListings = [
  {
    id: 'listing-1',
    title: '나이키 팬텀 GX 풋살화 265',
    sportType: 'futsal',
    category: '축구화/풋살화',
    condition: 'like_new',
    price: 85000,
    status: 'on_sale',
    viewCount: 42,
    likeCount: 5,
    createdAt: '2026-03-15',
    imageUrl: null,
  },
  {
    id: 'listing-2',
    title: 'CCM 아이스하키 스틱 (좌)',
    sportType: 'ice_hockey',
    category: '하키장비',
    condition: 'good',
    price: 120000,
    status: 'reserved',
    viewCount: 28,
    likeCount: 3,
    createdAt: '2026-03-10',
    imageUrl: null,
  },
  {
    id: 'listing-3',
    title: '요넥스 배드민턴 라켓 아스트록스',
    sportType: 'badminton',
    category: '라켓',
    condition: 'new',
    price: 150000,
    status: 'sold',
    viewCount: 65,
    likeCount: 8,
    createdAt: '2026-03-05',
    imageUrl: null,
  },
];

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
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: apiData } = useListings();
  const usingMock = !apiData?.items;
  const apiListings = apiData?.items?.map((l) => ({
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
    imageUrl: l.imageUrls?.[0] || null,
  }));
  const [localListings, setLocalListings] = useState(mockMyListings);
  const listings = apiListings ?? localListings;
  const setListings = setLocalListings;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteTarget) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeleteTarget(null); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteTarget]);

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-md font-medium text-gray-700 dark:text-gray-200">로그인이 필요합니다</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-blue-500 px-6 py-2.5 text-base font-bold text-white">로그인</Link>
      </div>
    );
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/marketplace/listings/${id}`, { status: newStatus });
      setListings(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
      toast('success', '상태가 변경되었어요');
    } catch {
      toast('error', '변경에 실패했어요. 다시 시도해주세요');
    }
    setStatusDropdown(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/marketplace/listings/${id}`);
      setListings(prev => prev.filter(l => l.id !== id));
      toast('success', '매물이 삭제되었어요');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 장터 매물</h1>
      </header>
      <div className="hidden lg:block mb-6 px-5 lg:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 장터 매물</h2>
        <p className="text-base text-gray-500 dark:text-gray-400 mt-1">등록한 매물을 관리하세요</p>
      </div>

      {usingMock && (
        <div className="mx-5 lg:mx-0 mb-3 flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 px-4 py-2.5">
          <Info size={16} className="text-amber-500 shrink-0" />
          <span className="text-sm text-amber-700 dark:text-amber-400">API 연동 전 샘플 데이터가 표시되고 있습니다</span>
        </div>
      )}

      <div className="px-5 lg:px-0 space-y-3 pb-8">
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
                  <div className="w-20 h-20 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <Package size={24} className="text-gray-300 dark:text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${st.style}`}>{st.text}</span>
                      <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">{conditionLabel[listing.condition]}</span>
                    </div>
                    <Link href={`/marketplace/${listing.id}`}>
                      <h3 className="text-md font-semibold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">{listing.title}</h3>
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

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5" onClick={() => setDeleteTarget(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="delete-listing-modal-title" className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 id="delete-listing-modal-title" className="text-lg font-bold text-gray-900 dark:text-white text-center">매물을 삭제하시겠어요?</h3>
            <p className="text-base text-gray-500 dark:text-gray-400 text-center mt-2">삭제된 매물은 복구할 수 없습니다.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">돌아가기</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors">삭제하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
