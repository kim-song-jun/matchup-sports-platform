import {
  CheckCircle,
  Clock,
  CreditCard,
  GraduationCap,
  RotateCcw,
  ShoppingBag,
  Trophy,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { Payment } from '@/types/api';

// ── Toss Payments widget integration ──
// When NEXT_PUBLIC_TOSS_CLIENT_KEY is absent, falls back to a mock confirm flow.

export type TossWidgetInstance = {
  /** Render the payment selection UI into the given container element */
  renderPaymentMethods: (selector: string, amount: { value: number }) => Promise<void>;
  /** Render the agreement terms UI into the given container element */
  renderAgreement: (selector: string) => Promise<void>;
  /** Trigger the payment flow; resolves when the user completes or rejects */
  requestPayment: (params: {
    orderId: string;
    orderName: string;
    customerName: string;
    successUrl: string;
    failUrl: string;
  }) => Promise<void>;
};

/**
 * Initialise the Toss Payments widget SDK.
 *
 * Returns `null` when the client key env var is missing so callers can
 * fall back to the mock payment flow instead.
 */
export async function initTossWidget(
  customerKey: string,
  amount: number,
): Promise<TossWidgetInstance | null> {
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) {
    return null;
  }

  // Dynamically import the SDK to keep it out of the initial bundle.
  // The package is an optional peer dependency; we guard at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sdkModule: any;
  try {
    // Use a variable to prevent Vite from statically resolving this import
    const sdkName = '@tosspayments/payment-widget-sdk';
    sdkModule = await (Function('name', 'return import(name)') as (name: string) => Promise<any>)(sdkName);
  } catch {
    console.warn('[payment-ui] @tosspayments/payment-widget-sdk not installed — falling back to mock');
    return null;
  }

  const { loadTossPayments } = sdkModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tossPayments: any = await loadTossPayments(clientKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const widget: any = tossPayments.widgets({ customerKey });

  await widget.setAmount({ currency: 'KRW', value: amount });

  return {
    renderPaymentMethods: (selector: string, amountObj: { value: number }) =>
      widget.renderPaymentMethods({ selector, variantKey: 'DEFAULT' }, amountObj),
    renderAgreement: (selector: string) =>
      widget.renderAgreement({ selector }),
    requestPayment: (params: {
      orderId: string;
      orderName: string;
      customerName: string;
      successUrl: string;
      failUrl: string;
    }) =>
      widget.requestPayment(params),
  };
}

type PaymentIcon = typeof CheckCircle;
type PaymentBannerTone = 'info' | 'warning';
type PaymentModeState = 'ready' | 'mock' | 'unavailable';
type PaymentModeMeta = {
  state: PaymentModeState;
  label: string;
  title: string;
  description: string;
  tone: PaymentBannerTone;
};

export const paymentStatusConfig: Record<string, { label: string; icon: PaymentIcon; color: string; bgColor: string }> = {
  completed: { label: '결제 완료', icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50' },
  pending: { label: '결제 대기', icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  refunded: { label: '환불 완료', icon: RotateCcw, color: 'text-red-500', bgColor: 'bg-red-50' },
  failed: { label: '결제 실패', icon: XCircle, color: 'text-gray-500', bgColor: 'bg-gray-100' },
  partial_refunded: { label: '부분 환불', icon: RotateCcw, color: 'text-red-500', bgColor: 'bg-red-50' },
};

const paymentMethodConfig: Record<string, { label: string; icon: PaymentIcon }> = {
  card: { label: '카드', icon: CreditCard },
  tosspay: { label: '토스페이', icon: Wallet },
  toss_pay: { label: '토스페이', icon: Wallet },
  naverpay: { label: '네이버페이', icon: Wallet },
  naver_pay: { label: '네이버페이', icon: Wallet },
  kakaopay: { label: '카카오페이', icon: Wallet },
  kakao_pay: { label: '카카오페이', icon: Wallet },
  transfer: { label: '계좌이체', icon: Wallet },
};

const paymentSourceConfig = {
  match: { label: '매치', icon: Trophy, color: 'bg-slate-100 text-slate-600' },
  lesson: { label: '강좌', icon: GraduationCap, color: 'bg-slate-100 text-slate-600' },
  marketplace: { label: '장터', icon: ShoppingBag, color: 'bg-slate-100 text-slate-600' },
  unknown: { label: '결제', icon: CreditCard, color: 'bg-slate-100 text-slate-600' },
} as const;

const mockStatusLabels: Partial<Record<string, string>> = {
  completed: '테스트 결제 완료',
  pending: '테스트 결제 대기',
  refunded: '테스트 환불 완료',
  failed: '테스트 결제 실패',
  partial_refunded: '테스트 부분 환불',
};

function hasTossClientKey() {
  return Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);
}

function createReadyMode(): PaymentModeMeta {
  return {
    state: 'ready',
    label: '실결제',
    title: '실제 결제 연동이 활성화되어 있어요',
    description: '카드사 청구와 환불이 실제 결제사 연동 기준으로 처리됩니다.',
    tone: 'info',
  };
}

function createMockMode(): PaymentModeMeta {
  return {
    state: 'mock',
    label: '테스트 결제',
    title: '현재는 결제 시뮬레이션으로 동작해요',
    description: '이 흐름은 테스트 기록만 남기며 실제 청구나 실환불은 발생하지 않습니다.',
    tone: 'warning',
  };
}

function createUnavailableMode(): PaymentModeMeta {
  return {
    state: 'unavailable',
    label: '실결제 연동 비활성화',
    title: '지금은 실결제 환불을 처리할 수 없어요',
    description: 'legacy 실결제 기록은 유지되지만 현재 환경에서는 mock 결제만 환불 상태를 변경할 수 있습니다.',
    tone: 'warning',
  };
}

export function getCheckoutPaymentMode(): PaymentModeMeta {
  return createMockMode();
}

export function getRecordedPaymentMode(
  payment?: Pick<Payment, 'pgProvider'> | null,
): PaymentModeMeta {
  if (payment?.pgProvider === 'mock') {
    return createMockMode();
  }

  if (payment?.pgProvider === 'toss' && !hasTossClientKey()) {
    return createUnavailableMode();
  }

  if (!payment?.pgProvider) {
    return createUnavailableMode();
  }

  return createReadyMode();
}

export function getPaymentStatusMeta(
  payment?: Pick<Payment, 'status' | 'pgProvider'> | null,
) {
  const statusKey = payment?.status ?? 'pending';
  const status = paymentStatusConfig[statusKey] ?? paymentStatusConfig.pending;
  const paymentMode = getRecordedPaymentMode(payment);

  if (paymentMode.state !== 'mock') {
    return status;
  }

  return {
    ...status,
    label: mockStatusLabels[statusKey] ?? `테스트 ${status.label}`,
  };
}

export function getPaymentTimelineLabels(
  payment?: Pick<Payment, 'pgProvider'> | null,
) {
  const paymentMode = getRecordedPaymentMode(payment);

  if (paymentMode.state === 'mock') {
    return {
      completed: '테스트 결제 완료',
      refunded: '테스트 환불 완료',
    };
  }

  return {
    completed: '결제 완료',
    refunded: '환불 완료',
  };
}

export function getPaymentMethodDescription(
  payment: Pick<Payment, 'paymentKey' | 'pgProvider'>,
) {
  const paymentMode = getRecordedPaymentMode(payment);

  if (paymentMode.state === 'mock') {
    return '테스트 결제 기록입니다. 실제 승인 키 발급이나 카드 청구는 발생하지 않았습니다.';
  }

  if (paymentMode.state === 'unavailable') {
    return payment.paymentKey
      ? `승인 키 ${payment.paymentKey} · 현재는 실결제 환불 연동이 비활성화되어 있습니다.`
      : '실결제 기록입니다. 현재는 실결제 환불 연동이 비활성화되어 있습니다.';
  }

  return payment.paymentKey
    ? `승인 키 ${payment.paymentKey}`
    : '결제 수단이 저장되었습니다.';
}

export function getPaymentMethodMeta(method: string | null | undefined) {
  if (!method) {
    return paymentMethodConfig.card;
  }

  return paymentMethodConfig[method] ?? paymentMethodConfig.card;
}

export function getPaymentSource(payment: Payment) {
  if (payment.participant?.match) {
    const match = payment.participant.match;
    return {
      kind: 'match' as const,
      ...paymentSourceConfig.match,
      title: match.title,
      href: `/matches/${match.id}`,
      scheduledAt: buildScheduledAt(match.matchDate, match.startTime),
      venueName: match.venue?.name ?? match.venueName ?? null,
      venueAddress: match.venue?.address ?? match.venueAddress ?? null,
    };
  }

  if (payment.sourceType === 'lesson') {
    return {
      kind: 'lesson' as const,
      ...paymentSourceConfig.lesson,
      title: payment.sourceName ?? payment.orderId,
      href: null,
      scheduledAt: null,
      venueName: null,
      venueAddress: null,
    };
  }

  if (payment.sourceType === 'marketplace') {
    return {
      kind: 'marketplace' as const,
      ...paymentSourceConfig.marketplace,
      title: payment.sourceName ?? payment.orderId,
      href: null,
      scheduledAt: null,
      venueName: null,
      venueAddress: null,
    };
  }

  return {
    kind: 'unknown' as const,
    ...paymentSourceConfig.unknown,
    title: payment.sourceName ?? payment.orderId,
    href: null,
    scheduledAt: null,
    venueName: null,
    venueAddress: null,
  };
}

export function buildPaymentReceiptNumber(orderId: string) {
  const normalized = orderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `RCP-${normalized.slice(-12) || 'UNKNOWN'}`;
}

export function getRefundPolicy(startAt?: string | null) {
  if (!startAt) {
    return {
      percentage: 0,
      label: '환불 기준 없음',
      description: '시작 시간이 없어 환불 가능 여부를 계산할 수 없어요.',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    };
  }

  const hoursUntilStart = (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilStart > 24) {
    return {
      percentage: 100,
      label: '전액 환불',
      description: '경기 시작 24시간 전까지는 전액 환불됩니다.',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    };
  }

  if (hoursUntilStart > 1) {
    return {
      percentage: 50,
      label: '50% 환불',
      description: '경기 시작 1시간 전까지는 50% 환불됩니다.',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    };
  }

  return {
    percentage: 0,
    label: '환불 불가',
    description: '경기 시작 1시간 이내에는 환불할 수 없습니다.',
    color: 'text-red-500',
    bgColor: 'bg-red-50',
  };
}

export function buildScheduledAt(matchDate?: string, startTime?: string) {
  if (!matchDate || !startTime) {
    return null;
  }

  const normalizedDate = matchDate.includes('T') ? matchDate.slice(0, 10) : matchDate;
  const normalizedTime = startTime.length >= 8 ? startTime.slice(0, 8) : `${startTime}:00`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return null;
  }

  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(normalizedTime)) {
    return null;
  }

  return `${normalizedDate}T${normalizedTime}`;
}
