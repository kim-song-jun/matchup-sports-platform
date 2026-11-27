'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ActionLabel, type ActionSheetAction } from './action-sheet';
import { useTopmostEscape } from './use-topmost-escape';

const MARGIN = 16;
const GAP = 8;
const MIN_HEIGHT = 160;

const ROW_CLASS =
  'flex min-h-[44px] w-full flex-row items-center gap-3 rounded-[var(--radius-chip)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

interface ActionMenuPopoverProps {
  readonly label: string;
  readonly subtitle?: string;
  /** `ActionMenu` 가 `onSelect` 에 닫기를 이미 엮어 둔 항목. */
  readonly actions: readonly ActionSheetAction[];
  readonly header?: ReactNode;
  readonly align: 'start' | 'end';
  /** 트리거를 감싼 요소 — 위치 기준이자 포커스를 돌려줄 곳. */
  readonly anchorRef: RefObject<HTMLElement | null>;
  /** 메뉴를 닫으며 포커스를 트리거로 돌려준다(ESC·Tab). */
  readonly focusTrigger: () => void;
  readonly onClose: () => void;
}

interface Segment {
  readonly groupLabel: string | undefined;
  readonly actions: ActionSheetAction[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** 앞 항목과 `groupLabel` 이 다른 곳마다 새 묶음을 연다(`ActionSheet` 와 같은 규칙). */
function toSegments(actions: readonly ActionSheetAction[]): Segment[] {
  const segments: Segment[] = [];
  for (const action of actions) {
    const last = segments[segments.length - 1];
    if (last && last.groupLabel === action.groupLabel) last.actions.push(action);
    else segments.push({ groupLabel: action.groupLabel, actions: [action] });
  }
  return segments;
}

/**
 * 데스크톱(768px 이상) ⋯ 메뉴 팝오버. `body` 로 포털해 탭 줄·표 래퍼의 `overflow` 에 잘리지 않고,
 * 위치는 열릴 때 트리거 기준으로 한 번 잡는다 — 이후 스크롤·크기 변화는 위치를 따라가지 않고 닫는다.
 */
export function ActionMenuPopover({ label, subtitle, actions, header, align, anchorRef, focusTrigger, onClose }: ActionMenuPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const subtitleId = useId();
  const [position, setPosition] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - MARGIN;
    const above = rect.top - MARGIN;
    const next: CSSProperties = {};
    if (below < MIN_HEIGHT && above > below) {
      next.bottom = window.innerHeight - rect.top + GAP;
      next.maxHeight = Math.max(MIN_HEIGHT, above - GAP);
    } else {
      next.top = rect.bottom + GAP;
      next.maxHeight = Math.max(MIN_HEIGHT, below - GAP);
    }
    const room = window.innerWidth - MARGIN - menu.offsetWidth;
    if (align === 'end') next.right = clamp(window.innerWidth - rect.right, MARGIN, room);
    else next.left = clamp(rect.left, MARGIN, room);
    setPosition(next);
  }, [anchorRef, align]);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []).filter(
      (item) => !(item instanceof HTMLButtonElement && item.disabled),
    );

  // 위치가 잡히기 전 첫 렌더는 visibility:hidden 이라 브라우저가 포커스를 거부한다 — 보이게 된 뒤에 건다.
  const placed = position !== null;
  useEffect(() => {
    if (placed) (items()[0] ?? menuRef.current)?.focus({ preventScroll: true });
    // 열린 동안 한 번만 — 항목은 매 렌더 새로 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

  useTopmostEscape({
    open: true,
    onEscape: () => {
      focusTrigger();
      onClose();
    },
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (menuRef.current?.contains(target) || anchorRef.current?.contains(target))) return;
      onClose();
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorRef, onClose]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      // 기본 Tab 이동은 막지 않는다 — 트리거에서 출발하므로 메뉴 다음(Shift+Tab 은 이전) 컨트롤로 간다.
      focusTrigger();
      onClose();
      return;
    }
    const enabled = items();
    if (enabled.length === 0) return;
    const current = enabled.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (current + 1) % enabled.length;
    else if (event.key === 'ArrowUp') next = current <= 0 ? enabled.length - 1 : current - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else return;
    event.preventDefault();
    enabled[next].focus({ preventScroll: true });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      aria-describedby={subtitle ? subtitleId : undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="w-[360px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-2 shadow-[var(--shadow-dropdown)]"
      style={{
        position: 'fixed',
        // SideSheet(--z-modal) 안의 트리거에서도 열려야 해서 그 위 층이다.
        zIndex: 'var(--z-modal-top)',
        ...(position ?? { top: 0, left: 0, visibility: 'hidden' }),
      }}
    >
      {subtitle ? (
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{label}</p>
          <p id={subtitleId} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            {subtitle}
          </p>
        </div>
      ) : null}
      {header ? <div className="px-2.5 pb-2">{header}</div> : null}
      {toSegments(actions).map((segment, index) => (
        <div
          key={segment.actions[0].key}
          role={segment.groupLabel ? 'group' : undefined}
          aria-label={segment.groupLabel}
          className={index > 0 ? 'mt-1 border-t border-[var(--border)] pt-1' : undefined}
        >
          {segment.groupLabel ? (
            <p
              aria-hidden="true"
              className="px-2.5 pb-1 pt-1.5 text-[length:var(--font-size-caption)] font-bold text-[var(--text-muted)]"
            >
              {segment.groupLabel}
            </p>
          ) : null}
          {segment.actions.map((action) => (
            <MenuItem key={action.key} action={action} onClose={onClose} />
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

function MenuItem({ action, onClose }: { action: ActionSheetAction; onClose: () => void }) {
  if (action.externalHref !== undefined) {
    return (
      <a
        role="menuitem"
        tabIndex={-1}
        href={action.externalHref}
        target={action.newTab ? '_blank' : undefined}
        rel={action.newTab ? 'noopener noreferrer' : undefined}
        className={ROW_CLASS}
        onClick={onClose}
      >
        <ActionLabel action={action}>{action.description}</ActionLabel>
      </a>
    );
  }
  if (action.href !== undefined) {
    return (
      <Link role="menuitem" tabIndex={-1} href={action.href} className={ROW_CLASS} onClick={onClose}>
        <ActionLabel action={action}>{action.description}</ActionLabel>
      </Link>
    );
  }
  return (
    <button
      type="button"
      role={action.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={action.checked}
      tabIndex={-1}
      disabled={action.disabled}
      className={ROW_CLASS}
      onClick={action.onSelect}
    >
      <ActionLabel action={action}>
        {action.disabled && action.disabledReason ? action.disabledReason : action.description}
      </ActionLabel>
    </button>
  );
}
