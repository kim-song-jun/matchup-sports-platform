'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Trash2, AlertTriangle, Package, ChevronDown, Eye, Heart, Info, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useListings } from '@/hooks/use-api';
import { formatAmount } from '@/lib/utils';
import { sportLabel } from '@/lib/constants';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

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
  new: '새 상품',
  like_new: '거의 새 것',
  good: '양호',
  fair: '사용감',
  poor: '하자',
};

const statusConfig: Record<string, { text: string; style: string }> = {
  on_sale: { text: '판매중', style: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' },
  reserved: { text: '예약중', style: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200' },
  sold: { text: '판매완료', style: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
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
  const apiListings = apiData?.items?.map((listing) => ({
    id: listing.id,
    title: listing.title,
    sportType: listing.sportType || '',
    category: listing.category || '',
    condition: listing.condition || 'good',
    price: listing.price,
    status: listing.status,
    viewCount: listing.viewCount ?? 0,
    likeCount: listing.likeCount ?? 0,
    createdAt: '',
    imageUrl: listing.imageUrls?.[0] || null,
  }));
  const [localListings, setLocalListings] = useState(mockMyListings);
  const listings = apiListings ?? localListings;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteTarget) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteTarget(null);
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [deleteTarget]);

  if (!isAuthenticated) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Package}
          title="로그인 후 장터 매물을 관리할 수 있어요"
          description="등록한 장비의 상태, 관심도, 조회 흐름을 이 화면에서 바로 확인합니다."
          action={{ label: '로그인', href: '/login' }}
        />
      </div>
    );
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/marketplace/listings/${id}`, { status: newStatus });
      setLocalListings((previous) => previous.map((listing) => (listing.id === id ? { ...listing, status: newStatus } : listing)));
      toast('success', '상태가 변경되었어요');
    } catch {
      toast('error', '변경에 실패했어요. 다시 시도해주세요');
    }

    setStatusDropdown(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/marketplace/listings/${id}`);
      setLocalListings((previous) => previous.filter((listing) => listing.id !== id));
      toast('success', '매물이 삭제되었어요');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }

    setDeleteTarget(null);
  };

  const summary = [
    { label: '등록 매물', value: `${listings.length}건` },
    { label: '판매중', value: `${listings.filter((listing) => listing.status === 'on_sale').length}건` },
    { label: '총 조회', value: `${listings.reduce((sum, listing) => sum + listing.viewCount, 0)}회` },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <Package size={14} />
                MatchUp Market Inventory
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                장터 매물도 운영 관점으로 정리합니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                판매 상태, 관심도, 조회 수와 편집 액션을 한 카드에 모아 불필요한 이동 없이 관리할 수 있게 했습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.back()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <ArrowLeft size={14} />
                이전 화면
              </button>
              <Link
                href="/marketplace/new"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 dark:bg-white dark:text-slate-950"
              >
                <Plus size={14} />
                매물 등록
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {usingMock && (
        <section className="px-5 @3xl:px-0 mt-4">
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-400/10 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <Info size={15} className="shrink-0" />
              API 연동 전 샘플 데이터가 표시되고 있습니다.
            </div>
          </div>
        </section>
      )}

      <section className="px-5 @3xl:px-0 mt-4 pb-8">
        {listings.length === 0 ? (
          <EmptyState
            icon={Package}
            title="등록한 매물이 없어요"
            description="안 쓰는 장비가 있다면 첫 매물을 등록해보세요."
            action={{ label: '매물 등록', href: '/marketplace/new' }}
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {listings.map((listing) => {
              const status = statusConfig[listing.status] || statusConfig.on_sale;
              return (
                <div key={listing.id} className={`${softCard} p-4`}>
                  <div className="flex items-start gap-4">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[22px] border border-slate-200/70 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600">
                      <Package size={24} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.style}`}>
                          {status.text}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {conditionLabel[listing.condition]}
                        </span>
                      </div>

                      <Link href={`/marketplace/${listing.id}`}>
                        <h3 className="mt-3 text-base font-semibold text-slate-950 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-300">
                          {listing.title}
                        </h3>
                      </Link>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {sportLabel[listing.sportType] || listing.sportType}
                        </span>
                        <span>{listing.category}</span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Eye size={12} />
                          {listing.viewCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart size={12} />
                          {listing.likeCount}
                        </span>
                        <span>{listing.createdAt}</span>
                      </div>

                      <p className="mt-3 text-lg font-black tracking-tight text-slate-950 dark:text-white">{formatAmount(listing.price)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/marketplace/${listing.id}/edit`}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      <Pencil size={14} />
                      수정
                    </Link>

                    <div className="relative flex-1">
                      <button
                        onClick={() => setStatusDropdown(statusDropdown === listing.id ? null : listing.id)}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/15"
                      >
                        상태변경
                        <ChevronDown size={14} />
                      </button>
                      {statusDropdown === listing.id && (
                        <div className="absolute left-0 top-full z-10 mt-2 min-w-full overflow-hidden rounded-[20px] border border-slate-200/70 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
                          {statusOptions.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => handleStatusChange(listing.id, option.value)}
                              className={`block w-full px-4 py-3 text-left text-sm transition-colors ${
                                listing.status === option.value
                                  ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200'
                                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setDeleteTarget(listing.id)}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 size={14} />
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-xl dark:bg-slate-950">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-400/10">
              <AlertTriangle size={24} className="text-rose-500" />
            </div>
            <h3 className="text-center text-lg font-bold text-slate-950 dark:text-white">매물을 삭제하시겠어요?</h3>
            <p className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
              삭제된 매물은 복구할 수 없으며, 장터 노출과 관심 데이터도 함께 사라집니다.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-full bg-slate-100 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                돌아가기
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 rounded-full bg-rose-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
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
