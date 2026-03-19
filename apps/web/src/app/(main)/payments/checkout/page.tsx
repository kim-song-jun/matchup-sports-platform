'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CreditCard,
  Wallet,
  MapPin,
  Calendar,
  Tag,
  CheckCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';

const paymentMethods = [
  { id: 'card', label: '신용/체크카드', icon: CreditCard, description: '모든 카드 가능' },
  { id: 'tosspay', label: '토스페이', icon: Wallet, description: '토스 간편결제' },
  { id: 'naverpay', label: '네이버페이', icon: Wallet, description: '네이버 간편결제' },
  { id: 'kakaopay', label: '카카오페이', icon: Wallet, description: '카카오 간편결제' },
];

const mockOrder = {
  type: '매치',
  name: '풋살 친선 매치',
  date: '2026년 3월 25일 (수) 19:00',
  venue: '서울 마포구 월드컵경기장 풋살파크 A구장',
  originalPrice: 15000,
  couponDiscount: 500,
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export default function CheckoutPage() {
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const discount = couponApplied ? mockOrder.couponDiscount : 0;
  const finalPrice = mockOrder.originalPrice - discount;

  const handleApplyCoupon = () => {
    if (couponCode.trim()) {
      setCouponApplied(true);
    }
  };

  const handlePayment = async () => {
    if (!agreedToTerms || isProcessing) return;
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsProcessing(false);
    setShowSuccess(true);
    setTimeout(() => {
      router.push('/payments/pay_mock_001');
    }, 1500);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 pb-32">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-3 shadow-lg animate-fade-in">
          <CheckCircle size={18} className="text-green-400" />
          <span className="text-[14px] font-medium text-white">결제가 완료되었습니다</span>
        </div>
      )}

      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">결제하기</h1>
      </header>
      <div className="hidden lg:block mb-6">
        <h2 className="text-[24px] font-bold text-gray-900">결제하기</h2>
        <p className="text-[14px] text-gray-400 mt-1">주문 내용을 확인하고 결제를 진행해 주세요</p>
      </div>

      <div className="px-5 lg:px-0 max-w-lg mx-auto lg:mx-0 space-y-4 mt-4 lg:mt-0">
        {/* Order Summary Card */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">주문 정보</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                <Tag size={20} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-500 mb-1">
                  {mockOrder.type}
                </span>
                <p className="text-[15px] font-semibold text-gray-900">{mockOrder.name}</p>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} className="text-gray-400 shrink-0" />
                {mockOrder.date}
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <MapPin size={14} className="text-gray-400 shrink-0" />
                {mockOrder.venue}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">결제 수단</h3>
          <div className="space-y-2">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              const isSelected = selectedMethod === method.id;
              return (
                <button
                  key={method.id}
                  onClick={() => setSelectedMethod(method.id)}
                  className={`w-full flex items-center gap-3.5 rounded-xl border-2 p-4 transition-all text-left ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      isSelected ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-[14px] font-semibold ${
                        isSelected ? 'text-blue-600' : 'text-gray-900'
                      }`}
                    >
                      {method.label}
                    </p>
                    <p className="text-[12px] text-gray-400">{method.description}</p>
                  </div>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}
                  >
                    {isSelected && (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Coupon */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">쿠폰</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="쿠폰 코드를 입력하세요"
              className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              onClick={handleApplyCoupon}
              className="shrink-0 rounded-xl bg-gray-900 px-5 py-3 text-[14px] font-semibold text-white hover:bg-gray-800 transition-colors"
            >
              적용
            </button>
          </div>
          {couponApplied && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
              <CheckCircle size={14} className="text-green-500" />
              <span className="text-[13px] text-green-600 font-medium">
                신규 가입 쿠폰 ({formatCurrency(mockOrder.couponDiscount)} 할인 적용됨)
              </span>
            </div>
          )}
        </div>

        {/* Price Breakdown */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[15px] font-bold text-gray-900 mb-4">결제 금액</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-gray-500">원가</span>
              <span className="text-[14px] text-gray-700">{formatCurrency(mockOrder.originalPrice)}</span>
            </div>
            {couponApplied && (
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-gray-500">쿠폰 할인</span>
                <span className="text-[14px] text-red-500 font-medium">-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <span className="text-[15px] font-bold text-gray-900">최종 결제 금액</span>
              <span className="text-[20px] font-bold text-blue-500">{formatCurrency(finalPrice)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <button
            onClick={() => setAgreedToTerms(!agreedToTerms)}
            className="flex items-center gap-3 w-full text-left"
          >
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                agreedToTerms ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
              }`}
            >
              {agreedToTerms && <CheckCircle size={12} className="text-white" />}
            </div>
            <span className="text-[14px] text-gray-700">결제 및 취소 규정에 동의합니다</span>
          </button>
          <div className="mt-3 rounded-xl bg-gray-50 p-3.5">
            <p className="text-[12px] text-gray-400 leading-relaxed">
              경기 시작 24시간 전: 전액 환불 / 1~24시간 전: 50% 환불 / 1시간 이내: 환불 불가.
              결제 완료 시 MatchUp 이용약관 및 결제 취소 규정에 동의하는 것으로 간주합니다.
            </p>
          </div>
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-4 pb-[calc(1rem+var(--safe-area-bottom))] lg:relative lg:border-0 lg:px-0 lg:mt-4 lg:pb-4 max-w-lg mx-auto lg:mx-0">
        <div className="flex items-center justify-between mb-3 lg:hidden">
          <span className="text-[13px] text-gray-500">최종 결제 금액</span>
          <span className="text-[18px] font-bold text-blue-500">{formatCurrency(finalPrice)}</span>
        </div>
        <button
          onClick={handlePayment}
          disabled={!agreedToTerms || isProcessing}
          className={`w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[16px] font-bold transition-all ${
            agreedToTerms && !isProcessing
              ? 'bg-blue-500 text-white hover:bg-blue-600 active:scale-[0.98]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              결제 처리중...
            </>
          ) : (
            <>
              <CreditCard size={20} />
              {formatCurrency(finalPrice)} 결제하기
            </>
          )}
        </button>
      </div>
    </div>
  );
}
