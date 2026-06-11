import Link from 'next/link';
import type { ReactNode } from 'react';

interface AdminKpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
  icon?: ReactNode;
  href?: string;
}

const TONE_VALUE: Record<NonNullable<AdminKpiCardProps['tone']>, string> = {
  neutral: 'text-blue-500',
  positive: 'text-green-500',
  warning: 'text-amber-500',
  danger: 'text-red-500',
};

const TONE_ICON: Record<NonNullable<AdminKpiCardProps['tone']>, string> = {
  neutral: 'text-blue-400',
  positive: 'text-green-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

function KpiCardInner({ label, value, sub, tone = 'neutral', icon }: Omit<AdminKpiCardProps, 'href'>) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5 lg:p-5 min-h-[80px] flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] md:text-[13px] text-gray-500 leading-tight">{label}</p>
        {icon && (
          <span className={`flex-shrink-0 ${TONE_ICON[tone]}`} aria-hidden="true">{icon}</span>
        )}
      </div>
      <p className={`text-2xl md:text-3xl lg:text-3xl font-bold tabular-nums mt-1.5 ${TONE_VALUE[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function AdminKpiCard({ label, value, sub, tone = 'neutral', icon, href }: AdminKpiCardProps) {
  if (href) {
    return (
      <Link
        href={href}
        className="block active:opacity-70 transition-opacity rounded-2xl focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        <KpiCardInner label={label} value={value} sub={sub} tone={tone} icon={icon} />
      </Link>
    );
  }
  return <KpiCardInner label={label} value={value} sub={sub} tone={tone} icon={icon} />;
}
