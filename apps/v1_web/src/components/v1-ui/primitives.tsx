import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRightIcon } from './icons';

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
  return (
    <div
      role="alert"
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
};

export function EmptyState({ title, sub, cta, onCta }: EmptyStateProps) {
  return (
    <div className="tm-empty-state">
      <div className="tm-empty-icon" />
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

type WeatherStripProps = {
  city: string;
  temp: number | string;
  cond: string;
  wind: number | string;
  feelsLike?: number | string;
  status?: string;
};

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
