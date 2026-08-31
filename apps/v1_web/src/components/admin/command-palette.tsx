'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Search, Shield, User } from 'lucide-react';
import { useV1AdminGlobalSearch } from '@/hooks/use-v1-api';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { AdminStatusPill } from './admin-status-pill';

/**
 * 어드민 전역 검색 팔레트 (⌘K / Ctrl+K) — 회원·팀·매치를 한 입력에서 찾아 바로 이동한다.
 * 회원·팀은 상세 페이지로 딥링크하고, 매치는 상세 페이지가 아직 없어(M7 예정) 목록으로 이동한다.
 */

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  key: string;
  group: '회원' | '팀' | '매치';
  label: string;
  sublabel: string | null;
  status: string;
  href: string;
}

const SEARCH_DEBOUNCE_MS = 300;

const GROUP_ICON = {
  회원: User,
  팀: Shield,
  매치: CalendarDays,
} as const;

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const listRef = useRef<HTMLUListElement>(null);

  const { data, isFetching } = useV1AdminGlobalSearch(query);

  // 포커스 저장/복원(WCAG 2.4.3) + 첫 포커스 이동 + ESC 닫기 + focus trap +
  // body 스크롤 잠금 + backdrop 클릭 닫기는 공용 훅에 위임한다.
  const { dialogRef, initialFocusRef: inputRef, onBackdropClick } = useModalA11y<
    HTMLInputElement,
    HTMLDivElement
  >({ open, onClose });

  // 열릴 때 입력 초기화 (포커스 자체는 훅이 처리)
  useEffect(() => {
    if (open) {
      setInput('');
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // 검색 debounce
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, open]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!data) return [];
    return [
      ...data.users.map((hit) => ({
        key: `user-${hit.userId}`,
        group: '회원' as const,
        label: hit.label,
        sublabel: hit.sublabel,
        status: hit.status,
        href: `/admin/users/${hit.userId}`,
      })),
      ...data.teams.map((hit) => ({
        key: `team-${hit.teamId}`,
        group: '팀' as const,
        label: hit.label,
        sublabel: null,
        status: hit.status,
        href: `/admin/teams/${hit.teamId}`,
      })),
      ...data.matches.map((hit) => ({
        key: `match-${hit.matchId}`,
        group: '매치' as const,
        label: hit.label,
        sublabel: hit.sublabel,
        status: hit.status,
        href: '/admin/matches',
      })),
    ];
  }, [data]);

  // 결과가 바뀌면 첫 항목으로
  useEffect(() => {
    setActiveIndex(0);
  }, [items.length, query]);

  const navigate = (item: PaletteItem) => {
    onClose();
    router.push(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 결과가 없으면 화살표 키를 가로채지 않는다 (입력 커서 이동 유지 + 인덱스 -1 방지)
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[activeIndex]) {
      e.preventDefault();
      navigate(items[activeIndex]);
    }
  };

  // 활성 항목이 스크롤 밖으로 나가지 않게
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const showEmpty = query.length > 0 && !isFetching && items.length === 0;

  let lastGroup: PaletteItem['group'] | null = null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/40 backdrop-blur-[2px] p-4 pt-[12vh]"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="전역 검색"
        className="w-full max-w-[560px] rounded-2xl bg-[var(--card-surface)] border border-[var(--border)] shadow-xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* 입력 */}
        <div className="flex items-center gap-3 px-4 border-b border-[var(--border)]">
          <Search size={16} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="회원 닉네임·이메일, 팀명, 매치명 검색"
            aria-label="회원·팀·매치 전역 검색"
            className="flex-1 min-h-[52px] bg-transparent text-[15px] text-[var(--text-strong)] placeholder:text-[var(--text-muted)] outline-none"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="command-palette-results"
            aria-activedescendant={items[activeIndex] ? `palette-item-${activeIndex}` : undefined}
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
            ESC
          </kbd>
        </div>

        {/* 결과 */}
        <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
          {query.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
              검색어를 입력하면 회원·팀·매치를 한 번에 찾아요.
            </p>
          )}
          {isFetching && query.length > 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]" role="status">
              검색 중…
            </p>
          )}
          {showEmpty && (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]" role="status">
              &ldquo;{query}&rdquo;에 맞는 결과가 없어요.
            </p>
          )}
          {!isFetching && items.length > 0 && (
            <ul ref={listRef} id="command-palette-results" role="listbox" aria-label="검색 결과" className="py-2">
              {items.map((item, index) => {
                const showGroupHeader = item.group !== lastGroup;
                lastGroup = item.group;
                const GroupIcon = GROUP_ICON[item.group];
                return (
                  <li key={item.key}>
                    {showGroupHeader && (
                      <p className="flex items-center gap-2 px-4 pt-3 pb-1 text-[length:var(--font-size-micro)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        <GroupIcon size={11} aria-hidden="true" />
                        {item.group}
                        {item.group === '매치' && (
                          <span className="font-normal normal-case">— 목록으로 이동</span>
                        )}
                      </p>
                    )}
                    <button
                      type="button"
                      id={`palette-item-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={index === activeIndex}
                      onClick={() => navigate(item)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={[
                        'flex w-full items-center gap-3 px-4 min-h-[44px] text-left transition-colors',
                        index === activeIndex ? 'bg-[var(--blue50)]' : 'hover:bg-[var(--surface-soft)]',
                      ].join(' ')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-[var(--text-strong)]">
                          {item.label}
                        </span>
                        {item.sublabel && (
                          <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
                            {item.sublabel}
                          </span>
                        )}
                      </span>
                      <AdminStatusPill status={item.status} />
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
