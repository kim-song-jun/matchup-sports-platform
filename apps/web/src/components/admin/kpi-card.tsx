'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: number;
  href?: string;
  tone?: 'default' | 'warning';
  icon?: ReactNode;
  isLoading?: boolean;
}

function KpiCardInner({ label, value, tone, icon, isLoading }: Omit<KpiCardProps, 'href'>) {
  const isWarning = tone === 'warning';
  return (
    <div
      className={`rounded-2xl border p-5 transition-colors ${
        isWarning
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        {icon && (
          <span
            className={`flex items-center justify-center ${isWarning ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>
      {isLoading ? (
        <div
          className="h-10 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
          aria-hidden="true"
        />
      ) : (
        <p
          className={`text-4xl font-bold tabular-nums ${
            isWarning ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
          }`}
        >
          {value.toLocaleString('ko-KR')}
        </p>
      )}
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

/**
 * KPI card for admin dashboards.
 * Wraps in a Link when href is provided; falls back to a div.
 * tone='warning' applies red background and red value text.
 */
export function KpiCard({ label, value, href, tone, icon, isLoading }: KpiCardProps) {
  const ariaLabel = isLoading ? `${label}: 로딩 중` : `${label}: ${value.toLocaleString('ko-KR')}`;

  if (href) {
    return (
      <Link
        href={href}
        role="region"
        aria-label={ariaLabel}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-2xl"
      >
        <KpiCardInner label={label} value={value} tone={tone} icon={icon} isLoading={isLoading} />
      </Link>
    );
  }

  return (
    <div role="region" aria-label={ariaLabel}>
      <KpiCardInner label={label} value={value} tone={tone} icon={icon} isLoading={isLoading} />
    </div>
  );
}
