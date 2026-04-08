'use client';

import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface TrustSignalBannerProps {
  label: string;
  title: string;
  description: string;
  tone?: 'info' | 'warning' | 'success';
}

const toneConfig = {
  info: {
    Icon: Info,
    wrapper: 'border-slate-200 bg-slate-50 text-slate-700',
    label: 'bg-white text-slate-600',
    iconClass: 'text-slate-500',
  },
  warning: {
    Icon: AlertTriangle,
    wrapper: 'border-amber-200 bg-amber-50 text-amber-800',
    label: 'bg-white text-amber-700',
    iconClass: 'text-amber-600',
  },
  success: {
    Icon: CheckCircle2,
    wrapper: 'border-green-200 bg-green-50 text-green-800',
    label: 'bg-white text-green-700',
    iconClass: 'text-green-600',
  },
} as const;

export function TrustSignalBanner({
  label,
  title,
  description,
  tone = 'info',
}: TrustSignalBannerProps) {
  const config = toneConfig[tone];
  const Icon = config.Icon;

  return (
    <div className={`rounded-2xl border p-4 ${config.wrapper}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80">
          <Icon size={18} className={config.iconClass} />
        </div>
        <div className="min-w-0">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${config.label}`}>
            {label}
          </span>
          <p className="mt-2 text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-relaxed opacity-90">{description}</p>
        </div>
      </div>
    </div>
  );
}
