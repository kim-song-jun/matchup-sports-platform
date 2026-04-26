'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { NumberDisplay } from '@/components/ui/number-display';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type MetricStatTone = 'default' | 'positive' | 'negative' | 'warning';

export interface MetricStatProps {
  label: string;
  value: number | string;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  icon?: ReactNode;
  loading?: boolean;
  tone?: MetricStatTone;
  href?: string;
  className?: string;
}

const toneCard: Record<MetricStatTone, string> = {
  default: 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700',
  positive: 'bg-success/5 border-success/20',
  negative: 'bg-error/5 border-error/20',
  warning: 'bg-warning/5 border-warning/20',
};

const tonePill: Record<MetricStatTone, string> = {
  default: 'hidden',
  positive: 'bg-success/10 text-success text-xs font-medium px-2 py-0.5 rounded-full',
  negative: 'bg-error/10 text-error dark:text-red-400 text-xs font-medium px-2 py-0.5 rounded-full',
  warning: 'bg-warning/10 text-warning dark:text-orange-400 text-xs font-medium px-2 py-0.5 rounded-full',
};

const toneValueColor: Record<MetricStatTone, string> = {
  default: 'text-gray-900 dark:text-white',
  positive: 'text-gray-900 dark:text-white',
  negative: 'text-error dark:text-red-400',
  warning: 'text-warning dark:text-orange-400',
};

const TONE_PILL_LABEL: Record<Exclude<MetricStatTone, 'default'>, string> = {
  positive: '양호',
  negative: '주의',
  warning: '경고',
};

function buildAriaLabel(
  label: string,
  value: number | string,
  unit?: string,
  delta?: number,
): string {
  const valueStr = typeof value === 'number' ? value.toLocaleString('ko-KR') : value;
  const unitStr = unit ?? '';
  if (delta === undefined || delta === null) return `${label}: ${valueStr}${unitStr}`;
  if (delta === 0) return `${label}: ${valueStr}${unitStr}, 변동 없음`;
  const direction = delta > 0 ? '증가' : '감소';
  return `${label}: ${valueStr}${unitStr}, ${direction} ${Math.abs(delta).toFixed(1)}%`;
}

function DeltaRow({ delta, deltaLabel }: { delta: number; deltaLabel?: string }) {
  if (delta > 0) {
    return (
      <p className="mt-1 flex items-center gap-1 text-sm text-success" aria-live="polite">
        <span aria-hidden="true">↑</span>
        <span>+{delta.toFixed(1)}%</span>
        {deltaLabel && <span className="text-gray-500 dark:text-gray-400">{deltaLabel}</span>}
      </p>
    );
  }
  if (delta < 0) {
    return (
      <p className="mt-1 flex items-center gap-1 text-sm text-error dark:text-red-400" aria-live="polite">
        <span aria-hidden="true">↓</span>
        <span>{delta.toFixed(1)}%</span>
        {deltaLabel && <span className="text-gray-500 dark:text-gray-400">{deltaLabel}</span>}
      </p>
    );
  }
  // delta === 0
  return (
    <p className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
      <span aria-hidden="true">–</span>
      <span>변동 없음</span>
      {deltaLabel && <span>{deltaLabel}</span>}
    </p>
  );
}

function MetricStatBody({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  icon,
  loading,
  tone = 'default',
}: Omit<MetricStatProps, 'href' | 'className'>) {
  const resolvedTone = tone ?? 'default';

  return (
    <div className={cn('rounded-2xl border p-5 transition-colors', toneCard[resolvedTone])}>
      {/* Top row: icon left, tone-pill right */}
      <div className="flex items-start justify-between gap-3 mb-3 min-h-[20px]">
        {icon ? (
          <span className="flex items-center justify-center text-gray-400 dark:text-gray-500" aria-hidden="true">
            {icon}
          </span>
        ) : (
          <span />
        )}
        {resolvedTone !== 'default' && (
          <span className={tonePill[resolvedTone]}>
            {TONE_PILL_LABEL[resolvedTone as Exclude<MetricStatTone, 'default'>]}
          </span>
        )}
      </div>

      {/* Value row */}
      {loading ? (
        <Skeleton className="h-10 w-24 rounded-lg" aria-hidden="true" />
      ) : typeof value === 'number' ? (
        <NumberDisplay
          value={value}
          unit={unit}
          size="xl"
          tone={
            resolvedTone === 'negative'
              ? 'negative'
              : resolvedTone === 'positive'
              ? 'positive'
              : 'default'
          }
          className={toneValueColor[resolvedTone]}
        />
      ) : (
        <p className={cn('text-4xl font-extrabold tabular-nums', toneValueColor[resolvedTone])}>
          {value}
          {unit && <span className="ml-0.5 text-2xl font-bold">{unit}</span>}
        </p>
      )}

      {/* Label */}
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{label}</p>

      {/* Delta */}
      {!loading && delta !== undefined && delta !== null && (
        <DeltaRow delta={delta} deltaLabel={deltaLabel} />
      )}
    </div>
  );
}

/**
 * Reusable metric/KPI stat card with tone variants, delta indicator, and optional Link wrapping.
 * Use for admin dashboards and any numeric KPI surface.
 */
export function MetricStat({ href, className, ...rest }: MetricStatProps) {
  const ariaLabel = rest.loading
    ? `${rest.label}: 로딩 중`
    : buildAriaLabel(rest.label, rest.value, rest.unit, rest.delta);

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-2xl';

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={cn('block min-h-[44px]', focusRing, className)}>
        <MetricStatBody {...rest} />
      </Link>
    );
  }

  return (
    <div aria-label={ariaLabel} className={cn('min-h-[44px]', className)}>
      <MetricStatBody {...rest} />
    </div>
  );
}
