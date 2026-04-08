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

type PaymentIcon = typeof CheckCircle;

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

function buildScheduledAt(matchDate?: string, startTime?: string) {
  if (!matchDate || !startTime) {
    return null;
  }

  return `${matchDate}T${startTime}`;
}
