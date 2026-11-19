'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AdminReasonConfirmDialog } from './admin-reason-confirm-dialog';
import { useMemberAccessStatus, useMemberAccessTransition, MEMBER_ACCESS_HINT, hasMemberAccessHint } from '@/hooks/use-member-access';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { SectionTitle } from '@/components/v1-ui/primitives';

export function MemberAccessStartButton({ userId, enabled }: { userId: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const transition = useMemberAccessTransition(userId);
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
      <SectionTitle title="회원으로 접속" compact />
      <p className="mt-2 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">10분 동안 이 회원의 화면을 조회해요. 신청·수정·전송은 차단되며 접속 사유와 시작·종료가 기록돼요.</p>
      <button type="button" disabled={!enabled || transition.isPending} onClick={() => { transition.reset(); setOpen(true); }}
        className="mt-4 min-h-[44px] w-full rounded-xl bg-[var(--blue50)] px-4 font-semibold text-[var(--blue700)] disabled:cursor-not-allowed disabled:opacity-50">회원 화면 조회</button>
      <AdminReasonConfirmDialog open={open} title="회원 화면 조회" description={<><p>관리자 로그인은 유지돼요. 활성 일반 회원만 조회할 수 있으며 시작하려면 최근 30분 안에 로그인한 관리자 세션이 필요해요.</p>{transition.isError ? <p role="alert" className="mt-3 text-[var(--red700)]">{extractErrorMessage(transition.error, '회원 조회를 시작하지 못했어요.')}</p> : null}</>}
        reasonLabel="접속 사유" reasonPlaceholder="확인하려는 문제를 5자 이상 입력해 주세요." submitLabel="조회 시작" pendingLabel="조회 시작 중" tone="primary"
        pending={transition.isPending} onSubmit={(reason) => transition.mutate({ reason })} onClose={() => setOpen(false)} />
    </section>
  );
}

export function MemberAccessBanner() {
  const status = useMemberAccessStatus();
  const transition = useMemberAccessTransition();
  const client = useQueryClient();
  const [hint, setHint] = useState(false);
  const bannerRef = useRef<HTMLElement>(null);
  const wasActive = useRef(false);
  useEffect(() => {
    setHint(hasMemberAccessHint());
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MEMBER_ACCESS_HINT) return;
      disconnectV1Socket(); clearV1IdentityCache(client); window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [client]);
  const access = status.data;
  useEffect(() => {
    if (access?.active) { wasActive.current = true; return; }
    if (access?.active !== false || (!wasActive.current && !hint)) return;
    // Storage events may be unavailable: polling still detects another tab ending the shared cookie session.
    wasActive.current = false;
    disconnectV1Socket(); clearV1IdentityCache(client);
    try { window.localStorage.removeItem(MEMBER_ACCESS_HINT); }
    catch { console.warn('회원 조회 표시를 정리하지 못했어요. 페이지를 새로 불러와요.'); }
    window.location.assign('/admin/users');
  }, [access?.active, client, hint]);
  const visible = Boolean(access?.active || (hint && !status.isSuccess));
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    root.dataset.memberAccess = 'true';
    const measure = () => root.style.setProperty('--member-access-height', `${Math.ceil(bannerRef.current?.getBoundingClientRect().height ?? 0)}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (bannerRef.current) observer?.observe(bannerRef.current);
    return () => { observer?.disconnect(); delete root.dataset.memberAccess; root.style.removeProperty('--member-access-height'); };
  }, [visible]);
  if (!visible) return null;
  return (
    <>
    <div aria-hidden="true" style={{ height: 'var(--member-access-height, 0px)' }} />
    <aside ref={bannerRef} aria-label="회원 조회 세션" className="tm-member-access-banner border-b border-[var(--border)] bg-[var(--card-surface)] px-5 py-3 text-[var(--text-strong)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-bold">{access?.active && access.label ? `${access.label} 회원 화면 조회 중` : '회원 조회 세션 확인'} · 조회 전용</p>
          <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            {access?.active && access.unavailable ? access.message : access?.active && access.expiresAt ? `${formatAdminDateTime(access.expiresAt)}까지 · 신청·수정·전송할 수 없어요.` : '세션 상태를 확인하지 못했어요. 관리자 복귀 후 다시 시작해 주세요.'}
          </p>
          {transition.isError ? <p role="alert" className="mt-1 text-[var(--red700)]">{extractErrorMessage(transition.error, '관리자 복귀에 실패했어요. 다시 시도해 주세요.')}</p> : null}
        </div>
        <button type="button" disabled={transition.isPending} onClick={() => transition.mutate({ stop: true })}
          className="min-h-[44px] shrink-0 rounded-xl bg-[var(--blue50)] px-4 font-semibold text-[var(--blue700)] disabled:opacity-50">{transition.isPending ? '복귀 중' : '관리자 복귀'}</button>
      </div>
    </aside>
    </>
  );
}
