import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRightIcon } from './icons';

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
};

export function SectionTitle({ title, sub, action, actionHref }: SectionTitleProps) {
  const actionContent = (
    <>
      {action}
      <ChevronRightIcon size={14} strokeWidth={2.2} />
    </>
  );

  return (
    <div className="tm-section-title" style={{ alignItems: sub ? 'flex-start' : 'center' }}>
      <div>
        <div className="tm-text-body-lg">{title}</div>
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

type PageHeaderProps = { readonly title: string; readonly eyebrow?: string; readonly description?: string; readonly action?: ReactNode };

export function PageHeader({ title, eyebrow, description, action }: PageHeaderProps) {
  return (
    <header className="tm-page-header">
      <div className="tm-page-header-main">
        {eyebrow ? <div className="tm-page-eyebrow">{eyebrow}</div> : null}
        <h1 className="tm-page-title">{title}</h1>
        {description ? <p className="tm-page-description">{description}</p> : null}
      </div>
      {action ? <div className="tm-page-actions">{action}</div> : null}
    </header>
  );
}

type FilterRailProps = { readonly title: string; readonly children: ReactNode };

export function FilterRail({ title, children }: FilterRailProps) {
  return (
    <aside className="tm-filter-rail" aria-label={title}>
      <div className="tm-filter-rail-title">{title}</div>
      <div className="tm-filter-rail-list">{children}</div>
    </aside>
  );
}

type FilterPillProps = { readonly children: ReactNode; readonly active?: boolean; readonly count?: number };

export function FilterPill({ children, active = false, count }: FilterPillProps) {
  return (
    <button className="tm-filter-pill" type="button" data-active={active}>
      <span>{children}</span>
      {typeof count === 'number' ? <span className="tm-filter-pill-count">{count}</span> : null}
    </button>
  );
}

type MetricCardProps = { readonly label: string; readonly value: string; readonly delta?: string; readonly tone?: 'up' | 'down' | 'neutral' };

export function MetricCard({ label, value, delta, tone = 'neutral' }: MetricCardProps) {
  return (
    <div className="tm-metric-card">
      <div className="tm-metric-label">{label}</div>
      <div className="tm-metric-value">{value}</div>
      {delta ? <div className="tm-metric-delta" data-tone={tone}>{delta}</div> : null}
    </div>
  );
}

type ActionPanelProps = { readonly title: string; readonly description?: string; readonly action: ReactNode };

export function ActionPanel({ title, description, action }: ActionPanelProps) {
  return (
    <section className="tm-action-panel">
      <div>
        <div className="tm-action-panel-title">{title}</div>
        {description ? <div className="tm-action-panel-description">{description}</div> : null}
      </div>
      <div className="tm-action-panel-control">{action}</div>
    </section>
  );
}

type TwoColumnLayoutProps = { readonly main: ReactNode; readonly aside: ReactNode };

export function TwoColumnLayout({ main, aside }: TwoColumnLayoutProps) {
  return (
    <div className="tm-two-column-layout">
      <section className="tm-two-column-main">{main}</section>
      <aside className="tm-two-column-aside">{aside}</aside>
    </div>
  );
}

export function MobileFixedCTA({ children }: { readonly children: ReactNode }) {
  return <div className="tm-fixed-cta tm-mobile-fixed-cta">{children}</div>;
}
