'use client';

import { useId } from 'react';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────
export interface StatusOption {
  value: string;
  label: string;
}

interface AdminFilterBarProps {
  /** Visually-hidden label text for the search input (for a11y) */
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  statusOptions?: StatusOption[];
  activeStatus?: string;
  onStatusChange?: (value: string) => void;
  /** Optional content injected to the right of the chips row */
  rightSlot?: ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────
export function AdminFilterBar({
  searchLabel = '검색',
  searchPlaceholder = '검색어 입력',
  searchValue,
  onSearchChange,
  statusOptions,
  activeStatus,
  onStatusChange,
  rightSlot,
}: AdminFilterBarProps) {
  const inputId = useId();

  return (
    <div className="flex flex-col gap-2.5">
      {/* Search row */}
      <div className="relative">
        {/* Visually-hidden label (linked via htmlFor) */}
        <label htmlFor={inputId} className="sr-only">
          {searchLabel}
        </label>
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          aria-hidden="true"
        >
          <Search size={16} />
        </span>
        <input
          id={inputId}
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className={[
            'w-full h-[44px] pl-9 pr-4 text-sm bg-white border border-gray-200 rounded-xl',
            'placeholder:text-gray-400 text-gray-900',
            'transition-colors focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
          ].join(' ')}
        />
      </div>

      {/* Status chip row */}
      {(statusOptions && statusOptions.length > 0) || rightSlot ? (
        <div className="flex items-center gap-2 flex-wrap">
          {statusOptions && statusOptions.length > 0 && onStatusChange && (
            <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="상태 필터">
              {statusOptions.map((opt) => {
                const active = activeStatus === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onStatusChange(opt.value)}
                    aria-pressed={active}
                    className={[
                      'inline-flex items-center px-3 min-h-[44px] rounded-full text-[13px] font-medium transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                      active
                        ? 'bg-blue-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
          {rightSlot && <div className="ml-auto flex items-center gap-2">{rightSlot}</div>}
        </div>
      ) : null}
    </div>
  );
}
