'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, User as UserIcon, Users, AlertTriangle, X } from 'lucide-react';
import { useV1AdminSendPush, useV1AdminUsers } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { EntityPicker, type EntityPickerItem } from './entity-picker';
import { useAdminToast, AdminToasts } from './admin-toast';
import type { V1AdminPushSendPayload, V1AdminPushSendResult, V1AdminPushSendTarget } from '@/types/api';

// ── Constants ────────────────────────────────────────────────────────────
const TITLE_MAX = 60;
const BODY_MAX = 200;

function formatUserLabel(user: { nickname: string | null; displayName: string | null; email: string | null }) {
  return user.nickname ?? user.displayName ?? user.email ?? '이름 없음';
}

function segmentButtonClass(active: boolean) {
  return [
    'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-[var(--font-size-body-sm)] font-semibold transition-colors',
    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
    active
      ? 'bg-blue-500 text-white'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
  ].join(' ');
}

// ── Broadcast confirm dialog (mirrors AdminReasonModal/GrantModal inline dialog pattern) ──
interface BroadcastConfirmModalProps {
  open: boolean;
  pending: boolean;
  title: string;
  onConfirm: () => void;
  onClose: () => void;
}

function BroadcastConfirmModal({ open, pending, title, onConfirm, onClose }: BroadcastConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmButtonRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

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
    const panel = panelRef.current;
    if (!panel) return;
    const sel = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(sel));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
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
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="push-broadcast-confirm-title"
        aria-describedby="push-broadcast-confirm-desc"
        className="bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-[440px] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 id="push-broadcast-confirm-title" className="text-[16px] font-bold text-gray-900 flex items-center gap-1.5">
            <AlertTriangle size={17} className="text-amber-500" aria-hidden="true" />
            전체 발송 확인
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-3">
          <p id="push-broadcast-confirm-desc" className="text-[14px] text-gray-700 leading-relaxed">
            현재 웹 푸시를 구독 중인 <strong>모든 회원</strong>에게 아래 알림을 발송해요. 이 작업은 되돌릴 수 없어요.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3">
            <p className="text-[11px] font-semibold text-gray-400 mb-0.5">제목</p>
            <p className="text-[14px] font-semibold text-gray-900 break-words">{title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            취소
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            {pending ? '발송 중…' : '전체 발송'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Result stat tile ─────────────────────────────────────────────────────
function ResultStat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'neutral' | 'danger' }) {
  const toneClass =
    tone === 'success'
      ? 'text-blue-600 bg-blue-50'
      : tone === 'danger'
        ? 'text-red-600 bg-red-50'
        : 'text-gray-600 bg-gray-100';
  return (
    <div className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-3.5 ${toneClass}`}>
      <span className="text-[20px] font-bold tabular-nums">{value}</span>
      <span className="text-[12px] font-medium">{label}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────
export function PushSendForm() {
  const [target, setTarget] = useState<V1AdminPushSendTarget>('user');
  const [query, setQuery] = useState('');
  const [pickedUser, setPickedUser] = useState<EntityPickerItem | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<V1AdminPushSendResult | null>(null);

  const { toasts, showToast } = useAdminToast();
  const sendMutation = useV1AdminSendPush();
  const { data: usersPage, isPending: usersPending } = useV1AdminUsers(
    query ? { q: query, limit: 10 } : undefined,
  );

  const trimmedTitle = title.trim();
  const canSubmit =
    trimmedTitle.length > 0 &&
    !sendMutation.isPending &&
    (target === 'broadcast' || !!pickedUser);

  function buildPayload(): V1AdminPushSendPayload {
    return {
      target,
      userId: target === 'user' ? (pickedUser?.id ?? undefined) : undefined,
      title: trimmedTitle,
      body: body.trim() || undefined,
      url: url.trim() || undefined,
    };
  }

  function executeSend() {
    sendMutation.mutate(buildPayload(), {
      onSuccess: (data) => {
        setResult(data);
        showToast(
          `발송 완료 — 성공 ${data.sent}건 · 스킵 ${data.skipped}건 · 실패 ${data.failed}건`,
          data.failed > 0 ? 'error' : 'success',
        );
        setConfirmOpen(false);
        setTitle('');
        setBody('');
        setUrl('');
        setPickedUser(null);
      },
      onError: (err) => {
        showToast(extractErrorMessage(err, '푸시 발송에 실패했어요.'), 'error');
        setConfirmOpen(false);
      },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // 브로드캐스트는 파급력이 크므로 확인 모달을 거쳐야만 실제 발송된다.
    if (target === 'broadcast') {
      setConfirmOpen(true);
      return;
    }
    executeSend();
  }

  const userItems: EntityPickerItem[] = (usersPage?.items ?? []).map((user) => ({
    id: user.userId,
    label: formatUserLabel(user),
    description: user.email ?? undefined,
  }));

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-5 bg-white border border-gray-100 rounded-2xl p-5 md:p-6"
      >
        {/* Target toggle */}
        <div className="flex flex-col gap-1.5">
          <span id="push-send-target-label" className="text-[var(--font-size-label)] font-semibold text-gray-700">
            발송 대상
          </span>
          <div role="radiogroup" aria-labelledby="push-send-target-label" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={target === 'user'}
              onClick={() => {
                setTarget('user');
                setResult(null);
              }}
              disabled={sendMutation.isPending}
              className={segmentButtonClass(target === 'user')}
            >
              <UserIcon size={15} aria-hidden="true" />
              특정 유저
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={target === 'broadcast'}
              onClick={() => {
                setTarget('broadcast');
                setResult(null);
              }}
              disabled={sendMutation.isPending}
              className={segmentButtonClass(target === 'broadcast')}
            >
              <Users size={15} aria-hidden="true" />
              전체 구독자
            </button>
          </div>
        </div>

        {/* User picker */}
        {target === 'user' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="push-send-user" className="text-[var(--font-size-label)] font-semibold text-gray-700">
              받는 사람
            </label>
            <EntityPicker
              id="push-send-user"
              value={pickedUser}
              onChange={setPickedUser}
              items={userItems}
              onSearch={setQuery}
              loading={usersPending}
              placeholder="닉네임 또는 이메일 검색"
              disabled={sendMutation.isPending}
              emptyText="결과가 없어요."
            />
          </div>
        )}

        {/* Broadcast notice */}
        {target === 'broadcast' && (
          <p
            role="note"
            className="text-[var(--font-size-label)] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3 flex items-start gap-2"
          >
            <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            현재 웹 푸시를 구독 중인 모든 회원에게 발송돼요. 공지 알림을 꺼둔 회원은 자동으로 제외돼요.
          </p>
        )}

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="push-send-title" className="text-[var(--font-size-label)] font-semibold text-gray-700">
            제목 <span className="text-red-500" aria-hidden="true">*</span>
            <span className="sr-only">(필수)</span>
          </label>
          <input
            id="push-send-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            disabled={sendMutation.isPending}
            placeholder="알림 제목을 입력해 주세요."
            aria-required="true"
            className={[
              'h-[44px] px-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900',
              'placeholder:text-gray-400',
              'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'transition-colors disabled:opacity-50',
            ].join(' ')}
          />
          <p className="text-[var(--font-size-micro)] text-right text-gray-400 tabular-nums">
            {title.length} / {TITLE_MAX}
          </p>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="push-send-body" className="text-[var(--font-size-label)] font-semibold text-gray-700">
            내용
          </label>
          <textarea
            id="push-send-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BODY_MAX}
            rows={3}
            disabled={sendMutation.isPending}
            placeholder="알림 내용을 입력해 주세요. (선택)"
            className={[
              'px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 resize-none',
              'placeholder:text-gray-400',
              'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'transition-colors disabled:opacity-50',
            ].join(' ')}
          />
          <p className="text-[var(--font-size-micro)] text-right text-gray-400 tabular-nums">
            {body.length} / {BODY_MAX}
          </p>
        </div>

        {/* URL */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="push-send-url" className="text-[var(--font-size-label)] font-semibold text-gray-700">
            이동 링크 <span className="text-gray-400 font-normal">(선택)</span>
          </label>
          <input
            id="push-send-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={sendMutation.isPending}
            placeholder="/notices/123"
            className={[
              'h-[44px] px-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900',
              'placeholder:text-gray-400',
              'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'transition-colors disabled:opacity-50',
            ].join(' ')}
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            'inline-flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl text-[var(--font-size-body)] font-semibold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
            canSubmit
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-blue-200 text-white cursor-not-allowed',
          ].join(' ')}
          aria-disabled={!canSubmit}
        >
          <Send size={16} aria-hidden="true" />
          {sendMutation.isPending
            ? '발송 중…'
            : target === 'broadcast'
              ? '전체 발송 확인'
              : '발송하기'}
        </button>
      </form>

      {/* Result summary */}
      {result && (
        <div
          role="status"
          aria-live="polite"
          className="grid grid-cols-3 gap-3"
          data-testid="push-send-result"
        >
          <ResultStat label="성공" value={result.sent} tone="success" />
          <ResultStat label="스킵" value={result.skipped} tone="neutral" />
          <ResultStat label="실패" value={result.failed} tone={result.failed > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      <BroadcastConfirmModal
        open={confirmOpen}
        pending={sendMutation.isPending}
        title={trimmedTitle}
        onConfirm={executeSend}
        onClose={() => {
          if (!sendMutation.isPending) setConfirmOpen(false);
        }}
      />

      <AdminToasts toasts={toasts} />
    </div>
  );
}
