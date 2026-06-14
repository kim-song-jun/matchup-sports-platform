import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRightIcon } from './icons';
import { InboxIcon } from 'lucide-react';

/* ── AlertBanner ── */

type AlertBannerTone = 'error' | 'info' | 'warning';

const ALERT_BANNER_STYLES: Record<AlertBannerTone, { bg: string; color: string }> = {
  error:   { bg: 'var(--red50)',    color: 'var(--red500)'    },
  info:    { bg: 'var(--blue50)',   color: 'var(--blue500)'   },
  warning: { bg: 'var(--orange50)', color: 'var(--orange500)' },
};

export function AlertBanner({
  message,
  tone = 'error',
}: {
  message: string;
  tone?: AlertBannerTone;
}) {
  const s = ALERT_BANNER_STYLES[tone];
  // error만 즉시 공지(assertive), info/warning은 비긴급이라 polite 공지로 스크린리더를 끊지 않음
  const isError = tone === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        background: s.bg,
        color: s.color,
        lineHeight: 1.55,
      }}
      className="tm-text-caption"
    >
      {message}
    </div>
  );
}

type CardProps = {
  children: ReactNode;
  pad?: number;
  className?: string;
  style?: CSSProperties;
};

export function Card({ children, pad = 20, className = '', style }: CardProps) {
  return (
    <div className={`tm-card ${className}`.trim()} style={{ padding: pad, ...style }}>
      {children}
    </div>
  );
}

type NumberDisplayProps = {
  value: number | string;
  unit?: string;
  size?: number;
  sub?: string;
};

export function NumberDisplay({ value, unit = '원', size = 32, sub }: NumberDisplayProps) {
  return (
    <div>
      <div
        className="tab-num"
        style={{
          fontSize: size,
          fontWeight: 700,
          letterSpacing: 0,
          color: 'var(--text-strong)',
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
        }}
      >
        {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
        <span style={{ fontSize: size * 0.5, fontWeight: 600, color: 'var(--text-muted)' }}>{unit}</span>
      </div>
      {sub ? <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

type KPIStatProps = {
  label: string;
  value: number | string;
  unit?: string;
};

export function KPIStat({ label, value, unit }: KPIStatProps) {
  return (
    <div>
      <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="tab-num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>
        {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
        {unit ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 2 }}>{unit}</span> : null}
      </div>
    </div>
  );
}

type SectionTitleProps = {
  title: string;
  sub?: string;
  action?: string;
  actionHref?: string;
  /** Optional id placed on the title element so aria-labelledby references resolve. */
  id?: string;
};

export function SectionTitle({ title, sub, action, actionHref, id }: SectionTitleProps) {
  const actionContent = (
    <>
      {action}
      <ChevronRightIcon size={14} strokeWidth={2.2} />
    </>
  );

  return (
    <div className="tm-section-title" style={{ alignItems: sub ? 'flex-start' : 'center' }}>
      <div>
        <div id={id} className="tm-text-body-lg">{title}</div>
        {sub ? <div className="tm-text-caption" style={{ marginTop: 4 }}>{sub}</div> : null}
      </div>
      {action && actionHref ? (
        <Link className="tm-section-action" href={actionHref}>
          {actionContent}
        </Link>
      ) : action ? (
        <button className="tm-section-action" type="button">{actionContent}</button>
      ) : null}
    </div>
  );
}

type ListItemProps = {
  title: string;
  sub?: string;
  trailing?: string;
  chev?: boolean;
  href?: string;
};

export function ListItem({ title, sub, trailing, chev, href }: ListItemProps) {
  const content = (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-body" style={{ color: 'var(--text-strong)', lineHeight: 1.35 }}>
          {title}
        </div>
        {sub ? <div className="tm-text-caption" style={{ marginTop: 2 }}>{sub}</div> : null}
      </div>
      {trailing ? <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>{trailing}</div> : null}
      {chev ? <ChevronRightIcon size={18} stroke="var(--text-caption)" strokeWidth={2} /> : null}
    </>
  );

  return href ? (
    <Link className="tm-list-row tm-pressable" href={href}>
      {content}
    </Link>
  ) : (
    <div className="tm-list-row">
      {content}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  sub: string;
  cta?: string;
  onCta?: () => void;
  /** Lucide icon node rendered inside the blue circle. Defaults to InboxIcon. */
  icon?: ReactNode;
};

export function EmptyState({ title, sub, cta, onCta, icon }: EmptyStateProps) {
  return (
    <div className="tm-empty-state">
      <div className="tm-empty-icon" aria-hidden="true">
        {icon ?? <InboxIcon size={36} strokeWidth={1.5} />}
      </div>
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
        {sub}
      </div>
      {cta ? (
        <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" style={{ marginTop: 24 }} onClick={onCta}>
          {cta}
        </button>
      ) : null}
    </div>
  );
}

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title = '오류가 발생했어요',
  message,
  onRetry,
  retryLabel = '다시 시도하기',
}: ErrorStateProps) {
  return (
    <div className="tm-empty-state" role="alert">
      <div className="tm-empty-icon" aria-hidden="true" style={{ background: 'var(--red50)', color: 'var(--red500)' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
        {message}
      </div>
      {onRetry ? (
        <button
          className="tm-btn tm-btn-sm tm-btn-outline"
          type="button"
          style={{ marginTop: 24 }}
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

type WeatherStripProps = {
  city: string;
  temp: number | string;
  cond: string;
  wind: number | string;
  feelsLike?: number | string;
  status?: string;
};

type InfoRowProps = {
  label: string;
  value: string;
  valueColor?: string;
  /** Pass true on the final row of a card to remove the redundant bottom hairline. */
  isLast?: boolean;
};

export function InfoRow({ label, value, valueColor, isLast }: InfoRowProps) {
  return (
    <div
      className="tm-info-row"
      style={{ ...(isLast ? { borderBottom: 'none' } : {}) }}
    >
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
        {label}
      </div>
      <div className="tm-text-label" style={{ textAlign: 'right', color: valueColor ?? 'var(--text-strong)' }}>
        {value}
      </div>
    </div>
  );
}

export function WeatherStrip({ city, temp, cond, wind, feelsLike, status }: WeatherStripProps) {
  const displayedFeelsLike = feelsLike ?? temp;

  return (
    <div className="tm-weather-strip">
      <div className="tm-weather-sun" />
      <div style={{ flex: 1 }}>
        <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
          {city} {temp}° · {cond}
        </div>
        <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 1 }}>
          체감 {displayedFeelsLike}° · 바람 {wind}m/s{status ? ` · ${status}` : ''}
        </div>
      </div>
    </div>
  );
}
