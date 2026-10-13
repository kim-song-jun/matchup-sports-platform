'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@/lib/app-store-links';
import { reportClientError } from '@/lib/client-error-reporter';
import { canCheckNativeAppUpdate, NATIVE_UPDATE_READY_EVENT, requestNativeAppUpdate, type NativeAppUpdateResult } from '@/lib/native-app-update';

const RECHECK_INTERVAL_MS = 3 * 60_000;
const FOCUS_THROTTLE_MS = 1_000;

/** Store-confirmed native binary updates; separate from the web asset release watcher. */
export function NativeAppUpdateGate() {
  const [required, setRequired] = useState<NativeAppUpdateResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const checkRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    let pending: AbortController | null = null;
    let lastCheck = -Infinity;
    const check = async (force = false) => {
      if (disposed || pending || document.visibilityState === 'hidden' || !canCheckNativeAppUpdate()) return;
      if (!force && Date.now() - lastCheck < FOCUS_THROTTLE_MS) return;
      lastCheck = Date.now();
      const controller = new AbortController();
      pending = controller;
      setChecking(true);
      try {
        const result = await requestNativeAppUpdate(controller.signal);
        if (disposed) return;
        if (result.channel === 'alpha') return;
        if (result.status === 'unavailable') throw new Error(result.error || 'native-update-unavailable');
        setFailed(false);
        setRequired(result.status === 'update-required' ? result : null);
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        // A failed lookup cannot revoke a previously confirmed mandatory update.
        setFailed(true);
        reportClientError({ message: '앱 업데이트 확인 실패', level: 'warn', context: {
          flow: 'native-app-update', reason: error instanceof Error ? error.message : 'unknown',
        } });
      } finally {
        if (pending === controller) {
          pending = null;
          if (!disposed) setChecking(false);
        }
      }
    };
    const onForeground = () => { void check(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pending?.abort();
        pending = null;
      }
      else void check(true);
    };
    const onReady = () => { void check(true); };
    checkRef.current = () => { void check(true); };
    void check();
    const interval = window.setInterval(onForeground, RECHECK_INTERVAL_MS);
    window.addEventListener('focus', onForeground);
    window.addEventListener('pageshow', onForeground);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(NATIVE_UPDATE_READY_EVENT, onReady);
    return () => {
      disposed = true;
      pending?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onForeground);
      window.removeEventListener('pageshow', onForeground);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(NATIVE_UPDATE_READY_EVENT, onReady);
    };
  }, []);

  if (!required) return null;
  return <RequiredUpdateDialog result={required} checking={checking} failed={failed} onCheck={() => checkRef.current()} />;
}

function RequiredUpdateDialog({ result, checking, failed, onCheck }: {
  result: NativeAppUpdateResult; checking: boolean; failed: boolean; onCheck: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { dialogRef } = useModalA11y<HTMLAnchorElement, HTMLDialogElement>({
    open: true, onClose: onCheck, pending: true, closeOnBack: false, initialFocus: 'dialog',
  });
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    // Native dialog top-layer keeps all other modals and background controls inert.
    dialog?.showModal();
    return () => dialog?.close();
  }, [dialogRef]);
  const store = result.platform === 'android' ? 'Google Play' : 'App Store';
  return createPortal(
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onCancel={(event) => event.preventDefault()}
      className="tm-native-update-dialog"
    >
      <div className="tm-native-update-content">
        <BrandMark size={56} />
        <h2 id={titleId} className="tm-text-heading">팀밋 업데이트가 필요해요</h2>
        <p id={descriptionId} className="tm-text-body" style={{ color: 'var(--text-muted)' }}>
          새 버전으로 업데이트한 후 계속 이용할 수 있어요.<br />{store}에서 업데이트해 주세요.
        </p>
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          현재 버전 {result.version}{result.availableVersion ? ` · 새 버전 ${result.availableVersion}` : ''}
        </p>
        <a className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          href={result.platform === 'android' ? ANDROID_PLAY_STORE_URL : IOS_APP_STORE_URL}>
          {store}에서 업데이트
        </a>
        <button type="button" className="tm-btn tm-btn-lg tm-btn-ghost tm-btn-block" onClick={onCheck} disabled={checking}>
          {checking ? '버전 확인 중…' : '업데이트 다시 확인'}
        </button>
        {failed && <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
          버전을 확인하지 못했어요. 인터넷 연결 후 다시 확인해 주세요.
        </p>}
      </div>
    </dialog>, document.body,
  );
}
