'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Scoped @keyframes for the loading spinner.
 * Injected once at module level; avoids touching globals.css (states-agent domain).
 */
const SPINNER_STYLES = `@keyframes tm-btn-spin{to{transform:rotate(360deg)}}`;

/** Inline SVG spinner — 16px, 1em stroke, rotates 360° in 0.7s. */
function Spinner() {
  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: SPINNER_STYLES }} />
      <svg
        aria-hidden="true"
        fill="none"
        height="16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        style={{ animation: 'tm-btn-spin 0.7s linear infinite', flexShrink: 0 }}
        viewBox="0 0 24 24"
        width="16"
      >
        <circle cx="12" cy="12" opacity="0.3" r="10" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
    </>
  );
}

type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
type ButtonVariant =
  | 'primary'
  | 'neutral'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'warning'
  | 'success';

export type ButtonProps = {
  /** Visual size — maps to .tm-btn-{size} */
  size?: ButtonSize;
  /** Visual variant — maps to .tm-btn-{variant} */
  variant?: ButtonVariant;
  /** Full-width block button */
  block?: boolean;
  /** Loading state: shows a spinner, sets aria-busy, prevents interaction */
  loading?: boolean;
  children?: ReactNode;
  className?: string;
  ref?: React.Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

/**
 * Button — v1 design-system button with loading state.
 *
 * Usage:
 *   <Button variant="primary" size="lg" block loading={mutation.isPending}>
 *     로그인
 *   </Button>
 *
 * When `loading` is true:
 *   - Renders a Spinner before the label (label is preserved for a11y)
 *   - Sets aria-busy="true"
 *   - Forces disabled (pointer-events:none, no focus ring in active state)
 */
export function Button({
  size = 'md',
  variant = 'primary',
  block = false,
  loading = false,
  children,
  className = '',
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  const sizeClass = size === 'icon' ? 'tm-btn-icon' : `tm-btn-${size}`;
  const variantClass = `tm-btn-${variant}`;
  const blockClass = block ? ' tm-btn-block' : '';
  const extraClass = className ? ` ${className}` : '';

  return (
    <button
      ref={ref}
      aria-busy={loading ? 'true' : undefined}
      className={`tm-btn ${sizeClass} ${variantClass}${blockClass}${extraClass}`}
      disabled={loading || disabled}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
