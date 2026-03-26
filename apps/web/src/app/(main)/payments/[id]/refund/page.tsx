'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Calendar,
  MapPin,
  CreditCard,
  Clock,
  X,
  Loader2,
} from 'lucide-react';

const refundReasons = [
  { id: 'schedule', label: '일정 변경' },
  { id: 'personal', label: '개인 사정' },
  { id: 'match_cancel', label: '매치 취소' },
  { id: 'other', label: '기타' },
];

const _mockPayment = {
  id: 'pay_mock_001',
  amount: 14500,
  method: '신용카드 (신한 **** 1234)',
  paidAt: '2026-03-20T10:30:15',
  match: {
    name: '풋살 친선 매치',
    date: '2026년 3월 25일 (수) 19:00',
    venue: '서울 마포구 월드컵경기장 풋살파크 A구장',
  },
  matchStartTime: '2026-03-25T19:00:00',
};

const emptyPayment = {
  id: '',
  amount: 0,
  method: '',
  paidAt: new Date().toISOString(),
  match: { name: '', date: '', venue: '' },
  matchStartTime: new Date().toISOString(),
};

const mockPayment = process.env.NODE_ENV === 'development' ? _mockPayment : emptyPayment;

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRefundInfo(matchStartTime: string) {
  const now = new Date();
  const matchDate = new Date(matchStartTime);
  const hoursUntilMatch = (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilMatch > 24) {
    return { percentage: 100, label: '전액 환불', color: 'text-green-600', bgColor: 'bg-green-50' };
  } else if (hoursUntilMatch > 1) {
    return { percentage: 50, label: '50% 환불', color: 'text-amber-600', bgColor: 'bg-amber-50' };
  } else {
    return { percentage: 0, label: '환불 불가', color: 'text-red-500', bgColor: 'bg-red-50' };
  }
}

export default function RefundRequestPage() {
  const router = useRouter();
  const params = useParams();
  const [selectedReason, setSelectedReason] = useState('');
  const [additionalReason, setAdditionalReason] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const refundInfo = getRefundInfo(mockPayment.matchStartTime);
  const refundAmount = Math.floor(mockPayment.amount * (refundInfo.percentage / 100));

  const handleRefundSubmit = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsProcessing(false);
    setShowModal(false);
    setShowSuccess(true);
    setTimeout(() => {
      router.push(`/payments/${params.id}`);
    }, 1500);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 pb-32">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-3 shadow-lg animate-fade-in">
          <CheckCircle size={18} className="text-green-400" />
          <span className="text-[14px] font-medium text-white">환불 요청이 완료되었습니다</span>
        </div>
      )}

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-gray-900 dark:text-white">환불 확인</h3>
              <button aria-label="닫기" onClick={() => setShowModal(false)} className="rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] text-gray-500">결제 금액</span>
                <span className="text-[14px] text-gray-700 dark:text-gray-200">{formatCurrency(mockPayment.amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-500">환불 금액</span>
                <span className="text-[16px] font-bold text-blue-500">{formatCurrency(refundAmount)}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 mb-5">
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-amber-700 leading-relaxed">
                환불 요청 후에는 취소할 수 없습니다. 환불 처리까지 영업일 기준 1-3일이 소요됩니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-[14px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleRefundSubmit}
                disabled={isProcessing}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-[14px] font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    처리중
                  </>
                ) : (
                  '환불 요청'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900 dark:text-white">환불 요청</h1>
      </header>
      <div className="hidden lg:block mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-[14px] text-gray-500 hover:text-gray-600 mb-2 transition-colors">
          <ArrowLeft size={16} /> 결제 상세
        </button>
        <h2 className="text-[24px] font-bold text-gray-900 dark:text-white">환불 요청</h2>
      </div>

      <div className="px-5 lg:px-0 max-w-lg mx-auto lg:mx-0 space-y-4 mt-4 lg:mt-0">
        {/* Payment Summary */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-3">결제 정보</h3>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">상품명</span>
              <span className="text-[14px] font-medium text-gray-900 dark:text-white">{mockPayment.match.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">결제 금액</span>
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">{formatCurrency(mockPayment.amount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">결제 수단</span>
              <span className="text-[13px] text-gray-600 dark:text-gray-300">{mockPayment.method}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">결제일</span>
              <span className="text-[13px] text-gray-600 dark:text-gray-300">{formatDateTime(mockPayment.paidAt)}</span>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-[13px] text-gray-500">
              <Calendar size={14} className="text-gray-500 shrink-0" />
              {mockPayment.match.date}
            </div>
            <div className="flex items-center gap-2 text-[13px] text-gray-500">
              <MapPin size={14} className="text-gray-500 shrink-0" />
              {mockPayment.match.venue}
            </div>
          </div>
        </div>

        {/* Refund Policy */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-3">환불 규정</h3>
          <div className="space-y-2">
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${refundInfo.percentage === 100 ? 'bg-green-50 ring-2 ring-green-200' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
              <div className="flex items-center gap-2">
                <Clock size={14} className={refundInfo.percentage === 100 ? 'text-green-500' : 'text-gray-500'} />
                <span className={`text-[13px] font-medium ${refundInfo.percentage === 100 ? 'text-green-700' : 'text-gray-600 dark:text-gray-300'}`}>경기 24시간 전</span>
              </div>
              <span className={`text-[13px] font-bold ${refundInfo.percentage === 100 ? 'text-green-600' : 'text-gray-500'}`}>전액 환불</span>
            </div>
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${refundInfo.percentage === 50 ? 'bg-amber-50 ring-2 ring-amber-200' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
              <div className="flex items-center gap-2">
                <Clock size={14} className={refundInfo.percentage === 50 ? 'text-amber-500' : 'text-gray-500'} />
                <span className={`text-[13px] font-medium ${refundInfo.percentage === 50 ? 'text-amber-700' : 'text-gray-600 dark:text-gray-300'}`}>경기 1~24시간 전</span>
              </div>
              <span className={`text-[13px] font-bold ${refundInfo.percentage === 50 ? 'text-amber-600' : 'text-gray-500'}`}>50% 환불</span>
            </div>
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${refundInfo.percentage === 0 ? 'bg-red-50 ring-2 ring-red-200' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
              <div className="flex items-center gap-2">
                <Clock size={14} className={refundInfo.percentage === 0 ? 'text-red-500' : 'text-gray-500'} />
                <span className={`text-[13px] font-medium ${refundInfo.percentage === 0 ? 'text-red-700' : 'text-gray-600 dark:text-gray-300'}`}>경기 1시간 이내</span>
              </div>
              <span className={`text-[13px] font-bold ${refundInfo.percentage === 0 ? 'text-red-500' : 'text-gray-500'}`}>환불 불가</span>
            </div>
          </div>
        </div>

        {/* Refund Amount */}
        <div className={`rounded-2xl border p-5 ${refundInfo.bgColor} border-transparent`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 ${refundInfo.color}`}>
              <RotateCcw size={20} />
            </div>
            <div>
              <p className="text-[13px] text-gray-500">예상 환불 금액</p>
              <p className={`text-[22px] font-bold ${refundInfo.color}`}>{formatCurrency(refundAmount)}</p>
            </div>
          </div>
          <p className="text-[12px] text-gray-500">
            현재 경기 시작까지 24시간 이상 남아있어 {refundInfo.label}이 적용됩니다.
          </p>
        </div>

        {/* Reason Selection */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-3">환불 사유</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {refundReasons.map((reason) => (
              <button
                key={reason.id}
                onClick={() => setSelectedReason(reason.id)}
                className={`rounded-xl border-2 py-3 px-4 text-[14px] font-medium transition-all ${
                  selectedReason === reason.id
                    ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                    : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-200'
                }`}
              >
                {reason.label}
              </button>
            ))}
          </div>
          <textarea
            value={additionalReason}
            onChange={(e) => setAdditionalReason(e.target.value)}
            placeholder="추가 사유를 입력해 주세요 (선택)"
            rows={3}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3 text-[14px] text-gray-900 dark:text-white placeholder:text-gray-300 resize-none focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-[calc(60px+var(--safe-area-bottom))] lg:bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-5 py-4 lg:relative lg:border-0 lg:px-0 lg:mt-4 lg:pb-4 max-w-lg mx-auto lg:mx-0">
        <div className="flex items-center justify-between mb-3 lg:hidden">
          <span className="text-[13px] text-gray-500">환불 예상 금액</span>
          <span className={`text-[18px] font-bold ${refundInfo.color}`}>{formatCurrency(refundAmount)}</span>
        </div>
        <button
          onClick={() => {
            if (refundInfo.percentage === 0) return;
            setShowModal(true);
          }}
          disabled={!selectedReason || refundInfo.percentage === 0}
          className={`w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[16px] font-bold transition-all ${
            selectedReason && refundInfo.percentage > 0
              ? 'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          <RotateCcw size={20} />
          환불 요청
        </button>
      </div>
    </div>
  );
}
