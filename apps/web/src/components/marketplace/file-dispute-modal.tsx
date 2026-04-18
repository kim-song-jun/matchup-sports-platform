'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';

// Expected hook contract (frontend-data-dev owns the implementation):
// useFileDispute(): UseMutationResult<void, Error, FileDisputeVars>
// interface FileDisputeVars {
//   orderId: string;
//   type: DisputeType;
//   description: string;
// }

type DisputeType = 'item_not_received' | 'item_not_as_described' | 'payment_issue' | 'other';

const disputeTypeOptions: { value: DisputeType; label: string; description: string }[] = [
  { value: 'item_not_received', label: '상품 미수령', description: '상품을 아직 받지 못했어요' },
  { value: 'item_not_as_described', label: '상품 상태 불일치', description: '설명과 다른 상품이 도착했어요' },
  { value: 'payment_issue', label: '결제 문제', description: '결제 관련 문제가 발생했어요' },
  { value: 'other', label: '기타', description: '위 항목에 해당하지 않는 문제예요' },
];

interface FileDisputeVars {
  orderId: string;
  type: DisputeType;
  description: string;
}

interface FileDisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  /** Injected mutation — allows vi.mock override in tests without touching hooks/ */
  fileDisputeMutation: {
    mutate: (vars: FileDisputeVars, callbacks: { onSuccess: () => void; onError: (err: unknown) => void }) => void;
    isPending: boolean;
  };
}

/**
 * Modal for buyers to file a dispute against an order.
 * Visible when order status is in {paid, shipped, delivered} and no prior dispute exists.
 */
export function FileDisputeModal({ isOpen, onClose, orderId, fileDisputeMutation }: FileDisputeModalProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<DisputeType | ''>('');
  const [description, setDescription] = useState('');

  const isValid = selectedType !== '' && description.trim().length >= 10;

  const handleSubmit = () => {
    if (!isValid || !selectedType) return;

    fileDisputeMutation.mutate(
      { orderId, type: selectedType, description: description.trim() },
      {
        onSuccess: () => {
          toast('success', '분쟁 신청이 접수됐어요. 운영팀이 검토 후 연락드릴게요.');
          setSelectedType('');
          setDescription('');
          onClose();
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '분쟁 신청에 실패했어요. 다시 시도해주세요.'));
        },
      },
    );
  };

  const handleClose = () => {
    if (fileDisputeMutation.isPending) return;
    setSelectedType('');
    setDescription('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" title="분쟁 신청">
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 p-4">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
            분쟁 신청 후 운영팀이 양측 의견을 수렴해 최대 3영업일 내 결정합니다.
            허위 신청 시 이용이 제한될 수 있어요.
          </p>
        </div>

        {/* Dispute type selection */}
        <div>
          <fieldset>
            <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              문제 유형 <span className="text-red-500" aria-hidden="true">*</span>
            </legend>
            <div className="space-y-2">
              {disputeTypeOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 rounded-xl p-3 cursor-pointer border transition-colors ${
                    selectedType === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                      : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="dispute-type"
                    value={option.value}
                    checked={selectedType === option.value}
                    onChange={() => setSelectedType(option.value)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{option.label}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="dispute-description" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
            상세 내용 <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <textarea
            id="dispute-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="구체적인 상황을 10자 이상 설명해주세요 (예: 주문 후 7일이 지났지만 배송 현황이 전혀 없어요)"
            rows={4}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 resize-none transition-colors"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{description.length}자 / 최소 10자</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={fileDisputeMutation.isPending}
            className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || fileDisputeMutation.isPending}
            className="flex-1 min-h-[44px] rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {fileDisputeMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : null}
            분쟁 신청
          </button>
        </div>
      </div>
    </Modal>
  );
}
