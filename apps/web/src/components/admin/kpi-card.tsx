'use client';

import type { ReactNode } from 'react';
import { MetricStat } from '@/components/ui/metric-stat';

interface KpiCardProps {
  label: string;
  value: number;
  href?: string;
  tone?: 'default' | 'warning';
  icon?: ReactNode;
  isLoading?: boolean;
}

/**
 * KPI card for admin dashboards.
 * Delegates rendering to MetricStat; external API (props) is unchanged.
 * tone='warning' applies warning palette via MetricStat.
 */
export function KpiCard({ label, value, href, tone, icon, isLoading }: KpiCardProps) {
  return (
    <MetricStat
      label={label}
      value={value}
      href={href}
      tone={tone ?? 'default'}
      icon={icon}
      loading={isLoading}
    />
  );
}
