'use client';

import { useEffect, useRef } from 'react';
import { X, Copy } from 'lucide-react';
import { useAdminErrorLog } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { useAdminToast, AdminToasts } from '@/components/admin';
import type { V1AdminErrorLogDetail } from '@/types/api';

// ── Props ─────────────────────────────────────────────────────────────────
interface ErrorLogDetailModalProps {
  id: string | null;
  open: boolean;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * 값이 없을 때의 표기를 호출부가 정한다. 화면에는 '없음'이 읽기 좋지만, 마크다운 복사본은
 * ```json 펜스 안에 들어가므로 '없음'을 넣으면 유효한 JSON이 아니게 된다 — 이슈에 그대로
 * 붙여넣는 것이 이 버튼의 용도라 복사 쪽은 `null`을 쓴다.
 */
function safeJsonStringify(value: unknown, emptyLabel = '없음'): string {
  if (value === null || value === undefined) return emptyLabel;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 마크다운 코드펜스 안에 들어갈 JSON — 값 없음은 JSON으로도 유효한 null 로 적는다. */
function jsonForMarkdown(value: unknown): string {
  return safeJsonStringify(value, 'null');
}

function metaMarkdown(detail: V1AdminErrorLogDetail): string {
  return [
    '## 메타',
    `- source: ${detail.source}`,
    `- level: ${detail.level}`,
    `- statusCode: ${detail.statusCode ?? '없음'}`,
    `- errorCode: ${detail.errorCode ?? '없음'}`,
    `- 최초 발생: ${formatAdminDateTime(detail.firstSeenAt)}`,
    `- 최종 발생: ${formatAdminDateTime(detail.lastSeenAt)}`,
    `- 발생 횟수: ${detail.occurrenceCount.toLocaleString('ko-KR')}`,
    `- userId: ${detail.userId ?? '없음'}`,
    `- userAgent: ${detail.userAgent ?? '없음'}`,
    `- 서버 버전: ${detail.releaseSha ?? '없음'}`,
  ].join('\n');
}

function tracebackMarkdown(detail: V1AdminErrorLogDetail): string {
  return ['## Traceback', '```', detail.stack ?? '(스택 트레이스 없음)', '```'].join('\n');
}

function requestMarkdown(detail: V1AdminErrorLogDetail): string {
  return [
    '## Request',
    `- method: ${detail.method ?? '없음'}`,
    `- route: ${detail.route ?? '없음'}`,
    '### headers',
    '```json',
    jsonForMarkdown(detail.requestHeaders),
    '```',
    '### body',
    '```json',
    jsonForMarkdown(detail.requestBody),
    '```',
  ].join('\n');
}

function responseMarkdown(detail: V1AdminErrorLogDetail): string {
  return [
    '## Response',
    `- statusCode: ${detail.statusCode ?? '없음'}`,
    `- errorCode: ${detail.errorCode ?? '없음'}`,
    '### body',
    '```json',
    jsonForMarkdown(detail.responseBody),
    '```',
  ].join('\n');
}

function contextMarkdown(detail: V1AdminErrorLogDetail): string {
  return ['## Context', '```json', jsonForMarkdown(detail.context), '```'].join('\n');
}

function fullMarkdown(detail: V1AdminErrorLogDetail): string {
  return [
    `# ${detail.message}`,
    metaMarkdown(detail),
    tracebackMarkdown(detail),
    requestMarkdown(detail),
    responseMarkdown(detail),
    contextMarkdown(detail),
  ].join('\n\n');
}

// ── Component ─────────────────────────────────────────────────────────────
export function ErrorLogDetailModal({ id, open, onClose }: ErrorLogDetailModalProps) {
  const { data: detail, isLoading, isError, error } = useAdminErrorLog(id ?? '');
  const { toasts, showToast } = useAdminToast();

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // 열릴 때 이전 포커스 저장, 닫힐 때 복원 (WCAG 2.4.3)
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
      previousFocusRef.current = null;
    }
  }, [open]);

  // 열릴 때 닫기 버튼에 포커스
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => closeBtnRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // focus trap
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

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
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  // body 스크롤 잠금
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} 복사했어요.`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, `${label} 복사에 실패했어요.`), 'error');
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Panel */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="error-log-detail-title"
          className="bg-[var(--card-surface)] rounded-2xl shadow-[0_8px_32px_rgba(20,28,45,0.14)] w-full max-w-[720px] max-h-[85vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)] shrink-0">
            <h2
              id="error-log-detail-title"
              className="text-[16px] font-bold text-[var(--text-strong)] truncate"
            >
              {detail ? detail.message : '에러 상세'}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              {detail && (
                <button
                  type="button"
                  onClick={() => void copyToClipboard(fullMarkdown(detail), '전체 내용을')}
                  className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-semibold text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] dark:hover:bg-blue-950/60 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  <Copy size={14} aria-hidden="true" />
                  전체 복사
                </button>
              )}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                aria-label="모달 닫기"
                className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto px-5 py-5 flex flex-col gap-6">
            {isLoading && (
              <p className="text-sm text-[var(--text-muted)]">불러오는 중…</p>
            )}
            {isError && (
              <p className="text-sm text-[var(--red700)]">
                {extractErrorMessage(error, '에러 상세를 불러오지 못했어요.')}
              </p>
            )}
            {detail && (
              <>
                {/* 메타 */}
                <Section
                  title="메타"
                  onCopy={() => void copyToClipboard(metaMarkdown(detail), '메타 정보를')}
                >
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                    <MetaRow label="최초 발생" value={formatAdminDateTime(detail.firstSeenAt)} />
                    <MetaRow label="최종 발생" value={formatAdminDateTime(detail.lastSeenAt)} />
                    <MetaRow label="발생 횟수" value={detail.occurrenceCount.toLocaleString('ko-KR')} />
                    <MetaRow label="userId" value={detail.userId ?? '—'} mono />
                    <MetaRow label="userAgent" value={detail.userAgent ?? '—'} mono />
                    <MetaRow label="서버 버전" value={detail.releaseSha ?? '—'} mono />
                  </dl>
                </Section>

                {/* Traceback */}
                <Section
                  title="Traceback"
                  onCopy={() => void copyToClipboard(tracebackMarkdown(detail), 'Traceback을')}
                >
                  <CodeBlock content={detail.stack ?? '스택 트레이스가 없어요.'} />
                </Section>

                {/* Request */}
                <Section
                  title="Request"
                  onCopy={() => void copyToClipboard(requestMarkdown(detail), 'Request를')}
                >
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px] mb-3">
                    <MetaRow label="method" value={detail.method ?? '—'} mono />
                    <MetaRow label="route" value={detail.route ?? '—'} mono />
                  </dl>
                  <p className="text-[12px] font-semibold text-[var(--text-muted)] mb-1">headers</p>
                  <CodeBlock content={safeJsonStringify(detail.requestHeaders)} />
                  <p className="text-[12px] font-semibold text-[var(--text-muted)] mb-1 mt-3">body</p>
                  <CodeBlock content={safeJsonStringify(detail.requestBody)} />
                </Section>

                {/* Response */}
                <Section
                  title="Response"
                  onCopy={() => void copyToClipboard(responseMarkdown(detail), 'Response를')}
                >
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px] mb-3">
                    <MetaRow label="statusCode" value={String(detail.statusCode ?? '—')} mono />
                    <MetaRow label="errorCode" value={detail.errorCode ?? '—'} mono />
                  </dl>
                  <p className="text-[12px] font-semibold text-[var(--text-muted)] mb-1">body</p>
                  <CodeBlock content={safeJsonStringify(detail.responseBody)} />
                </Section>

                {/* Context */}
                <Section
                  title="Context"
                  onCopy={() => void copyToClipboard(contextMarkdown(detail), 'Context를')}
                >
                  <CodeBlock content={safeJsonStringify(detail.context)} />
                </Section>
              </>
            )}
          </div>
        </div>
      </div>
      <AdminToasts toasts={toasts} />
    </>
  );
}

// ── Section subcomponents ────────────────────────────────────────────────
function Section({
  title,
  onCopy,
  children,
}: {
  title: string;
  onCopy: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-bold text-[var(--text-body)]">{title}</h3>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`${title} 복사`}
          className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-md text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--blue700)] hover:bg-[var(--blue50)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <Copy size={12} aria-hidden="true" />
          복사
        </button>
      </div>
      {children}
    </section>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <dt className="shrink-0 w-[92px] text-[var(--text-muted)] dark:text-[var(--text-muted)]">{label}</dt>
      <dd
        className={[
          'text-[var(--text-body)] break-all min-w-0',
          mono ? 'font-mono text-[12px]' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  return (
    <pre className="overflow-x-auto max-h-[280px] overflow-y-auto rounded-xl bg-[var(--grey100)] border border-[var(--border)] p-3 text-[12px] font-mono text-[var(--text-body)] whitespace-pre">
      {content}
    </pre>
  );
}
