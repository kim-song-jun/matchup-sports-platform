'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  Receipt,
  Calendar,
  MapPin,
  AlertTriangle,
  ChevronRight,
  Copy,
  RotateCcw,
} from 'lucide-react';

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string; bgColor: string }> = {
  completed: { label: '결제 완료', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' },
  pending: { label: '결제 대기', icon: Clock, color: 'text-amber-500', bgColor: 'bg-amber-50' },
  refunded: { label: '환불 완료', icon: RotateCcw, color: 'text-red-500', bgColor: 'bg-red-50' },
};

const mockPayments: Record<string, any> = {
  pay_mock_001: {
    id: 'pay_mock_001',
    status: 'completed',
    amount: 14500,
    originalAmount: 15000,
    couponDiscount: 500,
    method: '신용카드',
    methodDetail: '신한카드 **** 1234',
    orderId: 'ORD-2026-0325-001',
    receiptNumber: 'RCP-20260325-A7K92',
    createdAt: '2026-03-20T10:30:00',
    paidAt: '2026-03-20T10:30:15',
    match: {
      name: '풋살 친선 매치',
      date: '2026년 3월 25일 (수) 19:00',
      venue: '서울 마포구 월드컵경기장 풋살파크 A구장',
      type: '매치',
    },
    isRefundable: true,
    refundDeadline: '2026-03-25T18:00:00',
  },
  pay_mock_002: {
    id: 'pay_mock_002',
    status: 'refunded',
    amount: 20000,
    originalAmount: 20000,
    couponDiscount: 0,
    method: '토스페이',
    methodDetail: '토스페이 간편결제',
    orderId: 'ORD-2026-0318-003',
    receiptNumber: 'RCP-20260318-B3M47',
    createdAt: '2026-03-15T14:20:00',
    paidAt: '2026-03-15T14:20:08',
    refundedAt: '2026-03-17T09:15:00',
    refundAmount: 20000,
    match: {
      name: '농구 3:3 매치',
      date: '2026년 3월 20일 (금) 20:00',
      venue: '서울 강남구 체육센터 실내코트',
      type: '매치',
    },
    isRefundable: false,
  },
};

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

export default function PaymentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [copied, setCopied] = useState(false);

  const payment = mockPayments[id] || mockPayments['pay_mock_001'];
  const status = statusConfig[payment.status] || statusConfig.completed;
  const StatusIcon = status.icon;

  const handleCopyReceipt = () => {
    navigator.clipboard?.writeText(payment.receiptNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const timelineSteps = [
    { label: '주문 생성', time: payment.createdAt, done: true },
    { label: '결제 완료', time: payment.paidAt, done: !!payment.paidAt },
    ...(payment.status === 'refunded'
      ? [{ label: '환불 완료', time: payment.refundedAt, done: true }]
      : []),
  ];

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 pb-8">
      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-lg p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">결제 상세</h1>
      </header>
      <div className="hidden lg:block mb-6">
        <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-4">
          <Link href="/payments" className="hover:text-gray-600 transition-colors">결제 내역</Link>
          <ChevronRight size={14} />
          <span className="text-gray-700">상세</span>
        </div>
        <h2 className="text-[24px] font-bold text-gray-900">결제 상세</h2>
      </div>

      <div className="px-5 lg:px-0 max-w-lg mx-auto lg:mx-0 space-y-4 mt-4 lg:mt-0">
        {/* Status Banner */}
        <div className={`rounded-2xl ${status.bgColor} p-5 flex items-center gap-4`}>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-white/80 ${status.color}`}>
            <StatusIcon size={24} />
          </div>
          <div>
            <p className={`text-[18px] font-bold ${status.color}`}>{status.label}</p>
            <p className="text-[13px] text-gray-500 mt-0.5">{formatDateTime(payment.paidAt || payment.createdAt)}</p>
          </div>
        </div>

        {/* Amount */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">결제 금액</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-gray-500">원가</span>
              <span className="text-[14px] text-gray-700">{formatCurrency(payment.originalAmount)}</span>
            </div>
            {payment.couponDiscount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-gray-500">쿠폰 할인</span>
                <span className="text-[14px] text-red-500 font-medium">-{formatCurrency(payment.couponDiscount)}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <span className="text-[15px] font-bold text-gray-900">결제 금액</span>
              <span className="text-[20px] font-bold text-blue-500">{formatCurrency(payment.amount)}</span>
            </div>
            {payment.status === 'refunded' && (
              <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
                <span className="text-[14px] text-red-500 font-medium">환불 금액</span>
                <span className="text-[14px] font-bold text-red-500">{formatCurrency(payment.refundAmount)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Method */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-3">결제 수단</h3>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50">
              <CreditCard size={20} className="text-gray-400" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-gray-900">{payment.method}</p>
              <p className="text-[12px] text-gray-400">{payment.methodDetail}</p>
            </div>
          </div>
        </div>

        {/* Related Match/Lesson */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">연결된 일정</h3>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-500">
                {payment.match.type}
              </span>
              <p className="text-[14px] font-semibold text-gray-900">{payment.match.name}</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[13px] text-gray-500">
                <Calendar size={14} className="text-gray-400 shrink-0" />
                {payment.match.date}
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-500">
                <MapPin size={14} className="text-gray-400 shrink-0" />
                {payment.match.venue}
              </div>
            </div>
          </div>
        </div>

        {/* Receipt */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-3">영수증 정보</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">주문번호</span>
              <span className="text-[13px] font-mono text-gray-700">{payment.orderId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">영수증 번호</span>
              <button onClick={handleCopyReceipt} className="flex items-center gap-1.5 text-[13px] font-mono text-gray-700 hover:text-blue-500 transition-colors">
                {payment.receiptNumber}
                <Copy size={12} className={copied ? 'text-green-500' : 'text-gray-300'} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">결제수단 상세</span>
              <span className="text-[13px] text-gray-700">{payment.methodDetail}</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">결제 타임라인</h3>
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-1 bottom-1 w-0.5 bg-gray-100" />
            {timelineSteps.map((step, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <div className={`absolute -left-6 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${
                  step.done ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
                }`}>
                  {step.done && <CheckCircle size={10} className="text-white" />}
                </div>
                <p className={`text-[14px] font-medium ${step.done ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                {step.time && (
                  <p className="text-[12px] text-gray-400 mt-0.5">{formatDateTime(step.time)}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Refund Policy & Button */}
        {payment.isRefundable && payment.status === 'completed' && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[15px] font-bold text-gray-900 mb-3">환불 규정</h3>
            <div className="rounded-xl bg-gray-50 p-4 space-y-2 mb-4">
              <div className="flex items-start gap-2">
                <div className="mt-1.5 h-1 w-1 rounded-full bg-gray-400 shrink-0" />
                <p className="text-[13px] text-gray-500">경기 시작 <strong className="text-gray-700">24시간 전</strong>: 전액 환불</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-1.5 h-1 w-1 rounded-full bg-gray-400 shrink-0" />
                <p className="text-[13px] text-gray-500">경기 시작 <strong className="text-gray-700">1~24시간 전</strong>: 50% 환불</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-1.5 h-1 w-1 rounded-full bg-gray-400 shrink-0" />
                <p className="text-[13px] text-gray-500">경기 시작 <strong className="text-gray-700">1시간 이내</strong>: 환불 불가</p>
              </div>
            </div>
            <Link
              href={`/payments/${payment.id}/refund`}
              className="flex items-center justify-center gap-2 w-full rounded-2xl border-2 border-red-100 bg-red-50 py-3.5 text-[15px] font-semibold text-red-500 hover:bg-red-100 transition-colors"
            >
              <RotateCcw size={18} />
              환불 요청
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
