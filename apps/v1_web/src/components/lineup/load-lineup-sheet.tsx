'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { EmptyState } from '@/components/v1-ui/primitives';
import type { LoadableEntry } from './lineup-source';

/** 불러올 수 있는 라인업 한 건 — 과거 경기와 프리셋이 같은 모양으로 들어온다. */
export type LoadableLineup = {
  key: string;
  kind: 'history' | 'preset';
  /** "제1회 몰큐브컵 · 8강" 또는 프리셋 이름 */
  title: string;
  /** "vs FC상대 · 8월 10일" 또는 "선발 11 · 후보 5" */
  subtitle: string;
  sportName: string | null;
  formation: string | null;
  starterCount: number;
  entries: LoadableEntry[];
};

type LoadLineupSheetProps = {
  open: boolean;
  onClose: () => void;
  history: LoadableLineup[];
  presets: LoadableLineup[];
  /** 지금 이 화면의 종목. 다른 종목의 라인업에는 경고 배지를 붙인다(막지는 않는다). */
  currentSportName: string | null;
  loading?: boolean;
  onSelect: (lineup: LoadableLineup) => void;
};

/**
 * "이전 라인업 불러오기" 시트.
 *
 * 데이터를 스스로 가져오지 않는다 — 두 라인업 화면(대회 경기·팀 매치)은 상태 타입이
 * 서로 달라서, 이 시트는 **무엇을 골랐는지만** 알려주고 실제 적용은 각 화면이 자기
 * 리듀서로 한다. 그래야 한쪽 화면의 사정이 다른 쪽으로 새지 않는다.
 */
export function LoadLineupSheet({
  open,
  onClose,
  history,
  presets,
  currentSportName,
  loading = false,
  onSelect,
}: LoadLineupSheetProps) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-load-lineup-title`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [tab, setTab] = useState<'history' | 'preset'>('history');

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      const id = setTimeout(() => closeButtonRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
    const element = previousFocusRef.current;
    if (element && typeof (element as HTMLElement).focus === 'function') {
      (element as HTMLElement).focus();
    }
    previousFocusRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // focus trap — confirm-modal.tsx와 같은 규칙을 쓴다.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const items = tab === 'history' ? history : presets;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full sm:max-w-[420px] rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: 'var(--card-surface)',
          boxShadow: '0 8px 32px rgba(20,28,45,0.14)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: '20px 20px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700 }}>
            이전 라인업 불러오기
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className="tm-btn tm-btn-sm tm-btn-neutral"
            onClick={onClose}
            aria-label="불러오기 닫기"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            닫기
          </button>
        </div>

        <div role="tablist" aria-label="불러올 라인업 종류" style={{ display: 'flex', gap: 8, padding: '12px 20px 0' }}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={`tm-btn tm-btn-sm ${tab === 'history' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            onClick={() => setTab('history')}
          >
            최근 경기 ({history.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preset'}
            className={`tm-btn tm-btn-sm ${tab === 'preset' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            onClick={() => setTab('preset')}
          >
            저장한 프리셋 ({presets.length})
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '12px 20px 20px', flex: 1 }}>
          {loading ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)', padding: '16px 0' }}>
              불러오는 중이에요…
            </p>
          ) : items.length === 0 ? (
            <EmptyState
              title={tab === 'history' ? '아직 저장된 라인업이 없어요' : '저장한 프리셋이 없어요'}
              sub={
                tab === 'history'
                  ? '경기 라인업을 한 번 제출하면 다음부터 여기서 그대로 불러올 수 있어요.'
                  : '자주 쓰는 명단을 프리셋으로 저장해 두면 여기서 바로 불러올 수 있어요.'
              }
            />
          ) : (
            <ul style={{ display: 'grid', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((item) => {
                const sportMismatch =
                  item.sportName !== null && currentSportName !== null && item.sportName !== currentSportName;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      style={{
                        width: '100%',
                        minHeight: 44,
                        textAlign: 'left',
                        padding: 16,
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'var(--card-surface)',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <span className="tm-text-label" style={{ fontWeight: 700 }}>
                        {item.title}
                      </span>
                      <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                        {item.subtitle}
                      </span>
                      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        <Badge>선발 {item.starterCount}명</Badge>
                        {item.formation !== null ? <Badge>{item.formation}</Badge> : null}
                        {sportMismatch ? <Badge tone="warn">{item.sportName} 라인업</Badge> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warn' }) {
  const isWarn = tone === 'warn';
  return (
    <span
      className="tm-text-micro"
      style={{
        padding: '2px 8px',
        borderRadius: 999,
        fontWeight: 600,
        // 색만으로 뜻을 전하지 않는다 — 경고는 문구 자체("○○ 라인업")가 이유를 말한다.
        border: `1px solid ${isWarn ? 'var(--orange700)' : 'var(--border)'}`,
        color: isWarn ? 'var(--orange700)' : 'var(--text-muted)',
        background: isWarn ? 'var(--orange50)' : 'transparent',
      }}
    >
      {children}
    </span>
  );
}
