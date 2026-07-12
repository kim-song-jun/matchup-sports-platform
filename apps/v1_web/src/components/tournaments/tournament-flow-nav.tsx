'use client';

import Link from 'next/link';

interface TournamentFlowNavProps {
  prev: { href: string; label: string };
  next?: {
    href: string;
    label: string;
    enabled: boolean;
    disabledHint?: string;
  };
}

/**
 * 대회 서브 페이지 하단 이전/다음 흐름 네비게이터.
 * tm-btn 기반으로 앱 전체 버튼 스타일과 통일.
 */
export function TournamentFlowNav({ prev, next }: TournamentFlowNavProps) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: 8,
        padding: '12px 20px 24px',
        borderTop: '1px solid var(--grey100)',
        marginTop: 8,
      }}
      aria-label="대회 페이지 이동"
    >
      {/* 이전 — ghost 스타일 */}
      <Link
        href={prev.href}
        className="tm-btn tm-btn-md tm-btn-ghost"
        style={{ flexShrink: 0, gap: 6 }}
        aria-label={`${prev.label}으로 이동`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6" />
        </svg>
        {prev.label}
      </Link>

      {/* 다음 — primary / disabled */}
      {next && next.enabled ? (
        <Link
          href={next.href}
          className="tm-btn tm-btn-md tm-btn-primary"
          style={{ flex: 1, justifyContent: 'space-between' }}
          aria-label={`${next.label}으로 이동`}
        >
          <span>{next.label}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      ) : next && !next.enabled ? (
        <button
          type="button"
          disabled
          className="tm-btn tm-btn-md tm-btn-primary"
          style={{ flex: 1, justifyContent: 'space-between', opacity: 0.42, cursor: 'not-allowed' }}
          aria-label={next.disabledHint ?? `${next.label} 준비 중`}
          title={next.disabledHint}
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
            <span>{next.label}</span>
            {next.disabledHint && (
              <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.75 }}>{next.disabledHint}</span>
            )}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      ) : null}
    </nav>
  );
}

