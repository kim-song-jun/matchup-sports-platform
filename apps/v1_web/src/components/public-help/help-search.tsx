'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import {
  HELP_SEARCH_KIND_LABEL,
  searchHelpIndex,
  type HelpSearchEntry,
} from '@/lib/public-site/help-search';

/**
 * 도움말 검색. 이미 받은 색인 위의 클라이언트 필터라 서버 요청이 없고, 검색어를 URL·로그에 남기지 않는다.
 * 결과 개수 한 줄만 role=status 로 알린다(결과 목록 전체를 live region 으로 두지 않는다).
 */
export function HelpSearch({
  index,
  suggestions,
}: {
  index: readonly HelpSearchEntry[];
  suggestions: readonly string[];
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();
  const trimmed = query.trim();
  const results = trimmed ? searchHelpIndex(index, trimmed) : [];
  const status = !trimmed ? '' : results.length > 0 ? `검색 결과 ${results.length}개` : '찾는 결과가 없어요';

  return (
    <div className="tm-help-search">
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="tm-help-search-label" htmlFor={inputId}>질문·가이드·용어 검색</label>
        <div className="tm-help-search-field">
          <input
            ref={inputRef}
            id={inputId}
            className="tm-input tm-help-search-input"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="예: 환불, 명단, 결과"
            aria-describedby={hintId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="tm-help-search-clear"
              aria-label="검색어 지우기"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      </form>
      <div className="tm-help-suggest" id={hintId}>
        <span className="tm-help-suggest-label">많이 찾는 검색어</span>
        {suggestions.map((word) => (
          <button key={word} type="button" className="tm-chip" onClick={() => setQuery(word)}>
            {word}
          </button>
        ))}
      </div>
      <p className="tm-ps-count tm-help-search-status" role="status">{status}</p>
      {results.length > 0 ? (
        <ul className="tm-help-results" aria-label="검색 결과">
          {results.map((entry) => (
            <li key={entry.href}>
              <Link className="tm-help-result" href={entry.href}>
                <span className="tm-help-result-kind">{HELP_SEARCH_KIND_LABEL[entry.kind]}</span>
                <span className="tm-help-result-title">{entry.title}</span>
                <span className="tm-help-result-context">{entry.context}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {trimmed && results.length === 0 ? (
        <p className="tm-help-search-empty">
          다른 낱말로 찾아보거나, <Link className="tm-ps-text-link" href="/faq">자주 묻는 질문 전체</Link>를 훑어보세요.
          그래도 없다면 <Link className="tm-ps-text-link" href="/contact">문의 창구</Link>로 알려 주세요.
        </p>
      ) : null}
    </div>
  );
}
