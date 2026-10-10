'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MapPin, Pencil, Search } from 'lucide-react';
import { AlertTriangleIcon } from '@/components/v1-ui/icons';
import { RecentVenueChips } from '@/components/v1-ui/create-form-fields';
import { KakaoMapPreview } from '@/components/v1-ui/kakao-map-preview';
import { useV1PlaceSearch } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import {
  placeFromRecentVenue,
  placeFromSearchItem,
  recentVenueFromView,
  type PlaceValue,
} from '@/lib/place';
import type { V1PlaceSearchItem, V1PlaceView, V1RecentVenue } from '@/types/api';

/** 결과 약 5줄 높이. 넘치면 목록 안에서 스크롤한다. */
const LIST_MAX_HEIGHT = 'min(320px, 45vh)';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_FALLBACK_MESSAGE = '장소를 찾지 못했어요. 잠시 후 다시 시도해 주세요.';
const SEARCH_UNAVAILABLE_MESSAGE = '지금은 장소 검색을 쓸 수 없어요. 장소 이름을 직접 입력해 주세요.';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 검색어 토큰과 일치하는 부분을 <mark> 로 감싼다(색 + 굵기로 강조해 색 단독 전달을 피한다). */
function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (tokens.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${tokens.join('|')})`, 'gi'));
  const matcher = new RegExp(`^(?:${tokens.join('|')})$`, 'i');
  return (
    <>
      {parts.map((part, index) =>
        matcher.test(part) ? (
          <mark key={index} style={{ background: 'none', color: 'var(--blue700)', fontWeight: 800 }}>{part}</mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function toRecentVenue(item: V1RecentVenue | V1PlaceView): V1RecentVenue {
  return 'placeName' in item ? item : recentVenueFromView(item);
}

export type PlacePickerProps = {
  /** 라벨 `htmlFor` 가 가리키는 입력 id. 생략하면 `useId()` 로 만든다. */
  id?: string;
  label: string;
  value: PlaceValue | null;
  onChange: (value: PlaceValue | null) => void;
  error?: string;
  /** 사용자 폼은 `V1RecentVenue[]`, 리그 어드민은 `V1PlaceView[]` 를 그대로 넘겨도 된다. */
  recentVenues?: ReadonlyArray<V1RecentVenue | V1PlaceView>;
  disabled?: boolean;
  placeholder?: string;
  /** 루트 요소에 덧붙이는 클래스(어드민 폼 간격 맞춤 등). 구조·동작은 같다. */
  className?: string;
  /** 직접 입력 이름 길이. 화면이 보내는 DTO 의 한도(`PLACE_NAME_MAX_LENGTH`)를 넘긴다. */
  maxLength: number;
};

export function PlacePicker({
  id,
  label,
  value,
  onChange,
  error,
  recentVenues,
  disabled = false,
  placeholder = '장소 이름이나 주소를 검색해요',
  className,
  maxLength,
}: PlacePickerProps) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listboxId = `${autoId}-listbox`;
  const errorId = `${autoId}-error`;
  const statusId = `${autoId}-status`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'search' | 'manual'>(value?.kind === 'manual' ? 'manual' : 'search');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const keepManualRef = useRef(false);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const [focusInputNext, setFocusInputNext] = useState(false);
  const [focusChangeNext, setFocusChangeNext] = useState(false);
  // 고른 직후에만 지도를 화면 안으로 끌어온다 — 값이 채워진 채 열린 수정 폼은 스크롤하지 않는다.
  const [justPicked, setJustPicked] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // 값이 바깥에서 null 로 초기화되거나 manual 값이 주입되면 모드를 맞춘다(수정 폼 프리필 포함).
  useEffect(() => {
    if (value?.kind === 'manual') setMode('manual');
    else if (value === null) {
      // 수동 입력 칸을 비우는 것은 모드 이탈이 아니다 — 바깥에서 null 로 초기화한 경우만 검색으로 돌아간다.
      if (keepManualRef.current) keepManualRef.current = false;
      else setMode('search');
    }
  }, [value]);

  useEffect(() => {
    if (focusInputNext) {
      inputRef.current?.focus();
      setFocusInputNext(false);
    }
  }, [focusInputNext, mode, value]);

  // 선택 직후 콤보박스가 사라지므로 포커스를 "바꾸기" 버튼으로 옮겨 body 로 떨어지지 않게 한다.
  useEffect(() => {
    if (focusChangeNext && value?.kind === 'picked') {
      changeButtonRef.current?.focus();
      setFocusChangeNext(false);
    }
  }, [focusChangeNext, value]);

  const searchActive = mode === 'search' && value === null && debouncedQuery.length >= 1;
  const search = useV1PlaceSearch(debouncedQuery, { enabled: searchActive });
  const items: V1PlaceSearchItem[] = searchActive ? (search.data?.items ?? []) : [];
  // 입력과 디바운스 값이 어긋난 동안엔 직전 결과가 보이므로 "결과 없음" 판정은 최신 검색이 끝난 뒤에만 한다.
  const settled = searchActive && !search.isFetching && debouncedQuery === query.trim();
  const unavailable = search.error instanceof V1ApiError && search.error.code === 'PLACE_SEARCH_UNAVAILABLE';
  const hasError = searchActive && search.isError;
  const listVisible = open && searchActive && !hasError && items.length > 0;
  const listRef = useRef<HTMLUListElement>(null);
  // 목록은 흐름 안에 그려져 하단 고정 버튼(만들기 CTA·모달 저장 줄)에 가릴 수 있다 — 열릴 때 한 번 보이게 한다.
  // 목록 높이를 LIST_MAX_HEIGHT 로 묶어 두어야 이 스크롤이 입력칸을 화면 위로 밀어내지 않는다.
  useEffect(() => {
    if (listVisible) listRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [listVisible]);
  const manualOptionIndex = items.length;
  const recent = useMemo(() => (recentVenues ?? []).map(toRecentVenue), [recentVenues]);

  function switchToManual(initialName: string) {
    setMode('manual');
    setOpen(false);
    setActiveIndex(-1);
    setQuery('');
    setDebouncedQuery('');
    setJustPicked(false);
    keepManualRef.current = !initialName.trim() && value !== null;
    onChange(initialName.trim() ? { kind: 'manual', name: initialName.trim() } : null);
    setFocusInputNext(true);
  }

  function switchToSearch() {
    setMode('search');
    onChange(null);
    setQuery('');
    setJustPicked(false);
    setFocusInputNext(true);
  }

  function selectItem(item: V1PlaceSearchItem) {
    onChange(placeFromSearchItem(item));
    setQuery('');
    setDebouncedQuery('');
    setOpen(false);
    setActiveIndex(-1);
    setFocusChangeNext(true);
    setJustPicked(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (listVisible) {
        // 열린 목록만 닫고 바깥 모달의 ESC 로는 전파하지 않는다.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }
    if (!searchActive || items.length === 0) return;
    const lastIndex = manualOptionIndex;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current >= lastIndex ? 0 : current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? lastIndex : current - 1));
    } else if (event.key === 'Enter' && listVisible) {
      // 목록이 열려 있을 때의 Enter 는 폼 제출이 아니라 항목 선택이다.
      event.preventDefault();
      if (activeIndex === manualOptionIndex) switchToManual(query);
      else if (activeIndex >= 0) selectItem(items[activeIndex]);
    }
  }

  const describedBy = [error ? errorId : null, searchActive ? statusId : null].filter(Boolean).join(' ') || undefined;
  const optionId = (index: number) => `${autoId}-option-${index}`;
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${autoId}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, autoId]);

  return (
    <div className={['tm-create-field', className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className="tm-text-label">{label}</label>
      {value?.kind === 'picked' ? (
        <div
          style={{
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-control)',
            background: 'var(--surface)',
            padding: '12px 14px',
            marginTop: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <MapPin size={18} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--blue700)', marginTop: 2, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{value.name}</div>
              {value.address ? (
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{value.address}</div>
              ) : null}
            </div>
            <button
              id={inputId}
              ref={changeButtonRef}
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              aria-label={`${label} 바꾸기`}
              aria-describedby={error ? errorId : undefined}
              disabled={disabled}
              onClick={switchToSearch}
            >
              바꾸기
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <KakaoMapPreview
              name={value.name}
              latitude={value.latitude}
              longitude={value.longitude}
              revealOnShow={justPicked}
            />
          </div>
        </div>
      ) : mode === 'manual' ? (
        <>
          <div className={`tm-create-input ${error ? 'tm-create-input-error' : ''}`}>
            <Pencil size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--text-caption)', flex: 'none' }} />
            <input
              id={inputId}
              ref={inputRef}
              className="tm-create-native-input"
              type="text"
              value={value?.name ?? ''}
              placeholder="장소 이름을 직접 입력해요"
              maxLength={maxLength}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              onChange={(event) => {
                const name = event.target.value;
                keepManualRef.current = !name.trim() && value !== null;
                onChange(name.trim() ? { kind: 'manual', name } : null);
              }}
            />
          </div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            이름만 저장돼요. 지도는 보이지 않고, 상세 화면에서는 지도 앱 이름 검색으로 안내해요.
          </div>
          <button
            type="button"
            className="tm-btn tm-btn-sm tm-btn-neutral"
            style={{ marginTop: 8 }}
            disabled={disabled}
            onClick={switchToSearch}
          >
            <Search size={14} strokeWidth={2} aria-hidden="true" />
            검색으로 장소 찾기
          </button>
        </>
      ) : (
        <>
          <div className={`tm-create-input ${error ? 'tm-create-input-error' : ''}`}>
            <Search size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--text-caption)', flex: 'none' }} />
            <input
              id={inputId}
              ref={inputRef}
              className="tm-create-native-input"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={listVisible}
              aria-controls={listboxId}
              aria-activedescendant={listVisible && activeIndex >= 0 ? optionId(activeIndex) : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              autoComplete="off"
              value={query}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="장소 검색 결과"
            hidden={!listVisible}
            style={{
              scrollMarginBottom: 120,
              listStyle: 'none',
              margin: '8px 0 0',
              padding: 0,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              background: 'var(--surface)',
              maxHeight: LIST_MAX_HEIGHT,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}
          >
            {items.map((item, index) => {
              const active = index === activeIndex;
              return (
                <li
                  key={item.providerPlaceId}
                  id={optionId(index)}
                  role="option"
                  className="tm-on-tint"
                  aria-selected={active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    padding: '12px 14px',
                    minHeight: 56,
                    // 키보드로 고른 항목이 바닥에 붙은 직접 입력 줄(48px)에 가리지 않게.
                    scrollMarginBottom: 56,
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--grey100)',
                    background: active ? 'var(--blue50)' : undefined,
                  }}
                >
                  <MapPin size={18} strokeWidth={2} aria-hidden="true" style={{ color: active ? 'var(--blue700)' : 'var(--grey600)', marginTop: 2, flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                      <Highlight text={item.name} query={query} />
                    </div>
                    {item.address || item.jibunAddress ? (
                      <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{item.address ?? item.jibunAddress}</div>
                    ) : null}
                    {item.category ? (
                      <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>{item.category}</div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            <li
              id={optionId(manualOptionIndex)}
              role="option"
              className="tm-on-tint"
              aria-selected={activeIndex === manualOptionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => switchToManual(query)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: 48,
                padding: '12px 14px',
                cursor: 'pointer',
                // 결과가 많아 목록 안에서 스크롤해도 직접 입력 출구는 늘 보이게 바닥에 붙인다.
                position: 'sticky',
                bottom: 0,
                background: activeIndex === manualOptionIndex ? 'var(--blue50)' : 'var(--grey50)',
              }}
            >
              <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>찾는 곳이 없나요?</span>
              <b className="tm-text-caption" style={{ color: 'var(--blue700)' }}>이름만 직접 입력</b>
            </li>
          </ul>
          <div id={statusId} role="status" aria-live="polite">
            {searchActive && search.isFetching && items.length === 0 ? (
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8 }}>장소를 찾고 있어요…</div>
            ) : null}
            {hasError ? (
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                <p style={{ margin: 0 }}>
                  {unavailable ? SEARCH_UNAVAILABLE_MESSAGE : extractErrorMessage(search.error, SEARCH_FALLBACK_MESSAGE)}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {unavailable ? null : (
                    <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" onClick={() => void search.refetch()}>
                      다시 시도
                    </button>
                  )}
                  <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" onClick={() => switchToManual(query)}>
                    이름만 직접 입력
                  </button>
                </div>
              </div>
            ) : null}
            {settled && !hasError && items.length === 0 ? (
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                <p style={{ margin: 0 }}>검색 결과가 없어요. 이름을 다시 확인하거나 직접 입력해 주세요.</p>
                <button
                  type="button"
                  className="tm-btn tm-btn-sm tm-btn-neutral"
                  style={{ marginTop: 8 }}
                  onClick={() => switchToManual(query)}
                >
                  이름만 직접 입력
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
      {recent.length > 0 && !disabled ? (
        <RecentVenueChips
          items={recent}
          selectedValue={value?.name}
          onSelect={(venue) => {
            const next = placeFromRecentVenue(venue);
            if (!next) return;
            setMode(next.kind === 'manual' ? 'manual' : 'search');
            onChange(next);
            if (next.kind === 'picked') {
              setFocusChangeNext(true);
              setJustPicked(true);
            }
          }}
        />
      ) : null}
      {error ? (
        <div id={errorId} className="tm-create-field-error" role="alert">
          <AlertTriangleIcon size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
