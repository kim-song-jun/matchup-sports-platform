'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────
export interface EntityPickerItem {
  id: string;
  label: string;
  description?: string;
}

interface EntityPickerProps {
  /** input id (label htmlFor 연결용) */
  id: string;
  value: EntityPickerItem | null;
  onChange: (item: EntityPickerItem | null) => void;
  /** 로컬 모드: 내부에서 입력어로 label/description 부분일치 필터 */
  items?: EntityPickerItem[];
  /** 서버 모드: 300ms debounce 후 호출. items는 호출자가 최신 결과로 갱신 */
  onSearch?: (q: string) => void;
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** true면 목록에 없는 입력도 Enter/blur 시 { id: '', label: 입력값 }로 onChange */
  allowFreeText?: boolean;
  emptyText?: string;
  /** 전달 시 목록 최상단에 "선택 해제" 옵션 노출 → onChange(null) */
  clearLabel?: string;
}

type MenuEntry = { kind: 'clear' } | { kind: 'item'; item: EntityPickerItem };

// ── Component ─────────────────────────────────────────────────────────────
export function EntityPicker({
  id,
  value,
  onChange,
  items,
  onSearch,
  loading = false,
  placeholder = '검색',
  disabled = false,
  allowFreeText = false,
  emptyText = '검색 결과가 없어요',
  clearLabel,
}: EntityPickerProps) {
  const [inputValue, setInputValue] = useState('');
  const [debouncedValue, setDebouncedValue] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuId = `${id}-menu`;
  const isServerMode = !!onSearch;

  // Debounce raw input → drives onSearch (server mode) + local filter query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(inputValue.trim()), 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  useEffect(() => {
    onSearch?.(debouncedValue);
    setHighlightIdx(-1);
    // onSearch identity is expected to be stable (caller-provided callback); only re-run on query change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue]);

  // External clear (e.g. parent resets selection) → reset internal search text
  useEffect(() => {
    if (value === null) {
      setInputValue('');
      setDebouncedValue('');
      setOpen(false);
      setHighlightIdx(-1);
    }
  }, [value]);

  const sourceItems = items ?? [];
  const displayItems = isServerMode
    ? sourceItems
    : debouncedValue
      ? sourceItems.filter((it) => {
          const q = debouncedValue.toLowerCase();
          return (
            it.label.toLowerCase().includes(q) ||
            (it.description ?? '').toLowerCase().includes(q)
          );
        })
      : sourceItems;

  const menuEntries: MenuEntry[] = [
    ...(clearLabel ? [{ kind: 'clear' as const }] : []),
    ...displayItems.map((item) => ({ kind: 'item' as const, item })),
  ];

  const hasQuery = debouncedValue.length > 0;
  const showMenu = open && (hasQuery || !isServerMode || !!clearLabel);
  const safeHighlightIdx = highlightIdx >= 0 && highlightIdx < menuEntries.length ? highlightIdx : -1;

  // 가상 하이라이트: DOM focus를 옮기면 input blur → closeMenu로 메뉴가
  // 즉시 닫혀 키보드 선택이 불가능해진다. 포커스는 input에 고정하고
  // aria-activedescendant + 스크롤만 이동한다.
  function scrollHighlightIntoView(idx: number) {
    const els = menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    els?.[idx]?.scrollIntoView({ block: 'nearest' });
  }

  function moveHighlight(dir: 1 | -1) {
    if (menuEntries.length === 0) return;
    const prev = safeHighlightIdx;
    const next = prev < 0 ? (dir === 1 ? 0 : menuEntries.length - 1) : (prev + dir + menuEntries.length) % menuEntries.length;
    setHighlightIdx(next);
    scrollHighlightIntoView(next);
  }

  function closeMenu() {
    setOpen(false);
    setHighlightIdx(-1);
  }

  function commitEntry(entry: MenuEntry) {
    onChange(entry.kind === 'clear' ? null : entry.item);
    setInputValue('');
    setDebouncedValue('');
    closeMenu();
  }

  function commitFreeTextIfNeeded() {
    if (!allowFreeText) return;
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onChange({ id: '', label: trimmed });
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (!showMenu) return;
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === 'ArrowUp') {
      if (!showMenu) return;
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === 'Enter') {
      // 항상 막는다 — 안 막으면 상위 form submit으로 새서 의도치 않은 저장이 발생한다
      e.preventDefault();
      if (safeHighlightIdx >= 0) {
        commitEntry(menuEntries[safeHighlightIdx]);
      } else if (allowFreeText) {
        commitFreeTextIfNeeded();
        closeMenu();
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setInputValue('');
        setDebouncedValue('');
        closeMenu();
      }
    }
  }

  // ── Selected state — chip display + clear button ──────────────────────────
  if (value) {
    return (
      <div className="flex items-center justify-between h-[44px] px-3 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex flex-col min-w-0">
          <span className="text-[var(--font-size-label)] font-semibold text-blue-800 truncate">
            {value.label}
          </span>
          {value.description && (
            <span className="text-[var(--font-size-micro)] text-blue-600 truncate">{value.description}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label="선택 해제"
          className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50 shrink-0"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  // ── Search state — input + dropdown menu ───────────────────────────────────
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
        <Search size={16} aria-hidden="true" />
      </div>
      <input
        id={id}
        ref={inputRef}
        type="search"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          commitFreeTextIfNeeded();
          closeMenu();
        }}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={showMenu}
        aria-controls={showMenu ? menuId : undefined}
        aria-activedescendant={safeHighlightIdx >= 0 ? `${menuId}-opt-${safeHighlightIdx}` : undefined}
        className={[
          'w-full h-[44px] pl-9 pr-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900',
          'placeholder:text-gray-400',
          'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
          'transition-colors disabled:opacity-50',
        ].join(' ')}
        autoComplete="off"
      />
      {/* Search results dropdown — combobox+listbox+option 패턴, 하이라이트는 aria-activedescendant */}
      {showMenu && (
        <div
          ref={menuRef}
          id={menuId}
          // mousedown preventDefault: 스크롤바·여백 클릭이 input blur → 메뉴 닫힘으로 이어지지 않게
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-[48px] bg-white border border-gray-200 rounded-xl shadow-md z-20 overflow-hidden max-h-[240px] overflow-y-auto"
        >
          {loading ? (
            <p className="px-4 py-3 text-[var(--font-size-label)] text-gray-400">검색 중…</p>
          ) : menuEntries.length === 0 ? (
            <p className="px-4 py-3 text-[var(--font-size-label)] text-gray-400">{emptyText}</p>
          ) : (
            <div role="listbox" id={`${menuId}-list`} aria-label={`${placeholder} 결과`}>
              {menuEntries.map((entry, idx) => {
                const key = entry.kind === 'clear' ? '__clear__' : entry.item.id || entry.item.label;
                const highlighted = safeHighlightIdx === idx;
                if (entry.kind === 'clear') {
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      id={`${menuId}-opt-${idx}`}
                      aria-selected={highlighted}
                      tabIndex={-1}
                      onClick={() => commitEntry(entry)}
                      className={[
                        'w-full flex items-center px-4 py-2.5 min-h-[44px] text-left border-b border-gray-100',
                        'hover:bg-gray-50 transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                        highlighted ? 'bg-gray-50' : '',
                      ].join(' ')}
                    >
                      <span className="text-[var(--font-size-label)] font-medium text-gray-500">
                        {clearLabel}
                      </span>
                    </button>
                  );
                }
                const { item } = entry;
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    id={`${menuId}-opt-${idx}`}
                    aria-selected={highlighted}
                    tabIndex={-1}
                    onClick={() => commitEntry(entry)}
                    className={[
                      'w-full flex flex-col items-start px-4 py-2.5 min-h-[44px] text-left',
                      'hover:bg-blue-50 transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                      highlighted ? 'bg-blue-50' : '',
                    ].join(' ')}
                  >
                    <span className="text-[var(--font-size-label)] font-semibold text-gray-900">
                      {item.label}
                    </span>
                    {item.description && (
                      <span className="text-[var(--font-size-caption)] text-gray-400">{item.description}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
