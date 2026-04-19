'use client';

import { useState } from 'react';
import { Truck, Package, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';

interface ShipOrderVars {
  orderId: string;
  carrier?: string;
  trackingNumber?: string;
}

interface SellerActionsProps {
  orderId: string;
  status: string;
  /** Injected mutations — allows vi.mock override in tests without touching hooks/ */
  shipOrderMutation: {
    mutate: (vars: ShipOrderVars, callbacks: { onSuccess: () => void; onError: (err: unknown) => void }) => void;
    isPending: boolean;
  };
  deliverOrderMutation: {
    mutate: (vars: { orderId: string }, callbacks: { onSuccess: () => void; onError: (err: unknown) => void }) => void;
    isPending: boolean;
  };
}

/**
 * Seller-only action buttons on the order detail page.
 * - escrow_held: "발송 처리" button → opens modal to mark order shipped.
 * - shipped: "배달 완료" button → opens modal to mark order delivered.
 * Renders null for all other statuses or roles (caller must gate on isSeller).
 */
export function SellerActions({ orderId, status, shipOrderMutation, deliverOrderMutation }: SellerActionsProps) {
  const { toast } = useToast();
  const [showShipModal, setShowShipModal] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  if (status !== 'escrow_held' && status !== 'shipped') return null;

  const handleShip = () => {
    shipOrderMutation.mutate(
      {
        orderId,
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast('success', '발송 처리가 완료됐어요. 구매자에게 알림이 전송돼요.');
          setCarrier('');
          setTrackingNumber('');
          setShowShipModal(false);
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '발송 처리에 실패했어요. 다시 시도해주세요.'));
        },
      },
    );
  };

  const handleDeliver = () => {
    deliverOrderMutation.mutate(
      { orderId },
      {
        onSuccess: () => {
          toast('success', '배달 완료로 처리됐어요. 구매자가 수령 확인 후 대금이 지급돼요.');
          setShowDeliverModal(false);
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '처리에 실패했어요. 다시 시도해주세요.'));
        },
      },
    );
  };

  return (
    <>
      {status === 'escrow_held' && (
        <>
          <button
            type="button"
            onClick={() => setShowShipModal(true)}
            className="w-full min-h-[44px] rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 active:scale-[0.98] transition-[colors,transform] flex items-center justify-center gap-2"
            aria-label="발송 처리하기"
          >
            <Truck size={18} aria-hidden="true" />
            발송 처리
          </button>

          <Modal isOpen={showShipModal} onClose={() => setShowShipModal(false)} size="sm" title="발송 처리">
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                상품을 발송했나요? 택배사와 운송장 번호를 입력하면 구매자가 배송을 추적할 수 있어요.
              </p>
              <div>
                <label htmlFor="ship-carrier" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  택배사 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <input
                  id="ship-carrier"
                  type="text"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder="예: CJ대한통운"
                  className="w-full min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                />
              </div>
              <div>
                <label htmlFor="ship-tracking" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  운송장 번호 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <input
                  id="ship-tracking"
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="예: 123456789012"
                  className="w-full min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowShipModal(false)}
                  disabled={shipOrderMutation.isPending}
                  className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleShip}
                  disabled={shipOrderMutation.isPending}
                  className="flex-1 min-h-[44px] rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {shipOrderMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : null}
                  발송 완료
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {status === 'shipped' && (
        <>
          <button
            type="button"
            onClick={() => setShowDeliverModal(true)}
            className="w-full min-h-[44px] rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 active:scale-[0.98] transition-[colors,transform] flex items-center justify-center gap-2"
            aria-label="배달 완료 처리하기"
          >
            <Package size={18} aria-hidden="true" />
            배달 완료
          </button>

          <Modal isOpen={showDeliverModal} onClose={() => setShowDeliverModal(false)} size="sm" title="배달 완료 처리">
            <div className="space-y-5">
              <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                배달이 완료됐나요?<br />
                구매자가 수령을 확인하면 에스크로 대금이 지급돼요.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeliverModal(false)}
                  disabled={deliverOrderMutation.isPending}
                  className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDeliver}
                  disabled={deliverOrderMutation.isPending}
                  className="flex-1 min-h-[44px] rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {deliverOrderMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : null}
                  네, 완료됐어요
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </>
  );
}
