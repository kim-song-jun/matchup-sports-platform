'use client';

import { useEffect, useState } from 'react';
import { Send, User as UserIcon, Users, AlertTriangle, X } from 'lucide-react';
import { useModalA11y } from '../v1-ui/use-modal-a11y';
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
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-[length:var(--font-size-body-sm)] font-semibold transition-colors',
    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
    active
      ? 'bg-blue-500 text-white'
      : 'bg-[var(--surface-soft)] text-[var(--text-muted)] hover:bg-[var(--grey300)]',
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
  const {
    dialogRef: panelRef,
    initialFocusRef: confirmButtonRef,
    onBackdropClick,
    mounted,
    closing,
  } = useModalA11y<HTMLButtonElement>({ open, onClose, pending });

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px] tm-modal-scrim${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="push-broadcast-confirm-title"
        aria-describedby="push-broadcast-confirm-desc"
        className={`bg-[var(--card-surface)] rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-[440px] overflow-hidden tm-modal-panel${closing ? ' is-closing' : ''}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id="push-broadcast-confirm-title" className="text-[16px] font-bold text-[var(--text-strong)] flex items-center gap-2">
            <AlertTriangle size={17} className="text-[var(--orange500)]" aria-hidden="true" />
            전체 발송 확인
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-3">
          <p id="push-broadcast-confirm-desc" className="text-[14px] text-[var(--text-body)] leading-relaxed">
            현재 웹 푸시를 구독 중인 <strong>모든 회원</strong>에게 아래 알림을 발송해요. 이 작업은 되돌릴 수 없어요.
          </p>
          <div className="bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl px-4 py-3">
            <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)] mb-0.5">제목</p>
            <p className="text-[14px] font-semibold text-[var(--text-strong)] break-words">{title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            className="flex-1 h-[48px] rounded-xl text-[15px] font-semibold text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
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
      ? 'text-[var(--blue700)] bg-[var(--blue50)]'
      : tone === 'danger'
        ? 'text-[var(--red700)] bg-[var(--red50)]'
        : 'text-[var(--text-muted)] bg-[var(--surface-soft)]';
  return (
    <div className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-4 ${toneClass}`}>
      <span className="text-[20px] font-bold tabular-nums">{value}</span>
      <span className="text-[12px] font-medium">{label}</span>
    </div>
  );
}

/**
 * 웹 푸시 도달 상황 한 줄 요약.
 *
 * "앱 알림 생성" 숫자만 보면 푸시까지 나간 것으로 읽히지만, 구독이 0건이면 푸시는
 * 한 건도 나가지 않는다(알림함에만 남는다). 그 상태를 숫자 대신 문장으로 밝힌다.
 */
function PushDeliveryNote({
  push,
}: {
  push: NonNullable<V1AdminPushSendResult['push']>;
}) {
  const tone =
    push.disabled || push.failed > 0
      ? 'border-[var(--tint-red-border)] bg-[var(--red50)] text-[var(--red700)]'
      : push.subscriptions === 0
        ? 'border-[var(--tint-orange-border)] bg-[var(--orange50)] text-[var(--orange700)]'
        : 'border-[var(--tint-blue-border)] bg-[var(--blue50)] text-[var(--blue700)]';

  const message = push.disabled
    ? '서버에 VAPID 키가 설정되지 않아 웹 푸시가 꺼져 있어요. 알림함에만 남았어요.'
    : push.subscriptions === 0
      ? '브라우저 알림을 켠 사용자가 없어 푸시는 나가지 않았어요. 알림함에만 남았어요.'
      : `구독 ${push.subscriptions}건 중 ${push.delivered}건 전송${push.failed > 0 ? `, ${push.failed}건 실패` : ''}`;

  return (
    <p className={`rounded-xl border px-3 py-3 text-[13px] leading-relaxed ${tone}`}>
      <span className="font-semibold">웹 푸시 </span>
      {message}
    </p>
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
        // 푸시가 한 건도 안 나간 경우를 성공 토스트로 덮지 않는다 — 상세는 아래 결과 카드에 있다.
        const pushWentNowhere = data.push ? data.push.disabled || data.push.subscriptions === 0 : false;
        showToast(
          `발송 완료 — 앱 알림 ${data.sent}건 · 스킵 ${data.skipped}건 · 실패 ${data.failed}건` +
            (pushWentNowhere ? ' (웹 푸시는 나가지 않았어요)' : ''),
          // 토스트는 success/error 두 가지뿐이라, 푸시가 아무 데도 안 간 경우도
          // '성공'으로 흘려보내지 않도록 error 로 띄워 눈에 걸리게 한다.
          data.failed > 0 || pushWentNowhere ? 'error' : 'success',
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
        className="flex flex-col gap-5 bg-[var(--card-surface)] border border-[var(--border)] rounded-2xl p-5 md:p-6"
      >
        {/* Target toggle */}
        <div className="flex flex-col gap-2">
          <span id="push-send-target-label" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
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
          <div className="flex flex-col gap-2">
            <label htmlFor="push-send-user" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
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
            className="text-[length:var(--font-size-label)] text-[var(--orange700)] bg-[var(--tint-orange)] border border-[var(--tint-orange-border)] rounded-xl px-4 py-3 flex items-start gap-2"
          >
            <AlertTriangle size={15} className="text-[var(--orange700)] shrink-0 mt-0.5" aria-hidden="true" />
            현재 웹 푸시를 구독 중인 모든 회원에게 발송돼요. 공지 알림을 꺼둔 회원은 자동으로 제외돼요.
          </p>
        )}

        {/* Title */}
        <div className="flex flex-col gap-2">
          <label htmlFor="push-send-title" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
            제목 <span className="text-[var(--red700)]" aria-hidden="true">*</span>
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
              'h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)]',
              'placeholder:text-[var(--text-muted)]',
              'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'transition-colors disabled:opacity-50',
            ].join(' ')}
          />
          <p className="text-[length:var(--font-size-micro)] text-right text-[var(--text-muted)] tabular-nums">
            {title.length} / {TITLE_MAX}
          </p>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-2">
          <label htmlFor="push-send-body" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
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
              'px-3 py-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
              'placeholder:text-[var(--text-muted)]',
              'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'transition-colors disabled:opacity-50',
            ].join(' ')}
          />
          <p className="text-[length:var(--font-size-micro)] text-right text-[var(--text-muted)] tabular-nums">
            {body.length} / {BODY_MAX}
          </p>
        </div>

        {/* URL */}
        <div className="flex flex-col gap-2">
          <label htmlFor="push-send-url" className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
            이동 링크 <span className="text-[var(--text-muted)] font-normal">(선택)</span>
          </label>
          <input
            id="push-send-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={sendMutation.isPending}
            placeholder="/notices/123"
            className={[
              'h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)]',
              'placeholder:text-[var(--text-muted)]',
              'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'transition-colors disabled:opacity-50',
            ].join(' ')}
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            'inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-[length:var(--font-size-body)] font-semibold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
            canSubmit
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-[var(--grey100)] text-[var(--text-caption)] cursor-not-allowed',
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
        <div role="status" aria-live="polite" className="flex flex-col gap-3" data-testid="push-send-result">
          <div className="grid grid-cols-3 gap-3">
            <ResultStat label="앱 알림 생성" value={result.sent} tone="success" />
            <ResultStat label="스킵" value={result.skipped} tone="neutral" />
            <ResultStat label="실패" value={result.failed} tone={result.failed > 0 ? 'danger' : 'neutral'} />
          </div>
          {/*
            앱 알림 생성 건수만 보면 "푸시도 갔다"고 오해하기 쉽다. 실제로는 구독이
            0건이면 푸시는 한 건도 나가지 않는다 — 그 경우를 눈에 보이게 만든다.
          */}
          {result.push && <PushDeliveryNote push={result.push} />}
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
