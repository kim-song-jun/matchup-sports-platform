'use client';

import { useEffect, useRef } from 'react';
import { openOverlay, releaseOverlay } from '@/lib/overlay-history';

export interface OverlayHistoryOptions {
  open: boolean;
  onClose: () => void;
  /** true 동안 뒤로가기로 닫지 않는다(제출 중) — 항목만 되돌린다. */
  locked?: boolean;
  enabled?: boolean;
}

/**
 * 뒤로가기(브라우저·Android·iOS 스와이프)로 닫히는 오버레이. useModalA11y 가 기본으로 부르고,
 * 그 훅을 쓰지 않는 드로어·자체 다이얼로그는 이 훅을 직접 부른다.
 */
export function useOverlayHistory({ open, onClose, locked = false, enabled = true }: OverlayHistoryOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    if (!open || !enabled) return;
    const id = openOverlay({ close: () => onCloseRef.current(), locked: () => lockedRef.current });
    return () => releaseOverlay(id);
  }, [open, enabled]);
}
