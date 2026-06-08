import Link from 'next/link';

interface AdminKpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
  href?: string;
}

const TONE_CLASSES: Record<NonNullable<AdminKpiCardProps['tone']>, string> = {
  neutral: 'text-blue-500',
  positive: 'text-green-500',
  warning: 'text-amber-500',
  danger: 'text-red-500',
};

function KpiCardInner({ label, value, sub, tone = 'neutral' }: Omit<AdminKpiCardProps, 'href'>) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-[13px] text-gray-500">{label}</p>
      <p className={`text-3xl font-bold tabular-nums mt-1 ${TONE_CLASSES[tone]}`}>{value}</p>
      {sub && <p className="text-[12px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function AdminKpiCard({ label, value, sub, tone = 'neutral', href }: AdminKpiCardProps) {
  if (href) {
    return (
      <Link href={href} className="block hover:opacity-80 transition-opacity">
        <KpiCardInner label={label} value={value} sub={sub} tone={tone} />
      </Link>
    );
  }
  return <KpiCardInner label={label} value={value} sub={sub} tone={tone} />;
}
