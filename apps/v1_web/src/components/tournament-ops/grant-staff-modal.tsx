'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useV1TournamentStaffCandidateSearch } from '@/hooks/use-v1-api';
import type {
  V1GrantTournamentStaffPayload,
  V1TournamentField,
  V1TournamentStaffCandidate,
  V1TournamentStaffRole,
} from '@/types/api';

export interface GrantableRoleOption {
  value: Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>;
  label: string;
}

interface GrantStaffModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: V1GrantTournamentStaffPayload) => void;
  /** 후보 검색은 대회 단위 권한을 타므로 어느 대회인지 알아야 한다. */
  tournamentId: string;
  roleOptions: GrantableRoleOption[];
  fields: V1TournamentField[];
  pending?: boolean;
  errorMessage?: string | null;
}

/** 서버가 요구하는 최소 검색어 길이(SearchStaffCandidatesDto). 더 짧으면 호출하지 않는다. */
const MIN_QUERY_LENGTH = 2;

/** 타이핑마다 부르면 서버 rate limit(60초 30회)에 금방 닿는다. */
const SEARCH_DEBOUNCE_MS = 250;

function candidateLabel(candidate: V1TournamentStaffCandidate): string {
  return candidate.nickname ?? candidate.displayName ?? '이름 없는 사용자';
}

/**
 * 입력값이 왜 막혔는지 말해 준다(해요체). 종전에는 제출 버튼이 조용히 잠겨 있을 뿐이라
 * 운영자가 "왜 안 눌리는지" 알 방법이 없었다 — 특히 담당 필드 미선택이 그랬다.
 */
function validationMessage(
  selected: V1TournamentStaffCandidate | null,
  role: Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>,
  fieldId: string,
  fieldCount: number,
): string | null {
  if (selected === null) {
    return '배정할 사람을 검색해서 골라 주세요.';
  }
  if (role === 'FIELD_OPERATOR' && fieldId === '') {
    return fieldCount === 0
      ? '등록된 경기장이 없어 필드 담당자를 배정할 수 없어요. 위쪽 “경기장(필드)”에서 먼저 등록해 주세요.'
      : '필드 담당자는 담당 경기장을 골라야 해요.';
  }
  return null;
}

export function GrantStaffModal({
  open,
  onClose,
  onSubmit,
  tournamentId,
  roleOptions,
  fields,
  pending = false,
  errorMessage,
}: GrantStaffModalProps) {
  // 검색어(query)와 실제 요청에 쓰는 값(debouncedQuery)을 나눈다 — 타이핑마다 요청하면
  // 서버 rate limit 에 닿고, 요청 하나가 응답하기 전에 다음 글자가 들어오면 결과가
  // 깜빡인다.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState<V1TournamentStaffCandidate | null>(null);
  const [role, setRole] = useState<Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>>(
    roleOptions[0]?.value ?? 'SUPPORT_READONLY',
  );
  const [fieldId, setFieldId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const fieldSelectRef = useRef<HTMLSelectElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setSelected(null);
      setRole(roleOptions[0]?.value ?? 'SUPPORT_READONLY');
      setFieldId('');
      setExpiresAt('');
      setSubmitAttempted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  /**
   * 검색 입력으로 초점을 옮긴다 — 모달을 열었을 때와, 고른 사람을 "다시 고르기"로 해제해
   * 검색으로 돌아왔을 때 둘 다 해당한다. 후자를 클릭 핸들러 안에서 처리할 수 없는 이유는
   * `setSelected(null)`이 리렌더 뒤에야 반영되기 때문이다 — 핸들러가 도는 시점의 DOM 은
   * 아직 선택 카드라 검색 input 이 없고 `firstFieldRef.current`는 null 이다. 초점을 옮기지
   * 않으면 방금 누른 "다시 고르기" 버튼이 사라지면서 키보드 초점이 문서 최상단으로 날아간다.
   */
  useEffect(() => {
    if (open && selected === null) {
      const id = setTimeout(() => firstFieldRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, pending]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // 이미 사람을 고른 뒤에는 검색을 멈춘다 — 선택 결과가 입력창에 남아 있는 상태에서
  // 계속 조회하면 쓰지도 않을 명부를 불필요하게 더 읽는다.
  //
  // 지금 입력값(query)의 길이도 함께 본다. 훅 안의 하한 검사는 debouncedQuery 기준이라,
  // 검색어를 2글자 미만으로 지우는 순간부터 디바운스가 끝나기까지 250ms 동안은 직전
  // 검색어로 조회가 살아 있다 — 지우는 동작마다 쌓이면 60초 30회 한도에 더 빨리 닿는다.
  const search = useV1TournamentStaffCandidateSearch(tournamentId, debouncedQuery, {
    enabled: open && selected === null && query.trim().length >= MIN_QUERY_LENGTH,
  });

  if (!open) return null;

  const trimmedQuery = query.trim();
  const requiresField = role === 'FIELD_OPERATOR';
  const validationError = validationMessage(selected, role, fieldId, fields.length);
  const candidates = search.data?.items ?? [];
  // 디바운스가 끝나기 전에는 직전 검색어의 결과가 남아 있다 — 그 사이 "결과 없음"을
  // 띄우면 아직 찾는 중인데 없다고 단정하는 셈이라 입력이 안정된 뒤에만 판정한다.
  const searchSettled = trimmedQuery === debouncedQuery.trim() && !search.isFetching;
  // 버튼은 잠그지 않는다 — 눌러야 막힌 이유를 알 수 있다(제출 시 검증).
  const canSubmit = !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setSubmitAttempted(true);
    if (validationError !== null || selected === null) {
      // 막힌 입력으로 초점을 옮겨 준다 — 사유만 띄우고 커서를 그대로 두면
      // 키보드 사용자는 어디를 고쳐야 하는지 찾아다녀야 한다.
      const target = selected !== null ? fieldSelectRef.current : firstFieldRef.current;
      target?.focus();
      return;
    }
    onSubmit({
      userId: selected.id,
      role,
      ...(requiresField ? { fieldId } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-staff-modal-title"
        /* 모바일에서 폼이 화면보다 길어지면(특히 키보드가 올라온 상태) 하단의 취소·배정
           버튼이 화면 밖으로 밀려 눌 수 없었다 — 높이를 뷰포트로 묶고 본문만 스크롤시켜
           머리말과 버튼 줄은 항상 보이게 한다. 검색 결과 목록이 생기면서 길이가 더
           늘어나 이 처리 없이는 확실히 잘린다. */
        className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[440px] max-h-[calc(100dvh-32px)] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id="grant-staff-modal-title" className="text-[16px] font-bold text-[var(--text-strong)]">
            스태프 배정
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0">
          <div className="px-5 py-5 flex flex-col gap-4 overflow-y-auto">
            {/* 예전에는 이 자리가 사용자 UUID 직접 입력이었고 안내는 "어드민 > 사용자
                관리에서 ID를 복사해 오라"였다 — 어드민이 아닌 대회 디렉터는 그 화면에
                들어갈 수 없으므로 사실상 배정할 방법이 없었다(2026-08-13 사용자 제보).
                닉네임으로 찾아 고르는 방식으로 바꾼다. */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-staff-user-search" className="text-[13px] font-semibold text-[var(--text-body)]">
                배정할 사람 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                <span className="sr-only">(필수)</span>
              </label>

              {selected !== null ? (
                <div className="flex items-center gap-3 min-h-[44px] px-3 py-2 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-semibold text-[var(--text-strong)] truncate">
                      {candidateLabel(selected)}
                    </span>
                    {selected.maskedEmail !== null && (
                      <span className="text-[12px] text-[var(--text-muted)] truncate">{selected.maskedEmail}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setQuery('');
                      // debouncedQuery 도 함께 비운다 — 이걸 남겨 두면 선택이 풀리는 순간
                      // enabled 가 다시 켜지면서 직전 검색어로 쓸모없는 조회가 한 번 더
                      // 나간다(서버 rate limit 에 불리). 초점 이동은 이 자리에서 하지
                      // 않는다 — 아래 effect 참고.
                      setDebouncedQuery('');
                    }}
                    disabled={pending}
                    className="shrink-0 h-[44px] px-3 text-[13px] font-semibold text-[var(--text-muted)] rounded-lg hover:bg-gray-200 dark:hover:bg-white/20 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
                  >
                    다시 고르기
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      size={16}
                      aria-hidden="true"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                    <input
                      id="grant-staff-user-search"
                      ref={firstFieldRef}
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      disabled={pending}
                      placeholder="닉네임으로 검색"
                      autoComplete="off"
                      aria-describedby="grant-staff-user-search-help"
                      aria-invalid={submitAttempted && selected === null ? true : undefined}
                      className="w-full h-[44px] pl-9 pr-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
                    />
                  </div>

                  {/* 결과 수는 화면에 목록으로 보이지만, 스크린리더는 목록이 조용히 바뀌는
                      것을 알 수 없다 — aria-live 로 검색 상태를 말해 준다. */}
                  <p className="sr-only" role="status" aria-live="polite">
                    {trimmedQuery.length < MIN_QUERY_LENGTH
                      ? ''
                      : !searchSettled
                        ? '검색 중이에요.'
                        : `검색 결과 ${candidates.length}명`}
                  </p>

                  {trimmedQuery.length >= MIN_QUERY_LENGTH && (
                    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                      {search.isError ? (
                        <p className="px-3 py-3 text-[13px] text-[var(--red700)]">
                          검색하지 못했어요. 잠시 후 다시 시도해 주세요.
                        </p>
                      ) : !searchSettled ? (
                        <p className="px-3 py-3 text-[13px] text-[var(--text-muted)]">검색 중이에요…</p>
                      ) : candidates.length === 0 ? (
                        <p className="px-3 py-3 text-[13px] text-[var(--text-muted)]">
                          검색 결과가 없어요. 닉네임을 정확히 입력했는지 확인해 주세요.
                        </p>
                      ) : (
                        <ul className="max-h-[200px] overflow-y-auto">
                          {candidates.map((candidate) => (
                            <li key={candidate.id} className="border-b border-[var(--border)] last:border-b-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelected(candidate);
                                  setQuery('');
                                }}
                                disabled={pending}
                                className="w-full min-h-[44px] px-3 py-2 flex flex-col items-start text-left hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:-outline-offset-2 disabled:opacity-50"
                              >
                                <span className="text-sm font-semibold text-[var(--text-strong)] truncate max-w-full">
                                  {candidateLabel(candidate)}
                                </span>
                                {candidate.maskedEmail !== null && (
                                  <span className="text-[12px] text-[var(--text-muted)] truncate max-w-full">
                                    {candidate.maskedEmail}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <p id="grant-staff-user-search-help" className="text-[12px] text-[var(--text-muted)]">
                    닉네임 {MIN_QUERY_LENGTH}글자 이상으로 찾을 수 있어요. 이메일은 전체를 정확히 입력해야 찾아져요.
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-staff-role" className="text-[13px] font-semibold text-[var(--text-body)]">
                역할
              </label>
              <select
                id="grant-staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>)}
                disabled={pending}
                className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
              >
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {requiresField && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="grant-staff-field" className="text-[13px] font-semibold text-[var(--text-body)]">
                  담당 필드 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
                  <span className="sr-only">(필수)</span>
                </label>
                <select
                  id="grant-staff-field"
                  ref={fieldSelectRef}
                  value={fieldId}
                  onChange={(e) => setFieldId(e.target.value)}
                  disabled={pending || fields.length === 0}
                  aria-describedby="grant-staff-field-help"
                  className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
                >
                  <option value="">{fields.length === 0 ? '등록된 경기장이 없어요' : '필드를 선택해주세요'}</option>
                  {fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))}
                </select>
                {/* 등록된 필드가 하나도 없으면 이 select 는 영영 비어 있고 제출 버튼도 계속 잠긴다.
                    잠긴 이유와 다음 행동을 적지 않으면 운영자는 "필드"가 뭔지도 모른 채 막힌다(#373). */}
                <p id="grant-staff-field-help" className="text-[12px] text-[var(--text-muted)]">
                  {fields.length === 0
                    ? '필드는 경기가 열리는 코트·구장이에요. 스태프 화면 위쪽 “경기장(필드)”에서 먼저 등록해 주세요.'
                    : '이 담당자가 맡을 코트·구장이에요. 배정하면 그 경기장의 경기만 담당해요.'}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-staff-expires" className="text-[13px] font-semibold text-[var(--text-body)]">
                만료 시각 (선택)
              </label>
              <input
                id="grant-staff-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={pending}
                className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
              />
            </div>

            {/* 배정 후 그 사람이 어디로 들어가는지 — 배정만 하고 "이제 뭘 하라고 전해야
                하는지"를 모르면 배정이 끝나도 현장은 그대로 막힌다. */}
            <p className="text-[12px] text-[var(--text-muted)] leading-relaxed bg-[var(--surface-soft)] rounded-xl px-3 py-2">
              {requiresField
                ? '배정하면 그분은 마이페이지 → “대회 운영을 맡고 있어요”에서 담당 경기 기록 화면으로 바로 들어갈 수 있어요.'
                : '배정하면 그분은 마이페이지 → “대회 운영을 맡고 있어요”에서 이 대회 운영 보드로 들어갈 수 있어요.'}
            </p>

            {submitAttempted && validationError !== null && (
              <p className="text-[13px] text-[var(--red700)]" role="alert">
                {validationError}
              </p>
            )}

            {errorMessage && (
              <p className="text-[13px] text-[var(--red700)]" role="alert">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2 px-5 pb-5 pt-1">
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-gray-200 dark:hover:bg-white/20 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                'flex-1 h-[48px] rounded-xl text-[15px] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                canSubmit
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-blue-200 dark:bg-blue-500/30 text-white cursor-not-allowed',
              ].join(' ')}
            >
              {pending ? '배정 중…' : '배정하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
