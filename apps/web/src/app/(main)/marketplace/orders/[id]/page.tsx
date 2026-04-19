'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package, Clock, CheckCircle, Truck, ShoppingBag, AlertTriangle, ShieldCheck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmReceiptButton } from '@/components/marketplace/confirm-receipt-button';
import { FileDisputeModal } from '@/components/marketplace/file-dispute-modal';
import { SellerActions } from '@/components/marketplace/seller-actions';
import { formatAmount } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useOrder, useConfirmReceipt, useFileDispute, useShipOrder, useDeliverOrder } from '@/hooks/use-api';

// hook shapes (actual — matches use-marketplace.ts):
// useOrder(id)           → { data: MarketplaceOrder | undefined; isLoading; isError; refetch }
// useConfirmReceipt()    → mutation.mutate(id: string)
// useFileDispute()       → mutation.mutate({ id, data: FileDisputeInput })
//
// FileDisputeInput.type: 'not_delivered' | 'not_as_described' | 'damaged' | 'other' (API enum, no mapping needed)
// MarketplaceOrder: { id, status, amount, autoReleaseAt, listing, buyer, seller, dispute? }

type OrderStatus =
  | 'pending'
  | 'paid'
  | 'escrow_held'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'cancelled'
  | 'auto_released';

const STATUS_TIMELINE: { status: OrderStatus; label: string; icon: React.ElementType }[] = [
  { status: 'paid', label: '결제 완료', icon: CheckCircle },
  { status: 'shipped', label: '배송 중', icon: Truck },
  { status: 'delivered', label: '배송 완료', icon: Package },
  { status: 'completed', label: '거래 완료', icon: ShieldCheck },
];

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  pending: { text: '결제 대기', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  paid: { text: '결제 완료', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  escrow_held: { text: '에스크로 보유', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  shipped: { text: '배송 중', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  delivered: { text: '배송 완료', color: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' },
  completed: { text: '거래 완료', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  auto_released: { text: '자동 해제', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  disputed: { text: '분쟁 중', color: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' },
  refunded: { text: '환불 완료', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  cancelled: { text: '취소됨', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
};

function AutoReleaseCountdown({ autoReleaseAt }: { autoReleaseAt: string }) {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const calculate = useCallback(() => {
    const diff = new Date(autoReleaseAt).getTime() - Date.now();
    setDaysLeft(Math.max(0, Math.ceil(diff / 86400000)));
  }, [autoReleaseAt]);

  useEffect(() => {
    calculate();
    const timer = setInterval(calculate, 60000);
    return () => clearInterval(timer);
  }, [calculate]);

  if (daysLeft === null) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 px-4 py-3">
      <Clock size={16} className="text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
      <p className="text-sm text-amber-800 dark:text-amber-300">
        {daysLeft > 0
          ? <><span className="font-bold">{daysLeft}일 뒤</span> 자동으로 대금이 판매자에게 지급돼요</>
          : '곧 대금이 자동 지급돼요'}
      </p>
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const orderId = params.id as string;

  useRequireAuth();

  const { user } = useAuthStore();
  const { data: order, isLoading, isError, refetch } = useOrder(orderId);
  const confirmReceiptMutation = useConfirmReceipt();
  const fileDisputeMutation = useFileDispute();
  const shipOrderMutation = useShipOrder();
  const deliverOrderMutation = useDeliverOrder();

  const [showDisputeModal, setShowDisputeModal] = useState(false);

  if (isLoading) {
    return (
      <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800 @3xl:hidden">
          <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
          <div className="h-6 w-40 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
        </div>
        <div className="px-5 @3xl:px-0 mt-4 space-y-4 animate-pulse">
          <div className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0 mt-4">
        <ErrorState
          message="주문 정보를 불러오지 못했어요"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0 mt-4">
        <EmptyState
          icon={ShoppingBag}
          title="주문을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 주문이에요"
          action={{ label: '장터로 이동', href: '/marketplace' }}
        />
      </div>
    );
  }

  const status = order.status as OrderStatus;
  const statusConfig = STATUS_LABELS[status] ?? STATUS_LABELS.pending;
  const hasDispute = !!order.dispute;

  // Role derivation — compare string ids from auth store vs order fields
  const isBuyer = !!user && user.id === order.buyerId;
  const isSeller = !!user && user.id === order.sellerId;

  // paid is excluded: backend rejects dispute filing on escrow-not-yet-held orders
  const canFileDispute =
    isBuyer && ['escrow_held', 'shipped', 'delivered'].includes(status) && !hasDispute;

  // Timeline step index
  const timelineOrder: OrderStatus[] = ['paid', 'shipped', 'delivered', 'completed'];
  const currentStepIndex = timelineOrder.indexOf(status);

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">주문 상세</h1>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:block mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">주문 상세</h2>
      </div>

      <div className="px-5 @3xl:px-0 pb-10 space-y-4 mt-4">
        {/* Status + countdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusConfig.color}`}>
              {statusConfig.text}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              주문 {new Date(order.createdAt).toLocaleDateString('ko-KR')}
            </span>
          </div>
          {order.autoReleaseAt && status === 'delivered' && (
            <AutoReleaseCountdown autoReleaseAt={order.autoReleaseAt} />
          )}
        </div>

        {/* Timeline (only for active flow states) */}
        {!['cancelled', 'refunded', 'disputed', 'pending'].includes(status) && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">진행 상태</h3>
            <div className="flex items-start">
              {STATUS_TIMELINE.map((step, idx) => {
                const StepIcon = step.icon;
                const isCompleted = currentStepIndex >= idx;
                const isCurrent = currentStepIndex === idx;
                const isLast = idx === STATUS_TIMELINE.length - 1;

                return (
                  <div key={step.status} className="flex flex-1 flex-col items-center">
                    <div className="flex items-center w-full">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                          isCompleted
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                        } ${isCurrent ? 'ring-2 ring-blue-200 ring-offset-2 dark:ring-blue-900' : ''}`}
                        aria-label={`${step.label}${isCompleted ? ' 완료' : ''}`}
                      >
                        <StepIcon size={14} aria-hidden="true" />
                      </div>
                      {!isLast && (
                        <div
                          className={`flex-1 h-0.5 transition-colors ${
                            currentStepIndex > idx ? 'bg-blue-500' : 'bg-gray-100 dark:bg-gray-700'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <span
                      className={`mt-2 text-xs text-center leading-tight ${
                        isCompleted ? 'text-blue-500 font-semibold' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dispute status */}
        {hasDispute && order.dispute && (
          <div className="flex items-start gap-3 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 p-4">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">분쟁 신청됨</p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">운영팀이 검토 중이에요. 최대 3영업일 내 처리돼요.</p>
            </div>
            <Link
              href={`/my/disputes/${order.dispute.id}`}
              className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 shrink-0 min-h-[44px]"
            >
              상세
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </div>
        )}

        {/* Listing summary */}
        {order.listing && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 tracking-wide">상품 정보</h3>
            <div className="flex items-start gap-3">
              <div className="h-16 w-16 shrink-0 rounded-xl bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center">
                {order.listing.imageUrls?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={order.listing.imageUrls[0]}
                    alt={order.listing.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package size={28} className="text-gray-300" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/marketplace/${order.listing.id}`}
                  className="text-base font-semibold text-gray-900 dark:text-white hover:text-blue-500 transition-colors line-clamp-2"
                >
                  {order.listing.title}
                </Link>
                {order.seller && (
                  <p className="text-sm text-gray-500 mt-1">판매자: {order.seller.nickname}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Payment summary */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 tracking-wide">결제 정보</h3>
          <div className="flex items-center justify-between">
            <span className="text-base text-gray-700 dark:text-gray-300">결제 금액</span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">{formatAmount(order.amount)}</span>
          </div>
        </div>

        {/* CTAs — gated by role (buyer vs seller, mutually exclusive) */}
        <div className="space-y-3">
          {isBuyer && (
            <>
              <ConfirmReceiptButton
                orderId={orderId}
                status={status}
                confirmReceiptMutation={{
                  mutate: (_vars, callbacks) => {
                    // useConfirmReceipt mutate takes orderId string directly
                    confirmReceiptMutation.mutate(orderId, {
                      onSuccess: () => callbacks.onSuccess(),
                      onError: (err) => callbacks.onError(err),
                    });
                  },
                  isPending: confirmReceiptMutation.isPending,
                }}
              />

              {canFileDispute && (
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(true)}
                  className="w-full min-h-[44px] rounded-xl border border-red-200 dark:border-red-800 py-3 text-base font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-[0.98] transition-[colors,transform] flex items-center justify-center gap-2"
                  aria-label="분쟁 신청하기"
                >
                  <AlertTriangle size={16} aria-hidden="true" />
                  분쟁 신청
                </button>
              )}
            </>
          )}

          {isSeller && (
            <SellerActions
              orderId={orderId}
              status={status}
              shipOrderMutation={{
                mutate: (vars, callbacks) => {
                  shipOrderMutation.mutate(
                    { id: vars.orderId, data: { carrier: vars.carrier, trackingNumber: vars.trackingNumber } },
                    callbacks,
                  );
                },
                isPending: shipOrderMutation.isPending,
              }}
              deliverOrderMutation={{
                mutate: (vars, callbacks) => {
                  deliverOrderMutation.mutate(vars.orderId, callbacks);
                },
                isPending: deliverOrderMutation.isPending,
              }}
            />
          )}
        </div>
      </div>

      <FileDisputeModal
        isOpen={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        orderId={orderId}
        fileDisputeMutation={{
          mutate: (vars, callbacks) => {
            // vars.type is already an API enum value (not_delivered / not_as_described / damaged / other)
            fileDisputeMutation.mutate(
              {
                id: vars.orderId,
                data: {
                  type: vars.type,
                  description: vars.description,
                },
              },
              {
                onSuccess: () => {
                  toast('success', '분쟁 신청이 접수됐어요. 운영팀이 검토 후 연락드릴게요.');
                  callbacks.onSuccess();
                },
                onError: (err) => callbacks.onError(err),
              },
            );
          },
          isPending: fileDisputeMutation.isPending,
        }}
      />
    </div>
  );
}
