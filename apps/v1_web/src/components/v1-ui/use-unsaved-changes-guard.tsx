'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  addPopInterceptor,
  bufferLeaveSteps,
  currentEntryIsBuffer,
  hasPreviousSameDocumentEntry,
  markAppInitiatedBack,
  pushBufferEntry,
  replaceInApp,
} from '@/lib/navigation-history';
import { overlayHistoryIdle, overlayMarkerOf } from '@/lib/overlay-history';
import { useConfirm, type ConfirmOptions } from './confirm-modal';

export const LEAVE_CONFIRM_OPTIONS: ConfirmOptions = {
  title: '작성 중인 내용이 사라져요. 나갈까요?',
  message: '나가면 지금까지 입력한 내용은 저장되지 않아요.',
  confirmLabel: '나가기',
  cancelLabel: '계속 작성',
  tone: 'danger',
};

const hereUrl = () => `${window.location.pathname}${window.location.search}`;
// 오버레이 가로채기보다 먼저 묻는다 — 폼을 떠나는 pop 이 닫힌 오버레이의 남은 표식에 닿아도
// 표식 건너뛰기(back 예약)와 폼 되돌리기(push)가 한 pop 에서 겹치지 않게.
const GUARD_POP_PRIORITY = 10;
// Our own buffer back() whose pop never arrives is given up after this long.
const CONSUME_TIMEOUT_MS = 1000;
const EXIT_URL = '/home';
const withinScope = (pathname: string, scope: string) => pathname === scope || pathname.startsWith(`${scope}/`);

/**
 * 입력 중인 폼을 떠나기 전에 묻는다 — 헤더 뒤로가기·화면 안 링크(클릭), 브라우저·하드웨어 뒤로가기
 * (popstate), 탭 닫기(beforeunload). 입력이 없으면(isDirty=false) 아무것도 가로채지 않는다.
 * scope(경로 접두사, 기본 = 현재 경로) 안의 이동(마법사 단계·쿼리·오버레이 닫기)은 묻지 않는다.
 * 프로그램 이동(router.push)은 가로채지 않는다 — 제출 뒤 이동은 그대로, 화면의 취소·이전 버튼은
 * confirmLeave() 를 먼저 부른다.
 *
 * 돌려주는 모달을 폼 화면에 렌더해야 한다.
 *
 * Cold entry (no earlier entry in this document — deep link, refresh, new tab, app cold start): a back would
 * leave the document where no popstate can be intercepted. While dirty, one same-URL buffer entry is pushed so
 * that back becomes an interceptable pop. Leaving goes past it (go(-2), or /home when the form is the tab's
 * first entry); getting clean again takes it off with a swallowed back(); a push to another URL replaces it.
 */
export function useUnsavedChangesGuard(isDirty: boolean, { scope }: { scope?: string } = {}) {
  const { confirm, ConfirmModal } = useConfirm();
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  const releasedRef = useRef(false);
  const askingRef = useRef(false);
  const entryRef = useRef<{ url: string; state: unknown } | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const consumingRef = useRef<{ timer: ReturnType<typeof setTimeout>; waiters: Array<() => void> } | null>(null);
  const leavingRef = useRef(false);
  const exitAfterPopRef = useRef(false);

  // 되돌릴 폼 항목(URL + Next state). 매 커밋 뒤 갱신 — 오버레이 표식 항목은 폼 항목이 아니다.
  useEffect(() => {
    if (overlayMarkerOf(window.history.state) !== null) return;
    entryRef.current = { url: hereUrl(), state: window.history.state };
  });

  const finishConsume = useCallback(() => {
    const consuming = consumingRef.current;
    if (!consuming) return;
    consumingRef.current = null;
    clearTimeout(consuming.timer);
    consuming.waiters.forEach((resolve) => resolve());
  }, []);

  /** Takes the buffer off with a back() whose pop is swallowed. Resolves once it has landed. */
  const consumeBuffer = useCallback((): Promise<void> => {
    if (consumingRef.current) return new Promise((resolve) => consumingRef.current?.waiters.push(resolve));
    if (!currentEntryIsBuffer()) return Promise.resolve();
    return new Promise((resolve) => {
      consumingRef.current = { timer: setTimeout(finishConsume, CONSUME_TIMEOUT_MS), waiters: [resolve] };
      window.history.back();
    });
  }, [finishConsume]);

  /** Leave for real from the buffer: past the buffer and the form entry, or to /home when nothing is before them. */
  const leaveThroughBuffer = useCallback(() => {
    const steps = bufferLeaveSteps();
    if (steps === null) {
      exitAfterPopRef.current = true;
      window.history.back(); // off the buffer first, so the exit replaces the form entry itself
      return;
    }
    leavingRef.current = true;
    window.history.go(-steps);
  }, []);

  // Keep exactly one buffer while dirty on a cold entry; take it off once clean. Never on top of an overlay.
  useEffect(() => {
    if (consumingRef.current || leavingRef.current || exitAfterPopRef.current) return;
    if (overlayMarkerOf(window.history.state) !== null || !overlayHistoryIdle()) return;
    if (dirtyRef.current && !releasedRef.current) {
      if (!currentEntryIsBuffer() && !hasPreviousSameDocumentEntry()) pushBufferEntry();
    } else if (!dirtyRef.current && currentEntryIsBuffer()) {
      void consumeBuffer();
    }
  });

  const ask = useCallback(async () => {
    if (askingRef.current) return false;
    askingRef.current = true;
    let leave = false;
    try {
      leave = await confirm(LEAVE_CONFIRM_OPTIONS);
    } finally {
      askingRef.current = false;
    }
    if (leave) releasedRef.current = true;
    return leave;
  }, [confirm]);
  const askRef = useRef(ask);
  askRef.current = ask;

  /** 화면의 취소·이전 버튼용 — 입력이 없으면 바로 true. 나가기로 하면 버퍼를 걷은 뒤 돌려준다. */
  const confirmLeave = useCallback(async () => {
    const leave = !dirtyRef.current || releasedRef.current || (await ask());
    if (leave) await consumeBuffer();
    return leave;
  }, [ask, consumeBuffer]);

  // Lives for the whole mount — the buffer's own pops still arrive after the form turns clean.
  useEffect(() => {
    const guarded = () => dirtyRef.current && !releasedRef.current;
    const formPathname = window.location.pathname;
    const inScope = (pathname: string) => withinScope(pathname, scopeRef.current ?? formPathname);
    const removeInterceptor = addPopInterceptor((_event, pop) => {
      if (leavingRef.current) {
        leavingRef.current = false; // the leave moved within this document — an ordinary navigation
        return false;
      }
      if (pop.leftBuffer && consumingRef.current) {
        finishConsume();
        return true;
      }
      if (pop.leftBuffer && exitAfterPopRef.current) {
        exitAfterPopRef.current = false;
        replaceInApp(EXIT_URL);
        return true;
      }
      if (!guarded()) {
        // Forward onto a buffer left behind by an earlier dirty spell — step back off it.
        if (pop.direction !== 'forward' || !currentEntryIsBuffer() || !overlayHistoryIdle()) return false;
        void consumeBuffer();
        return true;
      }
      if (pop.leftBuffer && pop.samePage) {
        pushBufferEntry(); // back onto the buffer; the form stays as it is
        void askRef.current().then((leave) => {
          if (leave) leaveThroughBuffer();
        });
        return true;
      }
      const entry = entryRef.current;
      if (!entry || inScope(window.location.pathname)) return false;
      // pop 은 취소할 수 없다 — 폼 항목을 다시 쌓아 제자리로 두고, 나가기로 하면 진짜로 뒤로 간다.
      window.history.pushState(entry.state, '', entry.url);
      void askRef.current().then((leave) => {
        if (!leave) return;
        markAppInitiatedBack();
        window.history.back();
      });
      return true;
    }, { priority: GUARD_POP_PRIORITY });
    return () => {
      removeInterceptor();
      finishConsume();
    };
  }, [consumeBuffer, finishConsume, leaveThroughBuffer]);

  useEffect(() => {
    if (!isDirty) return;
    const guarded = () => dirtyRef.current && !releasedRef.current;
    const formPathname = window.location.pathname;
    const inScope = (pathname: string) => withinScope(pathname, scopeRef.current ?? formPathname);

    const onClick = (event: MouseEvent) => {
      if (!guarded() || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || inScope(url.pathname)) return;
      event.preventDefault();
      event.stopPropagation();
      // 나가기로 하면 버퍼를 걷고 같은 링크를 다시 누른다 — 헤더 뒤로가기(back/replace 판단)·Link 가 그대로 처리한다.
      void ask().then(async (leave) => {
        if (!leave) return;
        await consumeBuffer();
        anchor.click();
      });
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!guarded()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    // window capture — 문서의 링크 분류(useNavigationIntent)·Next Link 보다 먼저 막는다.
    window.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isDirty, ask, consumeBuffer]);

  return { UnsavedChangesModal: ConfirmModal, confirmLeave } as const;
}
