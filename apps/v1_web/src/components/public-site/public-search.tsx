'use client';

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Search, X } from 'lucide-react';
import { matchHelpEntries, type HelpSearchEntry } from '@/lib/public-site/help-search';
import { locationHashId } from '@/lib/public-site/location-hash';

type SearchState = {
  readonly query: string;
  readonly setQuery: (value: string) => void;
  /** null = 검색어 없음(거르지 않음). */
  readonly matched: ReadonlySet<string> | null;
};

const PublicSearchContext = createContext<SearchState | null>(null);

/**
 * 공개 페이지 검색 즉시 필터. 이미 받은 색인 위의 클라이언트 필터라 서버 요청이 없고 검색어를 URL·로그에 남기지 않는다.
 * 히어로의 검색창과 그 아래 목록이 같은 검색어를 읽도록 페이지(셸 포함)를 감싼다.
 */
export function PublicSearchProvider({ entries, children }: { entries: readonly HelpSearchEntry[]; children: ReactNode }) {
  const [query, setQuery] = useState('');
  const matched = useMemo(() => matchHelpEntries(entries, query), [entries, query]);
  const value = useMemo(() => ({ query, setQuery, matched }), [query, matched]);
  return <PublicSearchContext.Provider value={value}>{children}</PublicSearchContext.Provider>;
}

const noop = () => {};

/** 공급자 밖(검색이 없는 페이지)에서는 항상 "거르지 않음"이다. */
export function usePublicSearch() {
  const state = useContext(PublicSearchContext);
  const matched = state?.matched ?? null;
  return {
    query: state?.query ?? '',
    setQuery: state?.setQuery ?? noop,
    active: matched !== null,
    matchCount: matched?.size ?? null,
    isMatch: (key: string) => matched === null || matched.has(key),
  };
}

/**
 * 검색창. `announce` 면 결과 개수 한 줄만 role=status 로 알린다(목록 전체를 live region 으로 두지 않는다).
 * 목록 쪽이 개수를 따로 알리는 페이지(/faq·용어집)는 announce 를 끈다 — status 가 둘이면 두 번 읽힌다.
 */
export function PublicSearchField({
  label,
  placeholder,
  suggestions,
  announce = false,
}: {
  label: string;
  placeholder: string;
  suggestions?: readonly string[];
  announce?: boolean;
}) {
  const { query, setQuery, matchCount } = usePublicSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const suggestId = useId();
  const status = matchCount === null ? '' : matchCount > 0 ? `검색 결과 ${matchCount}개` : '찾는 결과가 없어요';

  return (
    <div className="tm-ps-search">
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="tm-ps-search-label" htmlFor={inputId}>{label}</label>
        <div className="tm-ps-search-box">
          <Search className="tm-ps-search-icon" size={20} aria-hidden="true" />
          <input
            ref={inputRef}
            id={inputId}
            className="tm-ps-search-input"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder={placeholder}
            aria-describedby={suggestions?.length ? suggestId : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="tm-ps-search-clear"
              aria-label="검색어 지우기"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </form>
      {suggestions?.length ? (
        <div className="tm-ps-search-suggest" id={suggestId}>
          <span className="tm-ps-search-suggest-label">많이 찾는 검색어</span>
          {suggestions.map((word) => (
            <button key={word} type="button" className="tm-chip" onClick={() => setQuery(word)}>
              {word}
            </button>
          ))}
        </div>
      ) : null}
      {announce ? <p className="tm-ps-count tm-ps-search-status" role="status">{status}</p> : null}
    </div>
  );
}

/** 검색어에 맞지 않으면 hidden 으로만 가린다 — 서버 HTML 과 딥링크 대상은 DOM 에 남는다. */
export function PublicSearchItem({
  matchKey,
  as: Tag = 'li',
  id,
  className,
  children,
}: {
  matchKey: string;
  as?: 'li' | 'div';
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const { isMatch } = usePublicSearch();
  return <Tag id={id} className={className} hidden={isMatch(matchKey) ? undefined : true}>{children}</Tag>;
}

/** 묶음 안에 맞는 항목이 하나도 없으면 묶음(제목 포함)을 통째로 가린다. */
export function PublicSearchGroup({ keys, className, children }: {
  keys: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  const { active, isMatch } = usePublicSearch();
  const empty = active && !keys.some(isMatch);
  return <div className={className} hidden={empty ? true : undefined}>{children}</div>;
}

/** 검색 결과가 0건일 때만 보이는 안내. */
export function PublicSearchEmpty({ children }: { children: ReactNode }) {
  const { matchCount } = usePublicSearch();
  return matchCount === 0 ? <div className="tm-ps-search-empty">{children}</div> : null;
}

export type PublicFilterOption<T extends string> = { readonly id: T; readonly label: string; readonly count: number };

/**
 * 분류 필터. 모바일은 가로로 넘기는 칩, `rail` 은 1024+ 에서 왼쪽 세로 레일이 된다(같은 DOM).
 * 개수는 눈으로 보는 보조 정보라 이름에서 빼고, 고른 뒤 개수는 목록의 status 가 알린다.
 */
export function PublicFilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  layout = 'chips',
}: {
  label: string;
  options: readonly PublicFilterOption<T>[];
  value: T;
  onChange: (id: T) => void;
  layout?: 'chips' | 'rail';
}) {
  return (
    <div className="tm-ps-filter" data-layout={layout} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="tm-ps-filter-btn"
          aria-pressed={value === option.id}
          data-empty={option.count === 0 ? 'true' : undefined}
          onClick={() => onChange(option.id)}
        >
          <span>{option.label}</span>
          <span className="tm-ps-filter-count" aria-hidden="true">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 필터·검색에 가려진 요소를 `#id` 딥링크로 가리키면 onHidden 으로 필터를 풀게 한다.
 * 닫힌 <details> 를 여는 일은 PublicFaqHashOpener 가 따로 맡는다.
 */
export function useRevealHashTarget(onHidden: () => void) {
  const reveal = useEffectEvent(() => {
    const id = locationHashId(window.location.hash);
    if (!id) return;
    const target = document.getElementById(id);
    if (target?.closest('[hidden]')) onHidden();
  });
  useEffect(() => {
    reveal();
    const onHashChange = () => reveal();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
}
