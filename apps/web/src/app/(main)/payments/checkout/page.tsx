'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CreditCard,
  Wallet,
  MapPin,
  Calendar,
  Tag,
  CheckCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatAmount } from '@/lib/utils';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const solidCard =
  'rounded-[24px] border border-slate-200/70 bg-white/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950/75';

const paymentMethods = [
  { id: 'card', label: '신용/체크카드', icon: CreditCard, description: '모든 카드 가능' },
  { id: 'tosspay', label: '토스페이', icon: Wallet, description: '토스 간편결제' },
  { id: 'naverpay', label: '네이버페이', icon: Wallet, description: '네이버 간편결제' },
  { id: 'kakaopay', label: '카카오페이', icon: Wallet, description: '카카오 간편결제' },
] as const;

const defaultOrder = {
  type: '매치',
  name: '풋살 친선 매치',
  date: '2026년 3월 25일 (수) 19:00',
  venue: '서울 마포구 월드컵경기장 풋살파크 A구장',
  originalPrice: 15000,
  couponDiscount: 500,
};

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const order = {
    type: searchParams.get('type') || defaultOrder.type,
    name: searchParams.get('name') || defaultOrder.name,
    date: searchParams.get('date') || defaultOrder.date,
    venue: searchParams.get('venue') || defaultOrder.venue,
    originalPrice: Number(searchParams.get('price')) || defaultOrder.originalPrice,
    couponDiscount: Number(searchParams.get('discount')) || defaultOrder.couponDiscount,
  };

  const [selectedMethod, setSelectedMethod] = useState<(typeof paymentMethods)[number]['id']>('card');
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [completedOrderName, setCompletedOrderName] = useState('');
  const [completedAmount, setCompletedAmount] = useState(0);

  const discount = couponApplied ? order.couponDiscount : 0;
  const finalPrice = order.originalPrice - discount;

  const handleApplyCoupon = () => {
    if (couponCode.trim()) {
      setCouponApplied(true);
    }
  };

  const handlePayment = async () => {
    if (!agreedToTerms || isProcessing) return;
    setIsProcessing(true);

    const orderId = `order_${Date.now()}`;

    try {
      const prepareRes = await api.post('/payments/prepare', {
        orderId,
        amount: finalPrice,
        method: selectedMethod,
        itemName: order.name,
      });
      const payment = (prepareRes as unknown as { data: { id: string } }).data;

      const paymentKey = `toss_${Date.now()}`;
      await api.post('/payments/confirm', {
        paymentKey,
        orderId,
        amount: finalPrice,
      });

      setIsProcessing(false);
      setCompletedOrderName(order.name);
      setCompletedAmount(finalPrice);
      setShowSuccess(true);

      setTimeout(() => {
        router.push(`/payments/${payment?.id || orderId}`);
      }, 1500);
    } catch {
      toast('info', '테스트 모드: 결제가 시뮬레이션되었어요');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setIsProcessing(false);
      setCompletedOrderName(order.name);
      setCompletedAmount(finalPrice);
      setShowSuccess(true);

      const mockPaymentId = `pay_mock_${Date.now()}`;
      setTimeout(() => {
        router.push(`/payments/${mockPaymentId}`);
      }, 1500);
    }
  };

  const summary = [
    { label: '원가', value: formatAmount(order.originalPrice) },
    { label: '할인', value: couponApplied ? `-${formatAmount(discount)}` : formatAmount(0) },
    { label: '최종 결제', value: formatAmount(finalPrice) },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 pb-36">
      {showSuccess && (
        <div className="fixed left-1/2 top-6 z-50 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl bg-slate-950 px-5 py-3 shadow-lg animate-fade-in dark:bg-white">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-emerald-400 dark:text-emerald-500" />
            <span className="text-sm font-semibold text-white dark:text-slate-950">결제가 완료되었습니다</span>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {completedOrderName} · {formatAmount(completedAmount)}
          </span>
        </div>
      )}

      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <CreditCard size={14} />
                MatchUp Checkout
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                결제 흐름은 빠르고 신뢰 있게 마무리합니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                주문 정보, 수단 선택, 취소 규정을 한 화면에 정리해서 마지막 확인만 남기도록 구성했습니다.
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <ArrowLeft size={14} />
              이전 화면
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 px-5 @3xl:px-0 @4xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">주문 정보</h3>
            <div className="mt-4 flex items-start gap-3 rounded-[22px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                <Tag size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                  {order.type}
                </span>
                <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">{order.name}</p>
                <div className="mt-3 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="shrink-0" />
                    {order.date}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="shrink-0" />
                    {order.venue}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">결제 수단</h3>
            <div className="mt-4 space-y-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const selected = selectedMethod === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`flex w-full items-center gap-3.5 rounded-[22px] border p-4 text-left transition-colors ${
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-200/70 bg-white/60 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                      selected
                        ? 'bg-white/15 text-white dark:bg-slate-200 dark:text-slate-950'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">{method.label}</p>
                      <p className={`mt-1 text-xs ${selected ? 'text-white/70 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
                        {method.description}
                      </p>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 ${
                      selected
                        ? 'border-white bg-white dark:border-slate-950 dark:bg-slate-950'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {selected && <div className="mx-auto mt-[3px] h-2 w-2 rounded-full bg-slate-950 dark:bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">쿠폰</h3>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value)}
                placeholder="쿠폰 코드를 입력하세요"
                className="input-surface px-4 py-3 text-base outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                onClick={handleApplyCoupon}
                className="shrink-0 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                적용
              </button>
            </div>

            {couponApplied && (
              <div className="mt-3 rounded-[20px] bg-emerald-50 px-4 py-3 dark:bg-emerald-400/10">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-200">
                  <CheckCircle size={14} />
                  신규 가입 쿠폰이 적용되었습니다.
                </div>
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-300">{formatAmount(order.couponDiscount)} 할인</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className={solidCard}>
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">최종 결제 금액</h3>
            <div className="mt-4 space-y-3">
              <SummaryRow label="원가" value={formatAmount(order.originalPrice)} />
              {couponApplied && <SummaryRow label="쿠폰 할인" value={`-${formatAmount(discount)}`} valueClassName="text-rose-500" />}
              <SummaryRow
                label="최종 결제 금액"
                value={formatAmount(finalPrice)}
                divider
                labelClassName="font-semibold text-slate-950 dark:text-white"
                valueClassName="text-lg font-black tracking-tight text-slate-950 dark:text-white"
              />
            </div>
          </div>

          <div className={solidCard}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-600 dark:text-blue-300" />
              <h3 className="text-lg font-bold text-slate-950 dark:text-white">결제 및 취소 규정</h3>
            </div>
            <div className="mt-4 rounded-[22px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <button
                onClick={() => setAgreedToTerms((prev) => !prev)}
                className="flex w-full items-start gap-3 text-left"
              >
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    agreedToTerms
                      ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {agreedToTerms && <CheckCircle size={12} />}
                </div>
                <span className="text-sm text-slate-700 dark:text-slate-300">결제 및 취소 규정에 동의합니다.</span>
              </button>
              <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
                경기 시작 24시간 전: 전액 환불 / 1~24시간 전: 50% 환불 / 1시간 이내: 환불 불가.
                결제 완료 시 MatchUp 이용약관 및 결제 취소 규정에 동의한 것으로 간주합니다.
              </p>
            </div>
          </div>

          <div className="sticky top-6">
            <div className={`${surfaceCard} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">최종 결제 금액</p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{formatAmount(finalPrice)}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                  {selectedMethod}
                </span>
              </div>

              <button
                onClick={handlePayment}
                disabled={!agreedToTerms || isProcessing}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-4 text-base font-bold transition-[transform,box-shadow,background-color] ${
                  agreedToTerms && !isProcessing
                    ? 'bg-slate-950 text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 dark:bg-white dark:text-slate-950'
                    : 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    결제 처리중...
                  </>
                ) : (
                  <>
                    <CreditCard size={18} />
                    {formatAmount(finalPrice)} 결제하기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  divider,
  labelClassName,
  valueClassName,
}: {
  label: string;
  value: string;
  divider?: boolean;
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`${divider ? 'border-t border-slate-200 pt-3 dark:border-slate-800' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={labelClassName || 'text-sm text-slate-500 dark:text-slate-400'}>{label}</span>
        <span className={valueClassName || 'text-sm text-slate-700 dark:text-slate-300'}>{value}</span>
      </div>
    </div>
  );
}
