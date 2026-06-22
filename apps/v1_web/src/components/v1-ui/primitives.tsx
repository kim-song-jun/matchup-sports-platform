import Link from 'next/link';
import type { CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { ChevronRightIcon } from './icons';
import { InboxIcon } from 'lucide-react';

/* ── TextField ── */
/* Carbon/Ant 표준 error a11y 패턴:
 *   (a) aria-invalid="true"       — input이 잘못된 상태임을 AT에 전달
 *   (b) aria-describedby={errorId} — error 메시지 노드 id를 input에 연결
 *   (c) id={errorId} role="alert"  — error 메시지가 자동으로 읽힘
 */

type TextFieldBaseProps = {
  /** 레이블 텍스트 */
  label: string;
  /** 선택 항목임을 표시할 때 true */
  optional?: boolean;
  /** 에러 메시지. 있으면 aria-invalid + role="alert" 자동 적용 */
  error?: string | null;
  /** 성공 메시지. error가 없을 때만 표시됨 */
  success?: string | null;
  /** 외부에서 고정 id를 주입할 때 사용 (기본값: label 기반 자동 생성) */
  fieldId?: string;
  /** label + input + helper를 묶는 컨테이너 className */
  className?: string;
};

type TextFieldInputProps = TextFieldBaseProps & InputHTMLAttributes<HTMLInputElement> & {
  multiline?: false;
  /** label 옆에 렌더할 추가 노드 (중복 확인 버튼 등) */
  action?: ReactNode;
};

type TextFieldTextareaProps = TextFieldBaseProps & TextareaHTMLAttributes<HTMLTextAreaElement> & {
  multiline: true;
  action?: never;
};

export type TextFieldProps = TextFieldInputProps | TextFieldTextareaProps;

/**
 * TextField — 레이블 + 입력 + 에러/성공 헬퍼를 하나로 묶은 a11y 표준 필드 컴포넌트.
 *
 * 에러가 있을 때:
 *  - input/textarea에 aria-invalid="true" 자동 적용
 *  - input/textarea에 aria-describedby="{fieldId}-error" 자동 적용
 *  - 에러 메시지 span에 id="{fieldId}-error" role="alert" 자동 적용
 */
export function TextField(props: TextFieldProps) {
  const { label, optional, error, success, fieldId: externalId, className, multiline, ...rest } = props;
  // id 생성: 외부 주입 > label 기반 slug
  const fieldId = externalId ?? `tf-${label.replace(/[^a-zA-Z0-9가-힣]/g, '-')}`;
  const errorId = `${fieldId}-error`;
  const successId = `${fieldId}-success`;
  const hasError = Boolean(error);
  const hasSuccess = !hasError && Boolean(success);

  const sharedAriaProps = {
    id: fieldId,
    'aria-invalid': hasError ? (true as const) : undefined,
    'aria-describedby': hasError ? errorId : hasSuccess ? successId : undefined,
  };

  return (
    <div className={`tm-create-field ${className ?? ''}`.trim()}>
      <label className="tm-text-label" htmlFor={fieldId}>
        {label}
        {optional ? <em className="tm-auth-optional" style={{ marginLeft: 4 }}>선택</em> : null}
      </label>
      {!multiline && 'action' in props && props.action ? (
        <span className="tm-auth-field-with-action">
          <input
            className={`tm-input ${hasError ? 'tm-auth-input-error' : hasSuccess ? 'tm-auth-input-success' : ''}`}
            {...sharedAriaProps}
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          />
          {props.action}
        </span>
      ) : multiline ? (
        <textarea
          className={`tm-input tm-create-input-multiline ${hasError ? 'tm-auth-input-error' : ''}`}
          {...sharedAriaProps}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          className={`tm-input ${hasError ? 'tm-auth-input-error' : hasSuccess ? 'tm-auth-input-success' : ''}`}
          {...sharedAriaProps}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {hasError ? (
        <span id={errorId} role="alert" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">
          {error}
        </span>
      ) : hasSuccess ? (
        <span id={successId} className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-success">
          {success}
        </span>
      ) : null}
    </div>
  );
}

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
        /* #6: error tone은 weight 700으로 시각 강도 격상 */
        fontWeight: isError ? 700 : undefined,
      }}
      className="tm-text-label"
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
        {/* #20: unit은 토큰 고정 15px(--font-size-body) — size 비율 대신 고정값으로 일관성 확보 */}
        <span className="tm-text-body" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{unit}</span>
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
      {/* #1: 라벨은 micro/muted로 recede — 값이 상대적으로 pop */}
      <div className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>{label}</div>
      <div className="tab-num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>
        {typeof value === 'number' ? value.toLocaleString('ko-KR') : value}
        {/* #16: unit을 tm-text-micro(11px)로 낮춰 값 숫자 단독 prominence 확보 */}
        {unit ? <span className="tm-text-micro" style={{ fontWeight: 500, color: 'var(--text-muted)', marginLeft: 2 }}>{unit}</span> : null}
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
      {/* #1: trailing(상태/수치)은 text-strong으로 — 라벨 muted와 대비 */}
      {trailing ? <div className="tm-text-label" style={{ color: 'var(--text-strong)', flexShrink: 0 }}>{trailing}</div> : null}
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
  /** Optional sub-text rendered below the value in micro/caption style. (#13: matches-page InfoRow 통합) */
  sub?: string;
  /** Optional inline badge node rendered after the value. (#2: 희소성 배지) */
  badge?: React.ReactNode;
};

export function InfoRow({ label, value, valueColor, isLast, sub, badge }: InfoRowProps) {
  return (
    <div
      className="tm-info-row"
      style={{ ...(isLast ? { borderBottom: 'none' } : {}) }}
    >
      {/* #1: 라벨은 caption/muted로 recede */}
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)', flexShrink: 0 }}>
        {label}
      </div>
      {/* #1: 값 슬롯 — body(15px)+weight600+strong으로 라벨 대비 명확한 위계 */}
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <div
          className="tm-text-body"
          style={{ fontWeight: 600, color: valueColor ?? 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}
        >
          {value}
          {/* #2: 희소성/마감 인라인 배지 */}
          {badge}
        </div>
        {/* #13: sub-text 지원 — matches-page 로컬 InfoRow 통합 */}
        {sub ? <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div> : null}
      </div>
    </div>
  );
}

/** '-' 또는 빈 값은 "정보 없음"으로 간주한다. */
function isMissing(v: number | string | undefined): boolean {
  return v === undefined || v === null || String(v).trim() === '-' || String(v).trim() === '';
}

export function WeatherStrip({ city, temp, cond, wind, feelsLike, status }: WeatherStripProps) {
  const feelsLikeVal = feelsLike ?? temp;
  const feelsLikeText = isMissing(feelsLikeVal) ? '체감 정보 없음' : `체감 ${feelsLikeVal}°`;
  const windText = isMissing(wind) ? '바람 정보 없음' : `바람 ${wind}m/s`;

  return (
    <div className="tm-weather-strip">
      <div className="tm-weather-sun" />
      <div style={{ flex: 1 }}>
        <div className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
          {city} {temp}° · {cond}
        </div>
        <div className="tm-text-micro" style={{ color: 'var(--text-muted)', marginTop: 1 }}>
          {feelsLikeText} · {windText}{status ? ` · ${status}` : ''}
        </div>
      </div>
    </div>
  );
}
