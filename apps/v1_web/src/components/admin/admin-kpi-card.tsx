import Link from 'next/link';
import type { ReactNode } from 'react';

interface AdminKpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
  icon?: ReactNode;
  href?: string;
  /** 페이지 이동(href) 대신 화면 안 동작(탭 전환 등)을 걸 때. href 가 있으면 href 가 우선. */
  onClick?: () => void;
  /** Accessible label for screen readers (falls back to label + value) */
  ariaLabel?: string;
}

/* 값은 24~30px 라 큰 글씨 완화(3:1)를 받지만, green-500 은 흰 지면에서 2.22:1 로
   그것조차 못 넘는다(--green700 은 5.40:1). blue-500 3.71 · red-500 3.81 은 완화
   기준을 넘지만 label·sub 와 같은 카드 안에서 혼자 약해 보여 --blue700/--red700 로
   함께 맞춘다. */
const TONE_VALUE: Record<NonNullable<AdminKpiCardProps['tone']>, string> = {
  neutral: 'text-[var(--blue700)]',
  positive: 'text-[var(--green700)]',
  warning: 'text-[var(--orange700)]',
  danger: 'text-[var(--red700)]',
};

const TONE_ICON: Record<NonNullable<AdminKpiCardProps['tone']>, string> = {
  neutral: 'text-blue-400',
  positive: 'text-green-400',
  warning: 'text-[var(--orange700)]',
  danger: 'text-red-400',
};

/* #10: danger/warning tone일 때 카드 배경·테두리로 시각 강도 격상 */
const TONE_WRAPPER: Record<NonNullable<AdminKpiCardProps['tone']>, string> = {
  neutral: 'bg-[var(--card-surface)] border-[var(--border)]',
  positive: 'bg-[var(--card-surface)] border-[var(--border)]',
  // tm-on-tint: 틴트 지면 위 muted 캡션을 grey700 으로(grey600 은 tint-orange 4.27 · red50 4.02 로 AA 미달)
  warning: 'tm-on-tint bg-[var(--tint-orange)] border-[var(--tint-orange-border)]',
  danger: 'tm-on-tint bg-[var(--red50)] border-red-100',
};

function KpiCardInner({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: Omit<AdminKpiCardProps, 'href' | 'ariaLabel'>) {
  return (
    <div className={`${TONE_WRAPPER[tone]} rounded-2xl border p-4 md:p-5 min-h-[80px] flex flex-col justify-between`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[length:var(--font-size-caption)] md:text-[length:var(--font-size-label)] text-[var(--text-muted)] leading-tight">{label}</p>
        {icon && (
          <span className={`flex-shrink-0 ${TONE_ICON[tone]}`} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <p className={`text-2xl md:text-3xl font-bold tabular-nums mt-2 ${TONE_VALUE[tone]}`}>
        {value}
      </p>
      {sub && <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

export function AdminKpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  href,
  onClick,
  ariaLabel,
}: AdminKpiCardProps) {
  const derivedAriaLabel = ariaLabel ?? `${label}: ${value}`;

  if (!href && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={derivedAriaLabel}
        className="block w-full min-h-[44px] rounded-2xl text-left active:opacity-70 transition-opacity focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        <KpiCardInner label={label} value={value} sub={sub} tone={tone} icon={icon} />
      </button>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        aria-label={derivedAriaLabel}
        className="block min-h-[44px] rounded-2xl active:opacity-70 transition-opacity focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        <KpiCardInner label={label} value={value} sub={sub} tone={tone} icon={icon} />
      </Link>
    );
  }

  return (
    <div aria-label={derivedAriaLabel}>
      <KpiCardInner label={label} value={value} sub={sub} tone={tone} icon={icon} />
    </div>
  );
}
